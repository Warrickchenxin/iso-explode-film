// Check every frame of the film (60 per second) for forced draw-order picks and for
// parts that pass through each other. Usage: node motion/scan.mjs [motion-split.html]
import { launch } from "../scripts/browser.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
await page.goto(pathToFileURL(resolve(process.argv[2] ?? join(HERE, "motion-split.html"))).href);
await page.waitForFunction(() => window.ready);
const res = await page.evaluate(() => {
  const forcedAt = [], pairs = new Map();
  for (let n = 0; n < Math.ceil(window.DURATION * 60); n++) {
    const t = n / 60;
    globalThis.__t3forced = [];
    globalThis.__t3unsep = [];
    const s = window.frame(t);
    if (s.forced) forcedAt.push([t.toFixed(2), s.forced, [...new Set(globalThis.__t3forced.map((p) => p.name ?? p.id ?? String(p)))].slice(0, 4).join(",")]);
    for (const [a, b, m] of globalThis.__t3unsep || []) {
      const k = `${a} × ${b}`;
      const p = pairs.get(k);
      if (!p) pairs.set(k, { from: t, to: t, m });
      else { p.to = t; p.m = Math.min(p.m, m); }
    }
  }
  return { forcedAt, pairs: [...pairs].map(([k, v]) => `${k}  (${v.from.toFixed(2)}–${v.to.toFixed(2)} s, margin ${v.m.toFixed(2)})`) };
});
if (!res.forcedAt.length && !res.pairs.length) console.log("every frame clean: no forced picks, no pass-throughs");
else {
  if (res.forcedAt.length) console.log(`forced picks in ${res.forcedAt.length} frames (add poses near these times):\n` + res.forcedAt.slice(0, 40).map((r) => "  " + r.join(" ")).join("\n"));
  if (res.pairs.length) console.log(`parts passing through each other:\n` + res.pairs.map((p) => "  " + p).join("\n"));
}
await browser.close();
