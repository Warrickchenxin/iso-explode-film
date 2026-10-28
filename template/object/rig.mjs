// rig.mjs — the generic skeleton every object is hung on.
// geometry.mjs calls makeRig() and builds parts with its helpers; the rig creates the
// groups the film drives (lift, layers, array bursts, wave, hero, mechanism), records
// anchors and label points, and precomputes the draw order for every pose the film uses.
import * as G from "../kit/lathe.mjs";
import { FILM, SPEC, travelOf, layerIndex, featureValues, FEATURE_DEFAULTS } from "./film.mjs";

const unit = G.unit3, add = G.add3, mul = G.mul3, sub = G.sub3, dot = G.dot3, cross = G.cross3;
export const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
// object coordinates: X right, Y toward the viewer, z up (mm). Kit world x is -X.
export const vx = (X) => -X;
export const frame = (o, a, u) => {
  const A = unit(a);
  const U = unit(sub(u, mul(A, dot(u, A))));
  return { o, a: A, u: U, v: cross(A, U) };
};
export function roundedRect(u0, v0, u1, v1, r, round = [1, 1, 1, 1], steps = 6) {
  const out = [];
  const corner = (cu, cv, a0) => {
    for (let j = 0; j <= steps; j++) {
      const a = a0 + (j / steps) * (Math.PI / 2);
      out.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
    }
  };
  if (round[0]) corner(u0 + r, v0 + r, Math.PI); else out.push([u0, v0]);
  if (round[1]) corner(u1 - r, v0 + r, 1.5 * Math.PI); else out.push([u1, v0]);
  if (round[2]) corner(u1 - r, v1 - r, 0); else out.push([u1, v1]);
  if (round[3]) corner(u0 + r, v1 - r, 0.5 * Math.PI); else out.push([u0, v1]);
  return out;
}

