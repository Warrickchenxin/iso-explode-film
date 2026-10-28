"""Inventory of a STEP / IGES assembly: one record per solid, ready to turn into convex parts.

    pip install cadquery-ocp numpy scipy pillow        (OCP = OpenCascade for Python)
    python3 cad_inventory.py MODEL.step OUT_DIR [--level-x DEG] [--level-y DEG] [--glb]

Writes to OUT_DIR:
  parts.json   [{name, path, bbox:[x0,y0,z0,x1,y1,z1], size, vol, faces, color, hull:[[x,y],…]}]  (mm)
  summary.txt  layer candidates (solids grouped by z band), repeated-part candidates (arrays),
               the largest solids, the colours used
  plan.png     top view: every solid's plan hull, coloured by height (check the layout at a glance)
  side.png     front view: z extent of every solid (check the stacking)
  model.glb    (--glb) a triangulated copy for any 3D viewer
--level-x / --level-y rotate the whole model first (e.g. a keyboard whose CAD is tilted 5°).
Nothing here decides the film: read summary.txt, then write the product spec by hand."""
import sys, os, json, math, argparse
import numpy as np
from scipy.spatial import ConvexHull
from PIL import Image, ImageDraw
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.IGESCAFControl import IGESCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ColorType
from OCP.TDF import TDF_Label, TDF_ChildIterator
from OCP.TDataStd import TDataStd_Name
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopLoc import TopLoc_Location
from OCP.Quantity import Quantity_Color
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Trsf, gp_Ax1, gp_Pnt, gp_Dir
_face = getattr(TopoDS, "Face_s", None) or TopoDS.Face          # OCP versions differ
_tri = getattr(BRep_Tool, "Triangulation_s", None) or BRep_Tool.Triangulation

ap = argparse.ArgumentParser()
ap.add_argument("model"); ap.add_argument("out")
ap.add_argument("--level-x", type=float, default=0.0); ap.add_argument("--level-y", type=float, default=0.0)
ap.add_argument("--glb", action="store_true")
ap.add_argument("--mesh", type=float, default=0.2, help="mesh deflection (mm) used for the plan hulls")
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

doc = TDocStd_Document(TCollection_ExtendedString("doc"))
ext = A.model.lower().rsplit(".", 1)[-1]
r = IGESCAFControl_Reader() if ext in ("igs", "iges") else STEPCAFControl_Reader()
r.SetNameMode(True); r.SetColorMode(True)
if r.ReadFile(A.model) != 1: raise SystemExit(f"cannot read {A.model}")
r.Transfer(doc)
st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main()); ct = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
TR = gp_Trsf()
if A.level_x: TR.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), -math.radians(A.level_x))
if A.level_y:
    T2 = gp_Trsf(); T2.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 1, 0)), -math.radians(A.level_y)); TR = T2.Multiplied(TR)

def name(l):
    a = TDataStd_Name()
    return a.Get().ToExtString() if l.FindAttribute(TDataStd_Name.GetID_s(), a) else "?"
def colour(l, shape):
    c = Quantity_Color()
    for t in (XCAFDoc_ColorType.XCAFDoc_ColorSurf, XCAFDoc_ColorType.XCAFDoc_ColorGen):
        if ct.GetColor_s(l, t, c) or ct.GetColor(shape, t, c):
            return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in (c.Red(), c.Green(), c.Blue()))
    return None
def plan_hull(sh):
    pts = []
    e = TopExp_Explorer(sh, TopAbs_FACE)
    while e.More():
        f = _face(e.Current()); loc = TopLoc_Location()
        tri = _tri(f, loc)
        if tri is not None:
            T = loc.Transformation()
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(T); pts.append((p.X(), p.Y()))
        e.Next()
    if len(pts) < 3: return []
    P = np.unique(np.round(np.array(pts), 2), axis=0)
    try: h = ConvexHull(P); return [[round(float(x), 2), round(float(y), 2)] for x, y in P[h.vertices]]
    except Exception: return []

out, meshed = [], set()
def walk(l, loc, path):
    if st.IsReference_s(l):
        ref = TDF_Label(); st.GetReferredShape_s(l, ref)
        walk(ref, loc.Multiplied(st.GetLocation_s(l)), path); return
    nm = name(l)
    if st.IsAssembly_s(l):
        it = TDF_ChildIterator(l, False)
        while it.More():
            c = it.Value(); it.Next()
            if st.IsComponent_s(c): walk(c, loc, path + [nm])
        return
    base = st.GetShape_s(l)
    if l.Tag() not in meshed: BRepMesh_IncrementalMesh(base, A.mesh, False, 0.4, True); meshed.add(l.Tag())
    sh = base.Moved(TopLoc_Location(TR).Multiplied(loc))
    b = Bnd_Box(); BRepBndLib.Add_s(sh, b, True)
    if b.IsVoid(): return
    p0, p1 = b.CornerMin(), b.CornerMax()
    bb = [p0.X(), p0.Y(), p0.Z(), p1.X(), p1.Y(), p1.Z()]
    g = GProp_GProps(); BRepGProp.VolumeProperties_s(sh, g)
    nf = 0; e = TopExp_Explorer(sh, TopAbs_FACE)
    while e.More(): nf += 1; e.Next()
    out.append(dict(name=nm, path="/".join(path[-3:]), bbox=[round(v, 3) for v in bb], size=[round(bb[3] - bb[0], 2), round(bb[4] - bb[1], 2), round(bb[5] - bb[2], 2)],
                    vol=round(g.Mass(), 2), faces=nf, color=colour(l, sh), hull=plan_hull(sh)))
