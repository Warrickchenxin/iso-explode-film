// ============================================================================
// film.mjs — everything the figure page and the film know about THIS object.
// Edit the SPEC block (top). Below the line is generic machinery: leave it.
// This file is inlined into the pages, so it must not import anything.
// ============================================================================

// ---------- 1. what the object is ----------
export const FILM = {
  fig: "Fig 1",
  title: "PB-1",
  // scene radius ≈ 0.8 × the bounding-box diagonal (mm). Every camera preset scales with it.
  radius: 135,
  label: "A pocket power bank built from its dimensions, taken apart into its layers and put back together.",
  // bounding box in kit world coordinates (x = -X, y = Y, z up), mm
  bounds: [
    [-76, 76],
    [-37, 37],
    [0, 29],
  ],
};

export const FIGURE = {
  title: "PB-1 · anatomy",
  start: { yaw: -28, pitch: 30 },
  label: "A power bank built from {parts} solid parts. Apart, it opens into {assemblies} layers.",
  keys: [
    { mark: "raised", label: "Shell: top and bottom" },
    { mark: "lit", label: "Inside: cells, bracket, board" },
    { mark: "edge", label: "Button module" },
  ],
  caption: "{parts} convex parts.",
};

// ---------- 2. the product spec the film is generated from ----------
// layers: assembly layers from TOP to BOTTOM. The explode lifts them in this order.
//   travel (mm) is optional: by default it is computed from the radius (top flies highest,
//   the last layer drops a little). Give a number to override.
// arrays: groups of repeated parts that burst outward (keys, cells, screws, LEDs, fins…).
//   layer: which layer they ride on · rise: how far they fly (mm) · spread: sideways share (0–1)
//   wave: true gives every element its own slider so the opening shot can ripple across them.
//   from: "edge" (default, outer band leaves first: safe for tightly packed parts) or "centre".
// hero: the one part the film takes apart in close-up.
//   layer: its layer · array: set if it sits inside an array (it then bursts with it)
//   size: its largest dimension (mm, sets the close-up zoom) · pull: lift out of the product (mm)
//   hover: how far it sinks back for the action shot · steps: split travel of each sub-part (mm)
// mech: moves driven by the action channel (press, turn, slide…), travel in mm.
export const SPEC = {
  name: "PB-1",
  layers: [
    { id: "top", zh: "上壳", en: "TOP SHELL" },
    { id: "guide", zh: "导光条", en: "LIGHT GUIDE" },
    { id: "cells", zh: "电芯", en: "CELLS" },
    { id: "bracket", zh: "支架", en: "BRACKET" },
    { id: "pcb", zh: "主板", en: "MAIN BOARD" },
    { id: "pad", zh: "导热垫", en: "THERMAL PAD" },
    { id: "bottom", zh: "底壳", en: "BOTTOM SHELL" },
  ],
  arrays: [
    { id: "cells", layer: "cells", rise: 46, spread: 0.6 },
    { id: "chips", layer: "pcb", rise: 26, spread: 0.5 },
  ],
  hero: { layer: "top", size: 11, pull: 26, hover: 12, steps: [16, 9, 5] },
  mech: [{ travel: 1.6 }],
};

// ============================ generic machinery ============================
export const FEATURE_DEFAULTS = { ex: 0, lift: 0, burst: 0, wave: -1, pull: 0, split: 0, hover: 0, act: 0 };
export const FEATURE_KEYS = [{ key: "p", channel: "act", name: "act", unit: "", values: [0, 1], ease: 0.2, verb: "works the mechanism" }];
const R_ = FILM.radius;
export const LIFT = 0.15 * R_;
export const NL = SPEC.layers.length;
export function travelOf(i) {
  const L = SPEC.layers[i];
  if (L.travel !== undefined) return L.travel;
  if (i === NL - 1) return -0.07 * R_;
  return R_ * (0.1 + 1.3 * Math.pow((NL - 1 - i) / Math.max(1, NL - 1), 1.1));
}
export const layerIndex = (id) => SPEC.layers.findIndex((l) => l.id === id);
export const arrayRise = (a) => a.rise ?? 0.4 * R_;
const sm_ = (x) => x * x * (3 - 2 * x);
const reg_ = () => (typeof DATA !== "undefined" && DATA.reg) || globalThis.__ISO_REG || { wave: {} };
export function featureValues(s, values) {
  const c = (x) => Math.max(0, Math.min(1, x));
  const out = { ...values };
  // layers, top first, one per unit of ex
  if (s.ex > 0 || !s.apart) SPEC.layers.forEach((L, i) => (out[`L.${L.id}`] = Math.abs(travelOf(i)) * sm_(c(s.ex - i))));
  out.lift = LIFT * c(s.lift);
  // arrays burst one after another, each centre-out in three bands, eight sectors
  SPEC.arrays.forEach((a, j) => {
    const B = c(s.burst - j);
    for (let sec = 0; sec < 8; sec++)
      for (let b = 0; b < 3; b++) {
        const r = (b + 0.5) / 3, order = a.from === "centre" ? r : 1 - r;
        out[`A.${a.id}.s${sec}b${b}`] = arrayRise(a) * (0.35 + 0.65 * r) * sm_(c((B - 0.4 * order) / 0.6));
      }
  });
  // wave: a ripple across an array, one bucket per half second (left to right)
  const pulse = (d) => (d < 0 ? 0 : d < 0.06 ? d / 0.06 : Math.max(0, 1 - (d - 0.06) / 0.24));
  const W = reg_().wave || {};
  for (const id in W) {
    const a = SPEC.arrays.find((q) => q.id === id) || {};
    const lift = a.waveLift ?? Math.max(1.5, 0.015 * R_);
    for (const [name, bucket] of W[id]) out[name] = s.wave >= 0 ? lift * pulse(s.wave - bucket * 0.5) : 0;
  }
  // hero: pull out, split into its sub-parts, sink back to hover, act
  const H = SPEC.hero;
  if (H) {
    out["H.out"] = Math.max(0, H.pull * c(s.pull) - (H.hover ?? 0) * c(s.hover));
    (H.steps || []).forEach((tr, i) => (out[`H.s${i}`] = tr * c(s.split - i)));
  }
  (SPEC.mech || []).forEach((m, i) => (out[`M.${i}`] = m.travel * c(s.act)));
  return out;
}
export function featureTravel(a, b) {
  const H = SPEC.hero || { pull: 0, steps: [] };
  const maxStep = Math.max(0, ...(H.steps || []));
  const maxRise = Math.max(0, ...SPEC.arrays.map(arrayRise));
  const maxMech = Math.max(0, ...(SPEC.mech || []).map((m) => m.travel));
  return Math.max(
    Math.abs(b.ex - a.ex) * 0.5 * R_,
    Math.abs(b.lift - a.lift) * LIFT,
    Math.abs(b.burst - a.burst) * maxRise,
    Math.abs(b.pull - a.pull) * H.pull,
    Math.abs(b.split - a.split) * maxStep,
    Math.abs(b.hover - a.hover) * (H.hover ?? 0),
    Math.abs(b.act - a.act) * maxMech,
    b.wave >= 0 ? 4 : 0,
  );
}
