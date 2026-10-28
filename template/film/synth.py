"""Score for the film, synthesized from film/plan.json (beats + sound cues). No samples, no chimes.
    python3 film/synth.py [--plan film/plan.json] [--out film/score.wav] [--seed 1]
Beat types set the bed (intro, lift, drop, detail, build, outro); cues place the hits:
tap (key/button click), spray (a burst of small clicks), thud (a layer landing), whoosh (whip),
riser, boom, drop/detail/build/end (sections)."""
import os, json, argparse, wave
import numpy as np
from scipy.signal import butter, sosfilt
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--plan", default=os.path.join(HERE, "plan.json"))
ap.add_argument("--out", default=os.path.join(HERE, "score.wav"))
ap.add_argument("--seed", type=int, default=1)
A = ap.parse_args()
P = json.load(open(A.plan))
SR = 48000; DURV = P["duration"]; DUR = DURV + 1.0; N = int(SR * DUR); BPM = P.get("bpm", 120); B = 60 / BPM
rng = np.random.default_rng(A.seed)
L = np.zeros(N); R = np.zeros(N)
def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0: return
    if i < 0: sig = sig[-i:]; i = 0
    j = min(N, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan)); R[i:j] += s * np.sqrt(0.5 * (1 + pan))
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)
def kick(g=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR; f = 45 + 110 * np.exp(-t / 0.035); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t / 0.18) + 0.25 * lp(rng.normal(0, 1, n), 2000) * np.exp(-t / 0.006)) * g
def clap():
    n = int(0.25 * SR); x = bp(rng.normal(0, 1, n), 900, 5000); e = np.zeros(n)
    for o in (0, 0.01, 0.02): e[int(o * SR):] += np.exp(-np.arange(n - int(o * SR)) / SR / 0.012)
    return x * (e * 0.4 + np.exp(-np.arange(n) / SR / 0.09) * 0.6) * 0.5
def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR); return hp(rng.normal(0, 1, n), 7000) * np.exp(-np.arange(n) / SR / (0.06 if open_ else 0.012)) * 0.25
def tap(depth=1.0):  # a press: soft click + low body, no tonal ring
    n = int(0.12 * SR); t = np.arange(n) / SR
    click = bp(rng.normal(0, 1, n), 1800, 6000) * np.exp(-t / 0.004) * 0.5
    body = np.sin(2 * np.pi * (180 - 40 * depth) * t) * np.exp(-t / 0.025) * 0.9 + lp(rng.normal(0, 1, n), 900) * np.exp(-t / 0.02) * 0.6
    return (click + body * (0.6 + 0.4 * depth)) * 0.6
def boom(g=1.0):
    n = int(2.2 * SR); t = np.arange(n) / SR; f = 32 + 60 * np.exp(-t / 0.15); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t / 0.9) + lp(rng.normal(0, 1, n), 400) * np.exp(-t / 0.25) * 0.5) * g
def whoosh(dur=0.35, g=0.5):
    n = int(dur * SR); t = np.arange(n) / SR; x = rng.normal(0, 1, n); m = t / dur
    return (bp(x, 300, 1200) * (1 - m) + bp(x, 1500, 7000) * m) * np.sin(np.pi * m) ** 2 * g
def thud(g=0.6):
    n = int(0.3 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * (70 + 50 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.09) + lp(rng.normal(0, 1, n), 1200) * np.exp(-t / 0.015) * 0.4) * g
def riser(t0, t1, g=0.35):
    n = int((t1 - t0) * SR)
    if n <= SR // 10: return
    m = np.arange(n) / n; x = rng.normal(0, 1, n); out = np.zeros(n); seg = 2400
    for i in range(0, n, seg):
        f = 400 + 6000 * m[i] ** 2; out[i:i + seg] = bp(x[i:i + seg], f * 0.7, min(f * 1.4, 20000))
    add(out * m ** 2 * g, t0)
NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]; ROOT = [45, 41, 36, 43]   # Am F C G
def saw(f, n, det=0.0):
    t = np.arange(n) / SR; ph = (f * (1 + det)) * t; return 2 * (ph - np.floor(ph + 0.5))