it = TDF_ChildIterator(st.Label(), False)
while it.More():
    c = it.Value(); it.Next()
    if st.IsFree_s(c) and st.IsTopLevel(c): walk(c, TopLoc_Location(), [])
json.dump(out, open(os.path.join(A.out, "parts.json"), "w"), ensure_ascii=False, indent=0)

# ---------- summary ----------
B = np.array([p["bbox"] for p in out]); lo, hi = B[:, :3].min(0), B[:, 3:].max(0)
lines = [f"{len(out)} solids · overall {hi[0]-lo[0]:.1f} × {hi[1]-lo[1]:.1f} × {hi[2]-lo[2]:.1f} mm · x {lo[0]:.1f}..{hi[0]:.1f}  y {lo[1]:.1f}..{hi[1]:.1f}  z {lo[2]:.1f}..{hi[2]:.1f}", ""]
lines.append("LAYER CANDIDATES — solids grouped by z band (bottom → top):")
order = sorted(range(len(out)), key=lambda i: (out[i]["bbox"][2], out[i]["bbox"][5]))
bands = []
for i in order:
    z0, z1 = out[i]["bbox"][2], out[i]["bbox"][5]
    if bands and z0 < bands[-1]["z1"] - 0.3 and abs(z0 - bands[-1]["z0"]) < 3: bands[-1]["ids"].append(i); bands[-1]["z1"] = max(bands[-1]["z1"], z1)
    else: bands.append(dict(z0=z0, z1=z1, ids=[i]))
for b_ in bands:
    names = {}
    for i in b_["ids"]: names[out[i]["name"]] = names.get(out[i]["name"], 0) + 1
    top = ", ".join(f"{k}×{v}" if v > 1 else k for k, v in sorted(names.items(), key=lambda kv: -kv[1])[:6])
    lines.append(f"  z {b_['z0']:7.2f}–{b_['z1']:7.2f}  {len(b_['ids']):4d} solids  {top}")
lines += ["", "REPEATED PARTS (array candidates) — same size, 4+ copies:"]
groups = {}
for i, p in enumerate(out): groups.setdefault(tuple(round(v, 0) for v in sorted(p["size"])), []).append(i)
for k, ids in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    if len(ids) >= 4: lines.append(f"  {len(ids):4d} × {out[ids[0]]['name']:<30s} size {out[ids[0]]['size']}  z {out[ids[0]]['bbox'][2]:.1f}–{out[ids[0]]['bbox'][5]:.1f}")
lines += ["", "LARGEST SOLIDS (case, plates, boards):"]
for i in sorted(range(len(out)), key=lambda i: -out[i]["size"][0] * out[i]["size"][1])[:12]:
    p = out[i]; lines.append(f"  {p['name']:<34s} {p['size']}  z {p['bbox'][2]:.1f}–{p['bbox'][5]:.1f}  {p['color']}")
cols = {}
for p in out: cols[p["color"]] = cols.get(p["color"], 0) + 1
lines += ["", "COLOURS: " + ", ".join(f"{k} ×{v}" for k, v in sorted(cols.items(), key=lambda kv: -kv[1]))]
open(os.path.join(A.out, "summary.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))

# ---------- pictures ----------
S = 1600 / max(hi[0] - lo[0], hi[1] - lo[1])
im = Image.new("RGB", (int((hi[0] - lo[0]) * S) + 40, int((hi[1] - lo[1]) * S) + 40), "white"); d = ImageDraw.Draw(im)
for i in sorted(range(len(out)), key=lambda i: out[i]["bbox"][5]):
    p = out[i]
    if len(p["hull"]) < 3: continue
    k = (p["bbox"][5] - lo[2]) / max(1e-6, hi[2] - lo[2]); c = (int(40 + 200 * k), int(90 + 80 * (1 - k)), int(230 - 180 * k))
    d.polygon([((x - lo[0]) * S + 20, (hi[1] - y) * S + 20) for x, y in p["hull"]], outline=c)
im.save(os.path.join(A.out, "plan.png"))
Sz = 1600 / max(hi[0] - lo[0], 1)
im = Image.new("RGB", (int((hi[0] - lo[0]) * Sz) + 40, int((hi[2] - lo[2]) * Sz * 3) + 40), "white"); d = ImageDraw.Draw(im)
for p in out:
    b_ = p["bbox"]; d.rectangle([(b_[0] - lo[0]) * Sz + 20, (hi[2] - b_[5]) * Sz * 3 + 20, (b_[3] - lo[0]) * Sz + 20, (hi[2] - b_[2]) * Sz * 3 + 20], outline=(60, 60, 200))
im.save(os.path.join(A.out, "side.png"))
if A.glb:
    from OCP.RWGltf import RWGltf_CafWriter
    from OCP.collections import IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString as IDM
    from OCP.Message import Message_ProgressRange
    RWGltf_CafWriter(TCollection_AsciiString(os.path.join(A.out, "model.glb")), True).Perform(doc, IDM(), Message_ProgressRange())
print(f"wrote {A.out}/parts.json, summary.txt, plan.png, side.png" + (", model.glb" if A.glb else ""))
