// story.mjs — the storyboard, as data. Pick beats from the shot library, set their length (s),
// give each one an optional text card. The timeline, the cards, the layer labels and the
// sound cues are all generated from this list. Inlined into the film page: no imports.
//
// beat types
//   hero      the product whole at the fixed hero camera; intro: "wave" | "act" | "none"
//   rise      it lifts off the table, camera pulls back for the explode
//   explode   layers lift one by one (top first), arrays burst; layer labels appear
//   part      whip to the hero part; it lifts out and splits into its sub-parts
//   action    the hero part reassembled, floating; the mechanism works (press, turn…)
//   array     whip to an exploded array: hundreds of parts in the air      (array: id)
//   stack     whip low along the middle layers of the stack                 (layer: id)
//   assemble  everything comes back, layer by layer
//   end       hero camera, product name card, hold
// card: { big, small } · cam: overrides for the beat's end camera (yaw, pitch, zoom, panX, panY)
export const STORY = {
  bpm: 120,
  beats: [
    { type: "hero", d: 4, intro: "act" },
    { type: "rise", d: 2 },
    { type: "explode", d: 6, card: { big: "七层", small: "一块移动电源，从上到下" } },
    { type: "part", d: 2, card: { big: "按键", small: "四个零件，一次按压" } },
    { type: "action", d: 2, card: { big: "1.6 mm", small: "按键行程" } },
    { type: "array", d: 4, array: "cells", card: { big: "20000 mAh", small: "八颗电芯" } },
    { type: "stack", d: 4, layer: "pcb", card: { big: "65 W", small: "双向快充" } },
    { type: "assemble", d: 4 },
    { type: "end", d: 2, card: { big: "PB-1", small: "每一个零件，都按真实尺寸建模" } },
  ],
};