def pad(t0, t1, g=0.1):
    for k in range(int(t0 // 4), int(np.ceil(t1 / 4))):
        a = max(t0, k * 4); b = min(t1, k * 4 + 4); n = int((b - a) * SR)
        if n <= 0: continue
        x = lp(sum(saw(NOTE(m), n, d) for m in CH[k % 4] for d in (-0.004, 0.004)), 1400)
        e = np.minimum(1, np.arange(n) / SR / 0.4) * np.minimum(1, (n - np.arange(n)) / SR / 0.3)
        add(x * e * g / 6, a, pan=-0.2); add(x * e * g / 6, a, pan=0.2)
def bass(t0, t1, g=0.5):
    t = t0
    while t < t1 - 1e-6:
        f = NOTE(ROOT[int(t // 4) % 4]); n = int(B / 2 * SR); tt = np.arange(n) / SR
        x = lp(saw(f, n), 500) * 0.6 + np.sin(2 * np.pi * f * tt) * 0.8
        add(x * np.minimum(1, tt / 0.005) * np.exp(-tt / 0.18) * g * (1.0 if round(t / (B / 2)) % 2 else 0.55), t); t += B / 2
def stab(t, g=0.18):
    k = int(t // 4) % 4; n = int(0.18 * SR); tt = np.arange(n) / SR
    add(lp(sum(saw(NOTE(m + 12), n, d) for m in CH[k] for d in (-0.006, 0.006)), 2500) * np.exp(-tt / 0.07) * g / 6, t, pan=0.3)
def grid(t0, t1, step):
    s = np.ceil(t0 / step - 1e-6) * step; return np.arange(s, t1 - 1e-6, step)
# ---------------- bed, by beat ----------------
for b in P["beats"]:
    t0, t1, ty = b["t0"], b["t1"], b["type"]
    if ty == "hero":
        pad(t0, t1, 0.10)
        for t in grid(t0 + (t1 - t0) / 2, t1, B / 2): add(hat(), t, 0.7, pan=0.3)
        bass(t0 + (t1 - t0) / 2, t1, 0.35)
    elif ty == "rise":
        pad(t0, t1, 0.08)
    elif ty in ("explode", "array", "stack"):
        lvl = 1.0 if ty != "explode" else 0.95
        for t in grid(t0, t1, B): add(kick(lvl), t)
        for t in grid(t0 + B, t1, 2 * B): add(clap(), t, 0.85)
        for t in grid(t0, t1, B / 4): add(hat(), t, 0.55 if round(t / (B / 4)) % 2 else 0.35, pan=0.35)
        for t in grid(t0 + B / 2, t1, B): add(hat(True), t, 0.5, pan=-0.3)
        if ty != "explode":
            for t in grid(t0 + B / 2, t1, B): stab(t)
        bass(t0, t1, 0.55); pad(t0, t1, 0.08)
    elif ty in ("part", "action"):
        pad(t0, t1, 0.12)
        for t in grid(t0, t1, B / 2): add(hat(), t, 0.4, pan=0.4)
        for t in grid(t0, t1, B): add(kick(0.35), t)
    elif ty == "assemble":
        pad(t0, t1, 0.11)
        for t in grid(t0, t0 + 1.0, B): add(kick(0.7), t)
        tt = t0 + 1.0; step = B / 2
        while tt < t1 - 0.1:
            add(clap(), tt, 0.25 + 0.6 * (tt - t0) / (t1 - t0)); step = max(B / 8, step * 0.93); tt += step
        bass(t0 + 0.5 * (t1 - t0), t1 - 0.1, 0.4)
    elif ty == "end":
        add(boom(1.1), t0); add(kick(1.0), t0)
        n = int(3.0 * SR); tt = np.arange(n) / SR
        x = lp(sum(saw(NOTE(m), n, d) for m in [57, 64, 69, 72] for d in (-0.004, 0.004)), 1800)
        for pn in (-0.2, 0.2): add(x * np.minimum(1, tt / 0.05) * np.exp(-tt / 1.1) * 0.13 / 6, t0, pan=pn)
# ---------------- hits, from the cues ----------------
for e in P["events"]:
    t, k = e["t"], e["kind"]
    if k == "tap":
        for j in range(e.get("n", 1)): add(tap(e.get("depth", 0.7 + 0.3 * rng.random())), t + j * 0.018 + rng.random() * 0.01, 0.55 * e.get("g", 1.0), pan=e.get("pan", 0.0))
    elif k == "spray":
        n = e.get("n", 30); t1 = e.get("t1", t + 1.0)
        for j in range(n):
            add(tap(0.3 + 0.5 * rng.random()), t + (t1 - t) * (j / n) ** 1.2 + rng.random() * 0.05, 0.18 + 0.12 * rng.random(), pan=-0.8 + 1.6 * rng.random())
    elif k == "thud": add(thud(0.55), t + 0.02, pan=0.1)
    elif k == "whoosh": add(whoosh(0.4, 0.7 * e.get("g", 1.0)), t)
    elif k == "riser": riser(t, e.get("t1", t + 1.5), e.get("g", 0.4))
    elif k == "boom": add(boom(e.get("g", 0.9)), t)
    elif k == "drop": add(boom(0.9 if e.get("level", 1) == 1 else 1.0), t)
# ---------------- master ----------------
mix = np.stack([L, R], 1); mix = hp(mix.T, 25).T
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.98
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
fade = np.ones(N); f0 = int((DURV - 0.4) * SR); fade[f0:] = np.linspace(1, 0, N - f0); mix *= fade[:, None]
mix = mix[: int(DURV * SR)] * 0.9
with wave.open(A.out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("score", A.out, f"{DURV:.2f} s")
