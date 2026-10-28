"""Inventory of a mesh model (STL / OBJ / 3MF / GLB / GLTF / PLY): one record per body.

    pip install trimesh numpy scipy pillow
    python3 mesh_inventory.py MODEL OUT_DIR [--scale 1] [--up z|y] [--split] [--level-x DEG]

Bodies are the scene's named nodes (GLB/3MF/OBJ groups). A single-mesh file (typical STL)
is split into connected pieces with --split. --scale converts units to mm (e.g. 1000 for
metres, 25.4 for inches); --up y rotates Y-up files (most GLB) to z-up.
Writes parts.json, summary.txt, plan.png, side.png — the same format as cad_inventory.py."""
import os, json, math, argparse
import numpy as np, trimesh
from scipy.spatial import ConvexHull
from PIL import Image, ImageDraw
ap = argparse.ArgumentParser()
ap.add_argument("model"); ap.add_argument("out")
ap.add_argument("--scale", type=float, default=1.0); ap.add_argument("--up", default="z", choices=["z", "y"])
ap.add_argument("--split", action="store_true"); ap.add_argument("--level-x", type=float, default=0.0)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
sc = trimesh.load(A.model, force="scene")
M = np.eye(4); M[:3, :3] *= A.scale
if A.up == "y": M = trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]) @ M
if A.level_x: M = trimesh.transformations.rotation_matrix(-math.radians(A.level_x), [1, 0, 0]) @ M
# auto units: a model smaller than 5 units overall is almost certainly in metres
ext0 = sc.extents if sc.extents is not None else np.ones(3)
if A.scale == 1.0 and max(ext0) < 5: M[:3, :3] *= 1000; print("units look like metres: scaled ×1000 (use --scale to override)")
# group geometry nodes into bodies: CAD exports often write one node per face, so when there
# are many nodes, merge every geometry node under the same parent node
nodes = list(sc.graph.nodes_geometry)
parents = sc.graph.transforms.parents if hasattr(sc.graph.transforms, "parents") else {}
by = {}
for node in nodes: by.setdefault(parents.get(node, node) if len(nodes) > 2000 else node, []).append(node)
bodies = []
for key, members in by.items():
    ms = []
    for node in members:
        T, gname = sc.graph[node]
        g = sc.geometry[gname]
        if not isinstance(g, trimesh.Trimesh) or len(g.faces) == 0: continue
        m = g.copy(); m.apply_transform(M @ T); ms.append(m)
    if not ms: continue
    m = trimesh.util.concatenate(ms) if len(ms) > 1 else ms[0]
    node = key
    pieces = m.split(only_watertight=False) if A.split else [m]
    for k, p in enumerate(pieces):
        col = None
        try:
            c = p.visual.main_color if hasattr(p.visual, "main_color") else None
            if c is not None: col = "#%02x%02x%02x" % tuple(int(v) for v in c[:3])
        except Exception: pass
        bodies.append((f"{node}" + (f".{k}" if len(pieces) > 1 else ""), p, col))
out = []
for name, p, col in bodies:
    b = p.bounds; xy = np.unique(np.round(p.vertices[:, :2], 2), axis=0)
    try: hv = ConvexHull(xy).vertices; hull = [[round(float(x), 2), round(float(y), 2)] for x, y in xy[hv]]
    except Exception: hull = []
    vol = float(abs(p.volume)) if p.is_watertight else None
    out.append(dict(name=name, path="", bbox=[round(float(v), 3) for v in (*b[0], *b[1])], size=[round(float(v), 2) for v in (b[1] - b[0])],
                    vol=None if vol is None else round(vol, 2), faces=int(len(p.faces)), color=col, hull=hull))
json.dump(out, open(os.path.join(A.out, "parts.json"), "w"), ensure_ascii=False, indent=0)
B = np.array([p["bbox"] for p in out]); lo, hi = B[:, :3].min(0), B[:, 3:].max(0)
lines = [f"{len(out)} bodies · overall {hi[0]-lo[0]:.1f} × {hi[1]-lo[1]:.1f} × {hi[2]-lo[2]:.1f} (after --scale; should be mm)", "",
         "LAYER CANDIDATES — bodies by z (bottom → top):"]
for i in sorted(range(len(out)), key=lambda i: out[i]["bbox"][2])[:200]:
    p = out[i]; lines.append(f"  z {p['bbox'][2]:8.2f}–{p['bbox'][5]:8.2f}  {p['name'][:40]:<40s} {p['size']}")
groups = {}
for i, p in enumerate(out): groups.setdefault(tuple(round(v, 0) for v in sorted(p["size"])), []).append(i)
lines += ["", "REPEATED PARTS (array candidates) — same size, 4+ copies:"]
for k, ids in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    if len(ids) >= 4: lines.append(f"  {len(ids):4d} × {out[ids[0]]['name'][:30]:<30s} size {out[ids[0]]['size']}")
open(os.path.join(A.out, "summary.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines[:60]))
S = 1600 / max(hi[0] - lo[0], hi[1] - lo[1], 1e-6)
im = Image.new("RGB", (int((hi[0] - lo[0]) * S) + 40, int((hi[1] - lo[1]) * S) + 40), "white"); d = ImageDraw.Draw(im)
for p in sorted(out, key=lambda p: p["bbox"][5]):
    if len(p["hull"]) < 3: continue
    k = (p["bbox"][5] - lo[2]) / max(1e-6, hi[2] - lo[2])
    d.polygon([((x - lo[0]) * S + 20, (hi[1] - y) * S + 20) for x, y in p["hull"]], outline=(int(40 + 200 * k), int(90 + 80 * (1 - k)), int(230 - 180 * k)))
im.save(os.path.join(A.out, "plan.png"))
Sz = 1600 / max(hi[0] - lo[0], 1e-6)
im = Image.new("RGB", (int((hi[0] - lo[0]) * Sz) + 40, int((hi[2] - lo[2]) * Sz * 3) + 40), "white"); d = ImageDraw.Draw(im)
for p in out:
    b_ = p["bbox"]; d.rectangle([(b_[0] - lo[0]) * Sz + 20, (hi[2] - b_[5]) * Sz * 3 + 20, (b_[3] - lo[0]) * Sz + 20, (hi[2] - b_[2]) * Sz * 3 + 20], outline=(60, 60, 200))
im.save(os.path.join(A.out, "side.png"))
print(f"wrote {A.out}/parts.json, summary.txt, plan.png, side.png")
