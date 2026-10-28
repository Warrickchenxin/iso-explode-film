#!/usr/bin/env node
// Start a new film project from the template, install what it needs, prove the toolchain.
//   node <skill>/scripts/new-project.mjs <dir>
// Then edit object/film.mjs (SPEC), object/geometry.mjs (the object), motion/story.mjs (the beats).
import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(process.argv[2] ?? "iso-film");
if (existsSync(join(dir, "object", "geometry.mjs"))) throw new Error(`${dir} already holds a project`);
cpSync(join(SKILL, "template"), dir, { recursive: true, filter: (p) => !/node_modules|[\\/]out[\\/]?$|\.html$|plan\.json$|score\.wav$|[\\/]fonts[\\/]?/.test(p) });
const run = (cmd, opt = {}) => { console.log("$ " + cmd); execSync(cmd, { cwd: dir, stdio: "inherit", ...opt }); };
run("npm install --no-audit --no-fund");
const pip = "pip install playwright numpy scipy pillow opencv-python-headless fonttools brotli -q";
try { run(pip + " --break-system-packages"); } catch { run(pip); }
try { execSync(`python3 -c "from playwright.sync_api import sync_playwright as s; p=s().start(); b=p.chromium.launch(); b.close(); p.stop()"`, { stdio: "ignore" }); }
catch { run("python3 -m playwright install chromium"); }
try { run("bash film/get_fonts.sh"); } catch { console.warn("fonts: download failed — cards fall back to a system CJK font"); }
run("node motion/build.mjs --look split");
run("node motion/build.mjs --look dark");
run("node motion/scan.mjs motion/motion-split.html");
console.log(`\nready: ${dir}\n  the demo object (a power bank) builds and scans clean. Replace it with yours.`);
