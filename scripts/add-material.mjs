#!/usr/bin/env node
// Add (or replace) a flat material in a project's kit, from one base colour.
//   node add-material.mjs <project-dir> <name> <#rrggbb> [<name> <#rrggbb> …]
// The kit shades every part in tones derived from its material; this writes the
// 19 tones the kit expects (light and dark theme get the same set).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [dir, ...pairs] = process.argv.slice(2);
if (!dir || pairs.length < 2 || pairs.length % 2) {
  console.error("usage: node add-material.mjs <project-dir> <name> <#rrggbb> [<name> <#rrggbb> …]");
  process.exit(1);
}
const file = join(dir, "kit", "turn.mjs");
let src = readFileSync(file, "utf8");
// tone recipe: ["L", k] mixes toward white by k, ["D", k] scales toward black by k
const RECIPE = [["B"], ["L", 0.184], ["L", 0.36], ["D", 0.759], ["D", 0.837], ["D", 0.922], ["B"], ["L", 0.596], ["L", 0.096], ["D", 0.277], ["D", 0.58], ["D", 0.8], ["D", 0.908], ["D", 0.348], ["K"], ["B"], ["L", 0.42], ["D", 0.759], ["D", 0.277]];
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const tones = (base) => {
  const c = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  return RECIPE.map(([op, k]) => (op === "B" ? hex(c) : op === "K" ? "#000000" : op === "L" ? hex(c.map((v) => v + (255 - v) * k)) : hex(c.map((v) => v * k))));
};
for (let i = 0; i < pairs.length; i += 2) {
  const name = pairs[i], base = pairs[i + 1];
  if (!/^[a-z][a-z0-9]*$/.test(name)) throw new Error(`material name must be lowercase letters/digits: ${name}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(base)) throw new Error(`colour must be #rrggbb: ${base}`);
  const t = JSON.stringify(tones(base.toLowerCase())).replace(/,/g, ", ");
  const entry = `  ${name}: {\n    light: ${t},\n    dark: ${t},\n  },\n`;
  const re = new RegExp(`\\n  ${name}: \\{\\n    light: \\[[^\\]]*\\],\\n    dark: \\[[^\\]]*\\],\\n  \\},\\n`);
  if (re.test(src)) src = src.replace(re, "\n" + entry);
  else src = src.replace("const T3_MATERIALS = {\n", "const T3_MATERIALS = {\n" + entry);
  console.log(`material ${name} ← ${base}`);
}
writeFileSync(file, src);
