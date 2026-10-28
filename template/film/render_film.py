"""Render the film: kit frames (object only, transparent) -> per-frame perspective warp ->
background (split table in 3D, or dark) -> motion blur -> text cards and layer labels.

    python3 film/render_film.py OUTDIR --look split|dark [--frames 0,30,60 | --start 0 --end 900]
                                [--every K --offset k]   (worker k of K renders frames k, k+K, ...)

Reads film/plan.json and motion/motion-<look>.html (both written by motion/build.mjs).
Frames are written as OUTDIR/f_00000.jpg. Nothing in here is specific to one object."""
import os, json, math, argparse
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--look", default="split", choices=["split", "dark"])
ap.add_argument("--html", default="")
ap.add_argument("--plan", default=os.path.join(HERE, "plan.json"))
ap.add_argument("--start", type=int, default=0); ap.add_argument("--end", type=int, default=-1)
ap.add_argument("--frames", default="")
ap.add_argument("--every", type=int, default=1); ap.add_argument("--offset", type=int, default=0)
ap.add_argument("--maxsub", type=int, default=12, help="most motion-blur subframes per frame")
ap.add_argument("--chrome", default=os.environ.get("CHROME_PATH", ""))
ap.add_argument("--png", action="store_true")
ap.add_argument("--force", action="store_true", help="re-render frames that already exist")
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
PLAN = json.load(open(A.plan))
HTML = A.html or os.path.join(ROOT, "motion", f"motion-{A.look}.html")
FPS = PLAN.get("fps", 30)
W, H = PLAN["W"], PLAN["H"]
C = np.array([W / 2, H / 2])
RAD = PLAN["radius"]; SR = RAD / 270.0          # every length below was tuned at radius 270
B = PLAN["bounds"]
F_PX = 3.6328 * 1003.0 * (W / 1920)             # focal length (px), fitted once to an ad photo
D_MIN = 450.0 * SR                              # closest camera distance (mm): limits macro distortion
TABLE_Z = B[2][0]
DARK_LOOK = A.look == "dark"

# ---------------- page helpers ----------------
JS_PROJ = """([t, pts, M]) => {
  const s = at(t); if (M) s.zoom = s.zoom / M; const v = viewOf(s);
  const {V} = DATA.basis; const out = [];
  for (const p of pts) { const w = about(v.M, p); const [x, y] = screenOf(w);
    out.push([((x - v.x) / v.w) * DATA.W * 2, ((y - v.y) / v.w) * DATA.W * 2, w[0]*V[0] + w[1]*V[1] + w[2]*V[2]]); }
  const fa = typeof s.focus.a === 'string' ? DATA.anchors[s.focus.a] : s.focus.a;
  const fb = typeof s.focus.b === 'string' ? DATA.anchors[s.focus.b] : s.focus.b;
  const fp = fa.map((q, i) => q + (fb[i] - q) * s.focus.e);
  const wf = about(v.M, fp); const [fx, fy] = screenOf(wf);
  return { pts: out, focus: [((fx - v.x) / v.w) * DATA.W * 2, ((fy - v.y) / v.w) * DATA.W * 2, wf[0]*V[0]+wf[1]*V[1]+wf[2]*V[2]], fworld: fp,
           pxmm: DATA.basis.k * DATA.W * 2 / v.w, fv: FV(t), speed: speed(t, 1/30) };
}"""

def make_persp(info, sign):
    s = info["pxmm"]; d = max(D_MIN, F_PX / s)
    zf = info["focus"][2] * sign
    def P(q, z):
        q = np.asarray(q, float); zr = np.clip(np.asarray(z, float) * sign - zf, -0.6 * d, 0.6 * d)
        k = (d / (d - zr))[..., None]
        return C + (q - C) * k
    return P, d

def margin_at(t):
    for m in PLAN.get("margins", []):
        if m["t0"] <= t <= m["t1"]: return m["m"]
    return 1.45

