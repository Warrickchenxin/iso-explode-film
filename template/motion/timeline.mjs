// timeline.mjs — turns STORY (story.mjs) into camera and feature keys, cards, label
// windows, render margins and sound cues. Generic: nothing here names a part of a
// particular object. Inlined into the film page after film.mjs and story.mjs.
import { FILM, SPEC, FEATURE_DEFAULTS, LIFT, NL, travelOf, layerIndex, arrayRise } from "../object/film.mjs";
import { STORY } from "./story.mjs";

const EASE = {
  lin: (x) => x,
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  o: (x) => 1 - Math.pow(1 - x, 3),
  whip: (x) => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2),
};
// ---- fixed look: the hero camera (fitted to an ad photo once, then frozen) and the explode view
const HERO = { yaw: -27.186, pitch: 54.53, roll: 9.4907, zoom: 2.6867, panX: 17.776, panY: 18.318 };
const EXV = { yaw: -20, pitch: 24, roll: 0, zoom: 1.0, panX: 70, panY: 0 };
const TL_R = FILM.radius;
const TL_W = FILM.bounds[0][1] - FILM.bounds[0][0];
const tlReg = () => (typeof DATA !== "undefined" && DATA.reg) || globalThis.__ISO_REG || {};
const AN = (n, dz = 0) => {
  const a = (typeof DATA !== "undefined" && DATA.anchors && DATA.anchors[n]) || [0, 0, (FILM.bounds[2][0] + FILM.bounds[2][1]) / 2];
  return [a[0], a[1], a[2] + dz];
};
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const NA = SPEC.arrays.length;
const H_ = SPEC.hero || { size: 20, pull: 0, hover: 0, steps: [] };
const NS = (H_.steps || []).length;
const Z_PART = clampN((0.5 * TL_R) / H_.size, 2, 14);
const Z_ACT = Z_PART * 1.47;
const Z_STACK = clampN((2.8 * 1.26 * TL_R) / TL_W, 1.5, 8);
const zArray = (id) => {
  const e = (tlReg().arrays || {})[id];
  return e ? clampN((1.8 * 1.1 * TL_R) / (2 * e.hx), 1.4, 8) : 1.8;
};
const F0 = { ...FEATURE_DEFAULTS, apart: 0 };