export function makeRig(T, { layer }) {
  const parts = {}, groups = {}, anchors = {}, features = [], explode = [];
  const reg = { wave: {}, labels: [] };
  globalThis.__ISO_REG = reg;
  const R = FILM.radius;
  const L = layer;
  const root = T.group("root", { free: { origin: [0, 0, (FILM.bounds[2][0] + FILM.bounds[2][1]) / 2] } });
  const liftG = T.group("lift", { parent: root, slide: { direction: [0, 0, 1], travel: R } });
  groups.root = root; groups.lift = liftG;
  const layerOfGroup = new Map(); // group name -> layer id
  const bbox = {}; // layer id -> world bbox
  const slider = (name, parent, dir, travel) => {
    const g = T.group(name, { parent, slide: { direction: unit(dir), travel } });
    groups[name] = g;
    if (parent && layerOfGroup.has(parent.name)) layerOfGroup.set(name, layerOfGroup.get(parent.name));
    return g;
  };

  // ---- layers ----
  const layerG = (id) => {
    const name = `L.${id}`;
    if (groups[name]) return groups[name];
    const i = layerIndex(id);
    if (i < 0) throw new Error(`rig: layer ${id} is not in SPEC.layers`);
    const tr = travelOf(i);
    const g = T.group(name, { parent: liftG, slide: { direction: [0, 0, tr >= 0 ? 1 : -1], travel: Math.abs(tr) } });
    groups[name] = g;
    layerOfGroup.set(name, id);
    explode.push({ name, travel: Math.abs(tr), delay: 0.3 * (i / Math.max(1, SPEC.layers.length - 1)) });
    return g;
  };

  // ---- arrays: sector × band groups, optional per-element wave sliders ----
  const arrayExt = {};
  const arrayGroup = (id, x, y, { element } = {}) => {
    const a = SPEC.arrays.find((q) => q.id === id);
    if (!a) throw new Error(`rig: array ${id} is not in SPEC.arrays`);
    const e = arrayExt[id];
    if (!e) throw new Error(`rig: call rig.array("${id}", {cx, cy, hx, hy}) before adding its elements`);
    const nx = (x - e.cx) / e.hx, ny = (y - e.cy) / e.hy;
    const ang = Math.atan2(ny, nx);
    const sec = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    const band = Math.min(2, Math.floor(Math.min(0.999, Math.hypot(nx, ny)) * 3));
    const name = `A.${id}.s${sec}b${band}`;
    if (!groups[name]) {
      const a2 = (sec * Math.PI) / 4, sp = (a.spread ?? 0.5) * ((band + 0.5) / 3) * 1.5;
      slider(name, layerG(a.layer), [vx(Math.cos(a2) * sp), Math.sin(a2) * sp, 1], 4 * R);
    }
    let g = groups[name];
    if (a.wave && element !== undefined) {
      const bucket = Math.min(7, Math.max(0, Math.floor(((x - (e.cx - e.hx)) / (2 * e.hx)) * 8)));
      const wn = `W.${id}.${element}`;
      g = slider(wn, g, AX.z, 4 * R);
      (reg.wave[id] ??= []).push([wn, bucket]);
    }
    return g;
  };
  const array = (id, ext) => { arrayExt[id] = ext; (reg.arrays ??= {})[id] = ext; };

  // ---- hero, mechanism ----
  const heroG = { };
  const hero = ({ x, y, z }) => {
    const H = SPEC.hero;
    const parent = H.array ? arrayGroup(H.array, x, y) : layerG(H.layer);
    if (!H.array) layerOfGroup.set("H.out", H.layer);
    heroG.out = slider("H.out", parent, AX.z, Math.max(1, H.pull) * 2);
    heroG.step = (H.steps || []).map((tr, i) => slider(`H.s${i}`, heroG.out, AX.z, Math.max(1, tr) * 2));
    anchors.hero = [vx(x), y, z];
    return heroG;
  };
  const mech = (i, parent, dir) => slider(`M.${i}`, parent, dir, Math.max(1, SPEC.mech[i].travel) * 2);

  // ---- parts ----
  const grow = (group, pts) => {
    const id = layerOfGroup.get(group.name);
    if (!id) return;
    const b = (bbox[id] ??= [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (const p of pts) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[k]); b[k + 3] = Math.max(b[k + 3], p[k]); }
  };
  const part = (p, group, pts) => { parts[p.name] = p; grow(group, pts); return p; };
  const prismOn = (axis, u) => (name, group, poly, s0, s1, o = {}) => {
    const F = frame([0, 0, 0], axis, u);
    const pts = [];
    for (const [a, b] of poly) for (const s of [s0, s1]) pts.push(add(add(mul(F.a, s), mul(F.u, a)), mul(F.v, b)));
    return part(T.prism({ name, group, layer: L, F, polygon: poly, s0, s1, steps: 5, tone: o.tone ?? "hi", crease: o.crease ?? "faint", bevel: o.bevel ?? 0, material: o.material, lit: o.lit, details: o.details }), group, pts);
  };
  const prismX = prismOn(AX.x, AX.y), prismY = prismOn(AX.y, AX.z), prismZ = prismOn(AX.z, AX.x);
  // box in object coordinates: X range, Y range, z range. o.r rounds the corners in plan.
  const box = (name, group, [X0, X1], [y0, y1], [z0, z1], o = {}) =>
    prismZ(name, group, o.r ? roundedRect(vx(X1), y0, vx(X0), y1, o.r, o.round ?? [1, 1, 1, 1], 6) : [[vx(X1), y0], [vx(X0), y0], [vx(X0), y1], [vx(X1), y1]], z0, z1, o);
  // round solid along an axis frame F from s0 to s1, radius r
  const round = (name, group, F, s0, s1, r, o = {}) => {
    const pts = [];
    for (const s of [s0, s1]) for (const [a, b] of [[r, r], [-r, r], [r, -r], [-r, -r]]) pts.push(add(add(add(F.o, mul(F.a, s)), mul(F.u, a)), mul(F.v, b)));
    return part(T.round({ name, group, layer: L, F, s0, s1, r, ends: o.ends, tone: o.tone ?? "hi", crease: o.crease ?? "faint", material: o.material, lit: o.lit, details: o.details }), group, pts);
  };
  const cylZ = (name, group, X, y, z0, z1, r, o) => round(name, group, frame([vx(X), y, 0], AX.z, AX.x), z0, z1, r, o);
  const cylY = (name, group, X, z, y0, y1, r, o) => round(name, group, frame([vx(X), 0, z], AX.y, AX.z), y0, y1, r, o);
  const cylX = (name, group, y, z, X0, X1, r, o) => round(name, group, frame([0, y, z], [-1, 0, 0], AX.z), X0, X1, r, o);
  // flat drawing on a face (print, traces, legends): svg in local mm, centred on o
  const TOP = { u: [-1, 0, 0], v: [0, 1, 0] };
  const plane = (p, o, svg, { u = TOP.u, v = TOP.v, normal = AX.z, fade = [0.04, 0.3] } = {}) => T.plane({ part: p, o, u, v, svg, normal, fade });
  const planeTop = (p, X, y, z, svg) => plane(p, [vx(X), y, z + 0.02], svg);

  // ---- props for the split-table look: two small U-blocks standing on the table ----
  const props = () => {
    const s = R / 270, TABLE = FILM.bounds[2][0], S = 23 * s;
    const rect = (cx, cy, a, u0, u1, v0, v1) => {
      const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
      let pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [vx(cx + u * c - v * sn), cy + u * sn + v * c]);
      let A = 0;
      for (let i = 0; i < 4; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 4]; A += x0 * y1 - x1 * y0; }
      return A < 0 ? pts.reverse() : pts;
    };
    const cube = (name, cx, cy, a) => {
      const h = S / 2, tw = S * 0.18, th = S * 0.45;
      prismZ(`${name}.legA`, root, rect(cx, cy, a, -h, -tw, -h, h), TABLE, TABLE + th, { material: "cube" });
      prismZ(`${name}.legB`, root, rect(cx, cy, a, tw, h, -h, h), TABLE, TABLE + th, { material: "cube" });
      prismZ(`${name}.top`, root, rect(cx, cy, a, -h, h, -h, h), TABLE + th, TABLE + S, { material: "cube" });
    };
    cube("prop1", 203.4 * s, -110.7 * s, -44.3);
    cube("prop2", 71.4 * s, 137.5 * s, -5.7);
  };

  // ---- finish: anchors, label points, the poses to precompute ----
  const finish = ({ sampleStates } = {}) => {
    const zc = (FILM.bounds[2][0] + FILM.bounds[2][1]) / 2;
    anchors.body ??= [0, 0, zc];
    for (const [i, Ly] of SPEC.layers.entries()) {
      const b = bbox[Ly.id];
      if (!b) continue;
      anchors[`layer.${Ly.id}`] ??= [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
      const follow = [[`L.${Ly.id}`, travelOf(i) >= 0 ? 1 : -1], ["lift", 1]];
      for (const a of SPEC.arrays) if (a.layer === Ly.id && !Ly.labelSkipArray) follow.push([`A.${a.id}.s0b1`, 1 / Math.hypot(a.spread ?? 0.5, 1)]);
      reg.labels.push({ id: Ly.id, zh: Ly.zh, en: Ly.en, travel: Math.abs(travelOf(i)), point: [b[0] + 0.12 * (b[3] - b[0]), (b[1] + b[4]) / 2 + 0.25 * (b[4] - b[1]), (b[2] + b[5]) / 2], follow });
    }
    for (const a of SPEC.arrays) {
      const e = arrayExt[a.id];
      if (e) anchors[`array.${a.id}`] ??= [vx(e.cx), e.cy, bbox[a.layer] ? (bbox[a.layer][2] + bbox[a.layer][5]) / 2 : zc];
    }
    const st = (o) => featureValues({ ...FEATURE_DEFAULTS, apart: 0, ...o }, {});
    const seen = new Set();
    const push = (fv) => {
      const key = JSON.stringify(Object.entries(fv).filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => [k, Math.round(v / Math.max(1, 0.01 * R))]));
      if (seen.has(key)) return;
      seen.add(key);
      features.push(fv);
    };
    push(st({}));
    // every state the film actually passes through, sampled; plus a coarse safety grid
    if (sampleStates) for (const s of sampleStates(0.1)) push(st(s));
    for (let ex = 0; ex <= SPEC.layers.length; ex += 1) push(st({ lift: 1, ex, burst: SPEC.arrays.length }));
    return { parts, groups, explode, root, anchors, features, reg, counts: { layers: SPEC.layers.length } };
  };

  return { T, L, R, parts, groups, anchors, features, reg, root, liftG, slider, layer: layerG, array, arrayGroup, hero, mech, box, prismX, prismY, prismZ, round, cylX, cylY, cylZ, plane, planeTop, props, finish, frame, AX, vx };
}

export function explodeValues(explode, apart, { stretch = 0.55 } = {}) {
  const out = {};
  for (const { name, travel, delay } of explode) {
    const t = Math.max(0, Math.min(1, (apart - delay * stretch) / (1 - stretch)));
    out[name] = travel * t * t * (3 - 2 * t);
  }
  return out;
}