def homography(page, t, sign, plane_z, M, cx=0.0, cy=0.0):
    half = 260.0 * SR
    pts = [[cx - half, cy - half, plane_z], [cx + half, cy - half, plane_z], [cx + half, cy + half, plane_z], [cx - half, cy + half, plane_z]]
    info = page.evaluate(JS_PROJ, [t, pts, 1])
    q = np.array([p[:2] for p in info["pts"]]); z = np.array([p[2] for p in info["pts"]])
    P, d = make_persp(info, sign)
    small = page.evaluate(JS_PROJ, [t, pts, M])
    qs = np.array([p[:2] for p in small["pts"]]) * M
    Hm, _ = cv2.findHomography(qs.astype(np.float32), P(q, z).astype(np.float32))
    return Hm, info, P

# ---------------- backgrounds ----------------
LA, LB = np.array([208.0, -270.5]) * SR, np.array([-157.9, 214.5]) * SR   # split line on the table, object X,Y (mm)
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
GRAIN = np.random.default_rng(7).normal(0, 2.0, (H, W, 1)).astype(np.float32)

def dark_image():
    yy, xx = YY / H, XX / W
    img = np.ones((H, W, 3), np.float32) * np.array([7, 8, 11], np.float32)
    def glow(cx, cy, rx, ry, col, a):
        d = np.clip(1 - np.hypot((xx - cx) / rx, (yy - cy) / ry), 0, 1) ** 2
        return d[..., None] * np.array(col, np.float32) * a
    img += glow(0.02, 0.0, 0.55, 0.75, [30, 120, 112], 0.75)
    img += glow(1.0, 0.62, 0.45, 0.7, [112, 124, 200], 0.75)
    img += glow(0.0, 1.05, 0.4, 0.45, [80, 30, 74], 0.5)
    img += glow(0.5, 0.5, 0.6, 0.6, [18, 18, 24], 0.6)
    return img
DARK = None

def table_image(page, t, sign):
    """Grey / orange split table, drawn in 3D: every pixel is mapped back to the table plane."""
    global DARK
    if DARK_LOOK:
        if DARK is None: DARK = dark_image()
        return DARK
    E = 600 * SR
    pts = [[-x, y, TABLE_Z] for x, y in [(-E, -E), (E, -E), (E, E), (-E, E)]]
    info = page.evaluate(JS_PROJ, [t, pts])
    q = np.array([p[:2] for p in info["pts"]]); z = np.array([p[2] for p in info["pts"]])
    P, _ = make_persp(info, sign)
    src = np.array([[-E, -E], [E, -E], [E, E], [-E, E]], np.float32)
    Hs2t, _ = cv2.findHomography(P(q, z).astype(np.float32), src)
    v = np.stack([XX, YY, np.ones_like(XX)], -1) @ Hs2t.T.astype(np.float32)
    w = v[..., 2:3]; ok = w > 1e-6
    X = v[..., 0:1] / np.where(ok, w, 1) / SR; Y = v[..., 1:2] / np.where(ok, w, 1) / SR   # back to radius-270 units
    la, lb = LA / SR, LB / SR; ab = lb - la
    dist = (ab[0] * (Y - la[1]) - ab[1] * (X - la[0])) / np.linalg.norm(ab)
    edge = np.where(ok, np.clip(-dist * 2.5 * SR + 0.5, 0, 1), 0)       # 1 = orange side
    gx = np.clip((X + 450) / 900, 0, 1)
    grey = (247 - 34 * gx - 8 * np.clip((-Y) / 600, 0, 1)) * np.ones((1, 1, 3), np.float32)
    light = np.array([246, 134, 88], np.float32); mid = np.array([232, 104, 64], np.float32); dk = np.array([205, 80, 50], np.float32)
    fl = np.clip(np.hypot(X + 250, Y - 330) / 600, 0, 1)
    orange = light * (1 - fl) + mid * fl
    sh = np.clip(1 - np.hypot((X - 230) / 260, (Y - 20) / 200), 0, 1) ** 1.5
    orange = orange * (1 - 0.45 * sh) + dk * (0.45 * sh)
    return grey * (1 - edge) + orange * edge

