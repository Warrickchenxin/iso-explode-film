// geometry.mjs — THE OBJECT. Demo: a pocket power bank (150 × 72 × 28.6 mm), 7 layers.
// Replace everything inside buildObject with your own object. Keep the pattern:
//   rig.layer(id)            a layer group from SPEC.layers (top first)
//   rig.array(id, ext)       declare an array, then rig.arrayGroup(id, X, Y, {element}) per element
//   rig.hero({x,y,z})        the close-up part: parts go into hero.out / hero.step[i]
//   rig.mech(i, parent, dir) a mechanism slider driven by the action channel
//   rig.box / cylX / cylY / cylZ / prismZ / round / planeTop   convex parts and face prints
// Object coordinates: X right, Y toward the viewer, z up, mm. No two parts may overlap.
import { makeRig, explodeValues, roundedRect, vx } from "./rig.mjs";
import { sampleStates } from "../motion/timeline.mjs";
export { explodeValues };

const GOLD = "#c9a45a";

export function buildObject(T, { layer }) {
  const rig = makeRig(T, { layer });
  const { box, cylY, cylZ, prismZ, planeTop } = rig;

  // a shell ring of walls with rounded corners (corner = convex circular segment)
  const ring = (tag, g, z0, z1, mat) => {
    const X = 75, Y = 36, t = 1.6, r = 6;
    box(`${tag}.wall.L`, g, [-X, -X + t], [-Y + r, Y - r], [z0, z1], { material: mat });
    box(`${tag}.wall.R`, g, [X - t, X], [-Y + r, Y - r], [z0, z1], { material: mat });
    box(`${tag}.wall.B`, g, [-X + r, X - r], [-Y, -Y + t], [z0, z1], { material: mat });
    box(`${tag}.wall.F`, g, [-X + r, X - r], [Y - t, Y], [z0, z1], { material: mat });
    for (const [sx, sy, i] of [[-1, -1, 0], [1, -1, 1], [1, 1, 2], [-1, 1, 3]]) {
      const cx = sx * (X - r), cy = sy * (Y - r), pts = [];
      const a0 = Math.atan2(0, sx), a1 = Math.atan2(sy, 0);
      for (let k = 0; k <= 8; k++) {
        let a = a0 + ((a1 - a0 + (Math.abs(a1 - a0) > Math.PI ? -Math.sign(a1 - a0) * 2 * Math.PI : 0)) * k) / 8;
        pts.push([vx(cx + r * Math.cos(a)), cy + r * Math.sin(a)]);
      }
      let A = 0;
      for (let k = 0; k < pts.length; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length]; A += x0 * y1 - x1 * y0; }
      prismZ(`${tag}.corner.${i}`, g, A < 0 ? pts.reverse() : pts, z0, z1, { material: mat });
    }
  };

  // ---------- bottom shell ----------
  const bottom = rig.layer("bottom");
  box("bottom.floor", bottom, [-75, 75], [-36, 36], [0, 1.6], { material: "shell", r: 6 });
  ring("bottom", bottom, 1.6, 12, "shell");

  // ---------- thermal pad ----------
  box("pad", rig.layer("pad"), [-71.5, 71.5], [-31.5, 31.5], [1.6, 2.4], { material: "foam", tone: "mid" });

  // ---------- main board + chips (array) + ports ----------
  const pcbG = rig.layer("pcb");
  const board = box("pcb", pcbG, [-72, 72], [-32, 32], [2.6, 4.2], { material: "pcbblack" });
  let tr = "";
  for (let i = 0; i < 14; i++) {
    const y = -30 + i * 4.6;
    tr += `M${(-70 + (i % 3) * 6).toFixed(1)} ${y.toFixed(1)}H${(40 + (i % 4) * 7).toFixed(1)}l4 4`;
  }
  planeTop(board, 0, 0, 4.2, `<path d="${tr}" style="fill:none;stroke:${GOLD};stroke-width:.7;opacity:.9"/>`);
  rig.array("chips", { cx: 0, cy: 0, hx: 66, hy: 28 });
  let n = 0;
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 4; j++) {
      const X = -55 + i * 22, Y = -21 + j * 14, w = (i + j) % 3 === 0 ? 7 : 4.5, h = (i + j) % 2 ? 4.5 : 6;
      const c = box(`chip.${n}`, rig.arrayGroup("chips", X, Y, { element: n }), [X - w / 2, X + w / 2], [Y - h / 2, Y + h / 2], [4.2, 5.0], { material: "keyink" });
      if (w > 6) planeTop(c, X, Y, 5.0, `<circle cx="${(w / 2 - 1).toFixed(1)}" cy="${(-h / 2 + 1).toFixed(1)}" r=".45" style="fill:#8b8d92"/>`);
      n++;
    }
  box("port.0", pcbG, [-72, -68.5], [-12, -4], [4.2, 6.0], { material: "chrome" });
  box("port.1", pcbG, [-72, -68.5], [4, 12], [4.2, 6.0], { material: "chrome" });

  // ---------- bracket: two end rails holding the cells ----------
  const br = rig.layer("bracket");
  box("bracket.back", br, [-70, 70], [-33.6, -31.8], [6, 19], { material: "keygrey" });
  box("bracket.front", br, [-70, 70], [31.8, 33.6], [6, 19], { material: "keygrey" });

  // ---------- cells (array): 8 cylinders lying along Y ----------
  rig.array("cells", { cx: 0, cy: 0, hx: 72, hy: 12 });
  for (let k = 0; k < 8; k++) {
    const X = -61.25 + k * 17.5, zc = 14.1, g = rig.arrayGroup("cells", X, 0, { element: k });
    cylY(`cell.${k}.wrap`, g, X, zc, -30, 30, 8.5, { material: "cellblue", details: { ribs: { s0: -27, s1: 27, count: 2, tone: "lo" } } });
    cylY(`cell.${k}.neg`, g, X, zc, -31, -30, 7.6, { material: "chrome" });
    cylY(`cell.${k}.pos`, g, X, zc, 30, 31.5, 3.2, { material: "chrome" });
  }

  // ---------- light guide + 4 LEDs ----------
  const guide = rig.layer("guide");
  box("guide.bar", guide, [-40, -8], [22, 26], [24.6, 25.6], { material: "glass", tone: "mid" });
  for (let k = 0; k < 4; k++) cylZ(`led.${k}`, guide, -36 + k * 8, 24, 23.9, 24.5, 1.2, { material: "signal" });

  // ---------- top shell: walls + panel with a hole for the button ----------
  const top = rig.layer("top");
  ring("top", top, 12, 26.4, "shell");
  const PZ = [26.4, 28];
  const hx0 = 46.5, hx1 = 57.5, hy0 = -19.5, hy1 = -8.5;
  const panelL = prismZ("top.panel.L", top, roundedRect(vx(hx0), -36, vx(-75), 36, 6, [0, 1, 1, 0], 6), PZ[0], PZ[1], { material: "shell" });
  prismZ("top.panel.R", top, roundedRect(vx(75), -36, vx(hx1), 36, 6, [1, 0, 0, 1], 6), PZ[0], PZ[1], { material: "shell" });
  box("top.panel.B", top, [hx0, hx1], [-36, hy0], PZ, { material: "shell" });
  box("top.panel.F", top, [hx0, hx1], [hy1, 36], PZ, { material: "shell" });
  let leds = "";
  for (let k = 0; k < 4; k++) leds += `<rect x="${(-3 - k * 8).toFixed(1)}" y="-0.9" width="3" height="1.8" rx=".5" style="fill:${k < 3 ? "#e45a52" : "#55575c"}"/>`;
  planeTop(panelL, -24, 24, 28, leds);
  planeTop(panelL, 10, 4, 28, `<text x="0" y="0" font-size="7" text-anchor="middle" style="font-family:Helvetica,Arial,sans-serif;letter-spacing:.2em;fill:#8b8d92">PB-1</text>`);

  // ---------- hero: the button module (cap · dome · tact switch · base) ----------
  const H = rig.hero({ x: 52, y: -14, z: 27 });
  box("btn.base", H.out, [48, 56], [-18, -10], [22.8, 23.4], { material: "pcbblack" });
  box("btn.switch", H.step[2], [49.5, 54.5], [-16.5, -11.5], [23.4, 24.0], { material: "keyink" });
  cylZ("btn.dome", H.step[1], 52, -14, 24.05, 24.6, 2.6, { material: "rubber" });
  const press = rig.mech(0, H.step[0], [0, 0, -1]);
  box("btn.cap", press, [47.2, 56.8], [-18.8, -9.2], [26.4, 28.6], { material: "signal", r: 1.5 });

  // ---------- props on the table (split look only) ----------
  if (process.env.ISO_LOOK === "split") rig.props();
  return rig.finish({ sampleStates });
}