// ---- build the base keys from the beats ----
const BASE_KEYS = [];
const EVENTS = []; // { t, kind, ... } for the sound
const CARDS0 = []; // { t0, t1, big, small, x, y }
const MARGINS0 = []; // { t0, t1, m }
let LABELWIN0 = null;
const BEATS0 = [];
{
  const K = (o) => BASE_KEYS.push(o);
  const E = (t, kind, o = {}) => EVENTS.push({ t, kind, ...o });
  const stackBeat = STORY.beats.find((b) => b.type === "stack");
  const firstArrayBeat = STORY.beats.find((b) => b.type === "array");
  const exMid = clampN(stackBeat ? layerIndex(stackBeat.layer) + 1 : NL - 2, firstArrayBeat ? layerIndex((SPEC.arrays.find((a) => a.id === firstArrayBeat.array) || {}).layer) + 1 : 0, NL);
  // hold: pin every feature channel at its current value, so a beat starts from rest
  const cur = (ch, th) => {
    let best = null;
    for (const k of BASE_KEYS) if (k[ch] !== undefined && k.t <= th + 1e-9 && (!best || k.t >= best.t)) best = k;
    return best ? best[ch] : F0[ch];
  };
  const hold = (th) => {
    const o = { t: th };
    for (const ch of Object.keys(F0)) o[ch] = cur(ch, th);
    K(o);
  };
  let t = 0;
  K({ t: 0, ...HERO, focus: AN("body"), ...F0 });
  for (const b of STORY.beats) {
    const t0 = t, d = b.d, t1 = t0 + d;
    if (t0 > 0) hold(t0);
    const card = (a0, a1, x = 130, y = 150) => b.card && CARDS0.push({ t0: a0, t1: a1, big: b.card.big, small: b.card.small ?? "", x: b.card.x ?? x, y: b.card.y ?? y });
    const cam = (o) => ({ ...o, ...(b.cam || {}) });
    BEATS0.push({ type: b.type, t0, t1 });
    if (b.type === "hero") {
      K({ t: t0, ...HERO, zoom: HERO.zoom * 0.96, focus: AN("body"), ...F0, wave: b.intro === "wave" ? 0 : -1 });
      K({ t: t1, ...cam({ ...HERO, zoom: HERO.zoom * 1.024 }), focus: AN("body"), wave: b.intro === "wave" ? d : -1, ease: "lin" });
      if (b.intro === "wave") for (let k = 0; k < 8 && k * 0.5 < d; k++) E(t0 + 0.06 + k * 0.5, "tap", { n: 5, pan: -0.6 + k * 0.17 });
      if (b.intro === "act") for (let p = t0 + 0.6; p < t1 - 0.4; p += 1.0) { K({ t: p, act: 0 }); K({ t: p + 0.08, act: 1, ease: "o" }); K({ t: p + 0.4, act: 0, ease: "io" }); E(p + 0.08, "tap", { n: 1 }); }
      card(t0 + 0.4, t1 - 0.1);
    } else if (b.type === "rise") {
      K({ t: t0 + 0.01, wave: -1, act: 0, ease: "lin" });
      K({ t: t1, ...cam({ ...EXV, zoom: 1.5, panX: -40 }), focus: AN("body", LIFT + 0.22 * TL_R), lift: 1, ease: "io" });
      E(t0 - 0.15, "whoosh"); E(t0, "riser", { t1: t1 - 0.05 });
      card(t0 + 0.4, t1 - 0.1);
    } else if (b.type === "explode") {
      const span = 0.75 * d, ti = (i) => t0 + (span * i) / NL;
      K({ t: t0, ex: 0, burst: 0, lift: 1 });
      for (let i = 1; i <= NL; i++) { K({ t: ti(i), ex: i, ease: "lin" }); E(ti(i) - 0.02, "thud"); }
      let prev = t0;
      SPEC.arrays.forEach((a, j) => {
        const li = layerIndex(a.layer), a0 = Math.max(prev, ti(li)), a1 = Math.max(a0 + 0.3, ti(Math.min(NL, li + 1.2)));
        prev = a1;
        K({ t: a0, burst: j }); K({ t: a1, burst: j + 1, ease: "lin" });
        E(a0, "spray", { t1: a1, n: 30 });
      });
      K({ t: t0 + span, ...EXV, focus: AN("body", LIFT + 0.85 * TL_R), ease: "io" });
      K({ t: t1, ...cam({ yaw: -25, pitch: 25, zoom: 1.02, panX: 70 }), focus: AN("body", LIFT + 0.87 * TL_R), ease: "io" });
      E(t0, "drop", { t1, level: 1 });
      LABELWIN0 = { t0, t1 };
      card(t0 + 0.25, t1 - 0.15, 130, 380);
    } else if (b.type === "part") {
      const fz = LIFT + H_.pull * 0.7 + (H_.steps || []).reduce((s, x) => s + x, 0) * 0.3;
      // arrays fold back first, then the layers close: nothing crosses on the way
      K({ t: t0, pull: 0, split: 0 });
      K({ t: t0 + 0.12, burst: 0, ease: "lin" });
      K({ t: t0 + 0.3, ...cam({ yaw: -34, pitch: 20, roll: 0, zoom: Z_PART, panX: 0, panY: 0 }), focus: AN("hero", fz), ex: 0, ease: "whip" });
      K({ t: t0 + 0.75, pull: 1, ease: "o" });
      K({ t: t1, yaw: -40, pitch: 18, zoom: Z_PART * 1.04, focus: AN("hero", fz), split: NS, ease: "lin" });
      E(t0 - 0.15, "whoosh"); E(t0 + 0.3, "boom", { g: 0.35 }); E(t0 + 0.75, "tap", { n: 1 });
      for (let i = 0; i < NS; i++) E(t0 + 0.75 + ((d - 0.75) * (i + 0.5)) / NS, "tap", { n: 1, g: 0.5 });
      E(t0, "detail", { t1 });
      card(t0 + 0.45, t1 - 0.1);
    } else if (b.type === "action") {
      const s = d / 2.1, fz = LIFT + (H_.pull - (H_.hover ?? 0)) * 0.8;
      K({ t: t0, hover: 0, act: 0 });
      K({ t: t0 + 0.4 * s, split: 0, pull: 1, hover: 1, ease: "io" });
      K({ t: t0 + 0.45 * s, ...cam({ yaw: -55, pitch: 12, roll: 0, zoom: Z_ACT }), focus: AN("hero", fz), ease: "whip" });
      [0.3, 0.55, 0.8].forEach((dep, k) => {
        const p = t0 + (0.5 + 0.5 * k) * s;
        K({ t: p, act: 0 }); K({ t: p + 0.1 * s, act: dep, ease: "o" }); K({ t: p + 0.4 * s, act: 0, ease: "io" });
        E(p + 0.1 * s, "tap", { n: 1, g: 0.9 + 0.2 * k, depth: dep });
      });
      K({ t: t0 + 2.0 * s, yaw: -60, pitch: 13, zoom: Z_ACT * 1.04, focus: AN("hero", fz), act: 0, ease: "lin" });
      K({ t: t1, act: 1, ease: "o" });
      E(t1 - 0.05, "tap", { n: 1, g: 1.2, depth: 1 }); E(t0 + 0.35 * s, "whoosh", { g: 0.5 }); E(t0 + 0.5 * s, "riser", { t1: t1 - 0.1, g: 0.3 });
      E(t0, "detail", { t1 });
      card(t0 + 0.55, t1 - 0.15);
    } else if (b.type === "array") {
      const a = SPEC.arrays.find((q) => q.id === b.array) || SPEC.arrays[0];
      const j = SPEC.arrays.indexOf(a), li = layerIndex(a.layer);
      const fz = LIFT + travelOf(li) + 0.3 * arrayRise(a);
      K({ t: t0 + 0.25, ...cam({ yaw: -48, pitch: 16, roll: 0, zoom: zArray(a.id), panX: -120, panY: 25 }), focus: AN(`array.${a.id}`, fz), pull: 0, split: 0, hover: 0, act: 0, ex: exMid, burst: cur("burst", t0), ease: "whip" });
      K({ t: t0 + 0.9, burst: NA, ease: "o" }); // layers apart first, then the array bursts in shot
      K({ t: t1, yaw: -14, pitch: 22, zoom: zArray(a.id) * 1.08, focus: AN(`array.${a.id}`, fz), ease: "io" });
      E(t0 - 0.05, "whoosh", { g: 0.8 }); E(t0 + 0.25, "drop", { t1, level: 2 }); void j;
      MARGINS0.push({ t0: t0 + 0.2, t1, m: 2.1 });
      card(t0 + 0.65, t1 - 0.1);
    } else if (b.type === "stack") {
      const li = Math.max(0, layerIndex(b.layer));
      const fz = LIFT + travelOf(li) + 0.1 * TL_R;
      K({ t: t0 + 0.3, ...cam({ yaw: -62, pitch: 9, roll: 0, zoom: Z_STACK, panX: -90, panY: 10 }), focus: AN(`layer.${b.layer}`, fz), ex: exMid, burst: cur("burst", t0), pull: 0, split: 0, hover: 0, act: 0, ease: "whip" });
      K({ t: t0 + 0.9, burst: NA, ease: "o" });
      K({ t: t1, yaw: -40, pitch: 12, zoom: Z_STACK * 1.07, focus: AN(`layer.${b.layer}`, fz), ease: "io" });
      E(t0 - 0.1, "whoosh", { g: 0.7 }); E(t0 + 0.3, "drop", { t1, level: 2 });
      MARGINS0.push({ t0: t0 + 0.25, t1, m: 2.7 });
      card(t0 + 0.6, t1 - 0.1);
    } else if (b.type === "assemble") {
      const s = d / 4, ta = t0 + 1.0 * s, tb = t0 + 3.4 * s, tl = (i) => ta + ((tb - ta) * (NL - i)) / NL;
      K({ t: t0 + 0.35 * s, ...EXV, focus: AN("body", LIFT + 0.85 * TL_R), ex: NL, burst: NA, pull: 0, split: 0, hover: 0, act: 0, lift: 1, ease: "whip" });
      K({ t: ta, ex: NL, burst: NA, yaw: -22, focus: AN("body", LIFT + 0.85 * TL_R), ease: "io" });
      for (let i = NL - 1; i >= 0; i--) { K({ t: tl(i), ex: i, ease: "lin" }); E(tl(i), "thud"); }
      for (let j = NA - 1; j >= 0; j--) {
        const li = layerIndex(SPEC.arrays[j].layer), b0 = tl(Math.min(NL, li + 1.2)), b1 = tl(li);
        K({ t: b0, burst: j + 1 }); K({ t: b1, burst: j, ease: "lin" });
        E(b0, "spray", { t1: b1, n: 25 });
      }
      K({ t: tb, lift: 1 });
      K({ t: t1, ...cam(HERO), focus: AN("body"), lift: 0, ease: "io" });
      E(t0 - 0.1, "whoosh", { g: 0.8 }); E(t0 + 1.5 * s, "riser", { t1: t1 - 0.05, g: 0.45 }); E(t0, "build", { t1 });
      card(t0 + 0.4, t1 - 0.1);
    } else if (b.type === "end") {
      K({ t: t1 - 0.5, ...cam({ ...HERO, zoom: HERO.zoom * 1.005 }), focus: AN("body"), ease: "o" });
      K({ t: t1, ...cam({ ...HERO, zoom: HERO.zoom * 1.005 }), focus: AN("body"), ease: "lin" });
      E(t0, "end");
      card(t0 + 0.25, t1 + 1, 120, 790);
    } else throw new Error(`story: unknown beat type ${b.type}`);
    t = t1;
  }
  BASE_KEYS.sort((a, b) => a.t - b.t);
}
export const BASE_DURATION = STORY.beats.reduce((s, b) => s + b.d, 0);
const REQUESTED = typeof DATA !== "undefined" && DATA.duration ? DATA.duration : BASE_DURATION;
function retimer(keys, duration) {
  const segments = [];
  let fixed = 0;
  const ts = [...new Set(keys.map((k) => k.t))].sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) {
    const whip = keys.some((k) => k.t === ts[i] && k.ease === "whip");
    segments.push({ a: ts[i - 1], b: ts[i], whip });
    if (whip) fixed += ts[i] - ts[i - 1];
  }
  const scale = Math.max(0.35, (duration - fixed) / (BASE_DURATION - fixed));
  return (t) => {
    let out = 0;
    for (const s of segments) {
      if (t <= s.a) break;
      const part = Math.min(t, s.b) - s.a;
      out += s.whip ? part : part * scale;
    }
    return out + Math.max(0, t - BASE_DURATION) * scale;
  };
}
const RETIME = retimer(BASE_KEYS, REQUESTED);
export const DURATION = RETIME(BASE_DURATION);
export const KEYS = BASE_KEYS.map((k) => ({ ...k, t: RETIME(k.t) }));
export const PLAN = {
  duration: DURATION,
  bpm: STORY.bpm,
  beats: BEATS0.map((b) => ({ ...b, t0: RETIME(b.t0), t1: RETIME(b.t1) })),
  cards: CARDS0.map((c) => ({ ...c, t0: RETIME(c.t0), t1: RETIME(c.t1) })),
  labels: LABELWIN0 ? { t0: RETIME(LABELWIN0.t0), t1: RETIME(LABELWIN0.t1) } : null,
  margins: MARGINS0.map((m) => ({ ...m, t0: RETIME(m.t0), t1: RETIME(m.t1) })),
  events: EVENTS.map((e) => ({ ...e, t: RETIME(e.t), ...(e.t1 !== undefined ? { t1: RETIME(e.t1) } : {}) })).sort((a, b) => a.t - b.t),
};
const LABELS = [{ t: 0, hint: "", readout: "" }];
const CHANNELS = ["yaw", "pitch", "roll", "zoom", "panX", "panY", "apart", ...Object.keys(FEATURE_DEFAULTS)];
const TL_DEFAULTS = { yaw: 0, pitch: 0, roll: 0, zoom: 1, panX: 0, panY: 0, apart: 0, ...FEATURE_DEFAULTS };
function track(name) {
  const list = KEYS.filter((k) => k[name] !== void 0).map((k) => ({ t: k.t, v: k[name], ease: k.ease ?? "io" }));
  if (!list.length || list[0].t > 0) list.unshift({ t: 0, v: list.length ? list[0].v : TL_DEFAULTS[name], ease: "lin" });
  return list;
}
const TRACKS = Object.fromEntries(CHANNELS.map((c) => [c, track(c)]));
const FOCUS = KEYS.filter((k) => k.focus !== void 0).map((k) => ({ t: k.t, v: k.focus, ease: k.ease ?? "io" }));
function sample(list, t) {
  if (t <= list[0].t) return { a: list[0].v, b: list[0].v, e: 0 };
  for (let i = 1; i < list.length; i++) {
    if (t <= list[i].t) {
      const x = (t - list[i - 1].t) / (list[i].t - list[i - 1].t || 1);
      return { a: list[i - 1].v, b: list[i].v, e: EASE[list[i].ease](x) };
    }
  }
  const last = list[list.length - 1].v;
  return { a: last, b: last, e: 0 };
}
const mix = (a, b, e) => a + (b - a) * e;
export function at(t) {
  const out = {};
  for (const c of CHANNELS) {
    const { a, b, e } = sample(TRACKS[c], t);
    out[c] = c === "zoom" ? Math.exp(mix(Math.log(a), Math.log(b), e)) : mix(a, b, e);
  }
  const f = sample(FOCUS, t);
  out.focus = { a: f.a, b: f.b, e: f.e };
  out.glow = [0.5, 0.45, 0.7];
  let label = LABELS[0];
  for (const l of LABELS) if (t >= l.t) label = l;
  out.label = label;
  return out;
}
// every feature state the film passes through (for precomputing the draw order)
export function sampleStates(dt = 0.1) {
  const out = [];
  for (let t = 0; t <= DURATION + 1e-6; t += dt) {
    const s = at(t);
    const o = {};
    for (const k of Object.keys(FEATURE_DEFAULTS)) o[k] = s[k];
    out.push(o);
  }
  return out;
}