# ---------------- type ----------------
def _find_font(weight):
    for p in [os.path.join(HERE, "fonts", f"H_{weight}.ttf")]:
        if os.path.exists(p): return p
    for p in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Light.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
              "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "/System/Library/Fonts/PingFang.ttc", "C:/Windows/Fonts/msyh.ttc"]:
        if os.path.exists(p): return p
    raise SystemExit("no font: run film/get_fonts.sh (HarmonyOS Sans SC) or install Noto Sans CJK")
FT = {w: _find_font(w) for w in ["Thin", "Light", "Regular"]}
_fc = {}
def font(w, size):
    k = (w, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(FT[w], size)
    return _fc[k]
INK = ((24, 24, 27), (88, 88, 94)); WHITE = ((248, 246, 242), (226, 222, 214))
S_UI = W / 1920

def fade(t, t0, t1, fi=0.22, fo=0.18):
    if t < t0 or t > t1: return 0.0
    return min(1.0, (t - t0) / fi, (t1 - t) / fo)

def draw_cards(t):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    c1, c2 = WHITE if DARK_LOOK else INK
    for c in PLAN["cards"]:
        a = fade(t, c["t0"], c["t1"])
        if a <= 0: continue
        e = 1 - (1 - min(1, (t - c["t0"]) / 0.35)) ** 3
        dy = int(18 * (1 - e) * S_UI)
        big, small = c["big"], c.get("small", "")
        bf = font("Thin", int((150 if len(big) <= 4 else 124) * S_UI)); sf = font("Light", int(30 * S_UI))
        x, y = c["x"] * S_UI, c["y"] * S_UI
        d.text((x, y + dy), big, font=bf, fill=c1 + (int(255 * a),))
        if small: d.text((x + 6 * S_UI, y + dy + 180 * S_UI), small, font=sf, fill=c2 + (int(255 * a),))
    return ov

def draw_labels(ov, page, t, M, Hm):
    win = PLAN.get("labels")
    if not win or not (win["t0"] <= t <= win["t1"] + 0.2): return
    fv = page.evaluate(JS_PROJ, [t, []])["fv"]
    items = PLAN["labelItems"]; pts = []
    for it in items:
        dz = sum(fv.get(g, 0) * w for g, w in it["follow"])
        x, y, z = it["point"]; pts.append([x, y, z + dz])
    small = page.evaluate(JS_PROJ, [t, pts, M])
    q = np.array([p[:2] for p in small["pts"]], np.float32) * M
    qq = cv2.perspectiveTransform(q.reshape(-1, 1, 2), Hm).reshape(-1, 2)
    d = ImageDraw.Draw(ov)
    ink = (240, 238, 234) if DARK_LOOK else (24, 24, 27); sub = (150, 152, 160) if DARK_LOOK else (110, 110, 116)
    XL = 1460 * S_UI
    # keep the label rows at least 34 px apart, in their order
    order = sorted(range(len(items)), key=lambda i: qq[i][1]); ys = {i: qq[i][1] for i in order}
    gap = 34 * S_UI
    for k in range(1, len(order)): ys[order[k]] = max(ys[order[k]], ys[order[k - 1]] + gap)
    for i, it in enumerate(items):
        tr = max(1e-3, it.get("travel", 1))
        a = min(1.0, abs(fv.get(f"L.{it['id']}", 0)) / (0.6 * tr)) * fade(t, win["t0"], win["t1"] + 0.2, 0.01, 0.2)
        if a <= 0.01: continue
        x, y = qq[i]; A_ = int(255 * a)
        r = 4 * S_UI
        yl = ys[i]
        d.ellipse([x - r, y - r, x + r, y + r], fill=ink + (A_,))
        d.line([(x + 6 * S_UI, y), (XL - 60 * S_UI, y), (XL - 16 * S_UI, yl)], fill=ink + (int(A_ * 0.55),), width=max(1, int(2 * S_UI)))
        y = yl
        d.text((XL, y - 22 * S_UI), it["zh"], font=font("Regular", int(32 * S_UI)), fill=ink + (A_,))
        tw = d.textlength(it["zh"], font=font("Regular", int(32 * S_UI)))
        d.text((XL + tw + 16 * S_UI, y - 9 * S_UI), it.get("en", ""), font=font("Light", int(15 * S_UI)), fill=sub + (A_,))

# ---------------- main loop ----------------
N = int(round(PLAN["duration"] * FPS))
if A.frames: FR = [int(x) for x in A.frames.split(",")]
else: FR = list(range(A.start, N if A.end < 0 else A.end))
FR = FR[A.offset::A.every]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=A.chrome or None, args=["--no-sandbox"])
    PAGES = {}
    def get_page(m):
        if m not in PAGES:
            pg = b.new_page(viewport={"width": W // 2, "height": H // 2}, device_scale_factor=2 * m)
            pg.goto("file://" + os.path.abspath(HTML)); pg.wait_for_function("window.ready === true")
            pg.evaluate("() => { document.body.style.margin = 0; }")
            PAGES[m] = (pg, pg.locator(".mo").first)
        return PAGES[m]
    page, root = get_page(1.45)
    # depth sign: at the end (hero view) the front-right top corner is nearer than the back-left one
    zt = B[2][1]
    cal = page.evaluate(JS_PROJ, [PLAN["duration"] - 0.1, [[0.85 * B[0][1], 0.7 * B[1][0], zt], [0.85 * B[0][0], 0.7 * B[1][1], zt]]])
    sign = 1.0 if cal["pts"][1][2] > cal["pts"][0][2] else -1.0
    for fi in FR:
        outp = os.path.join(A.out, f"f_{fi:05d}." + ("png" if A.png else "jpg"))
        if os.path.exists(outp) and not A.force: continue
        t = fi / FPS
        M = margin_at(t)
        page, root = get_page(M)
        sp = page.evaluate(JS_PROJ, [t, []])["speed"]
        n = int(max(1, min(A.maxsub, math.ceil(sp / 7.0))))
        acc = np.zeros((H, W, 3), np.float32); H_mid = None
        for i in range(n):
            ts = t + ((i + 0.5) / n - 0.5) / FPS if n > 1 else t
            page.evaluate(f"() => {{ const s = at({ts}); s.zoom = s.zoom / {M}; applyState(s); }}")
            png = root.screenshot(type="png", omit_background=True)
            obj = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_UNCHANGED)
            # feather the edge of the over-rendered frame: parts leaving it fade instead of being cut
            oh, ow = obj.shape[:2]; fe = int(0.09 * oh)
            ry = np.clip(np.minimum(np.arange(oh), oh - 1 - np.arange(oh)) / fe, 0, 1)
            rx = np.clip(np.minimum(np.arange(ow), ow - 1 - np.arange(ow)) / fe, 0, 1)
            obj = obj.copy(); obj[..., 3] = (obj[..., 3] * (ry[:, None] * rx[None, :]) ** 0.7).astype(np.uint8)
            fw = page.evaluate(JS_PROJ, [ts, []])["fworld"]
            Hm, info, P = homography(page, ts, sign, fw[2], M, cx=fw[0], cy=fw[1])
            warp = cv2.warpPerspective(obj, Hm, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)).astype(np.float32)
            bg = table_image(page, ts, sign)
            a = warp[..., 3:4] / 255.0
            acc += bg * (1 - a) + warp[..., 2::-1] * a
            if i == n // 2 or H_mid is None: H_mid = Hm
        img = np.clip(acc / n + GRAIN, 0, 255).astype(np.uint8)
        pil = Image.fromarray(img).convert("RGBA")
        ov = draw_cards(t)
        draw_labels(ov, page, t, M, H_mid)
        pil.alpha_composite(ov)
        pil.convert("RGB").save(outp, quality=94)
        print(f"frame {fi} t={t:.3f} sub={n} margin={M}", flush=True)
    b.close()
