"""Tile frames into one sheet for checking.  python3 film/contact_sheet.py OUT.jpg IMG [IMG ...] [--cols 3 --width 640]
IMG may be frame files, or a video file followed by --times 1,6.5,11 (seconds) to pull frames with ffmpeg."""
import sys, os, argparse, subprocess, tempfile
from PIL import Image, ImageDraw
ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("inputs", nargs="+")
ap.add_argument("--cols", type=int, default=3); ap.add_argument("--width", type=int, default=640)
ap.add_argument("--times", default="")
A = ap.parse_args()
files = A.inputs
if A.times and len(files) == 1 and files[0].lower().endswith((".mp4", ".mov", ".mkv")):
    tmp = tempfile.mkdtemp(); vid = files[0]; files = []
    for i, t in enumerate(A.times.split(",")):
        p = os.path.join(tmp, f"c{i:03d}.jpg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", t, "-i", vid, "-frames:v", "1", p], check=True)
        files.append(p)
ims = [Image.open(f).convert("RGB") for f in files]
w = A.width; h = int(ims[0].height * w / ims[0].width)
rows = (len(ims) + A.cols - 1) // A.cols
sheet = Image.new("RGB", (w * A.cols, h * rows), "white")
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % A.cols) * w, (i // A.cols) * h
    sheet.paste(im.resize((w, h)), (x, y))
    d.text((x + 6, y + 4), os.path.basename(f) if not A.times else f"t={A.times.split(',')[i]}s", fill=(255, 0, 255))
sheet.save(A.out, quality=90)
print(A.out, sheet.size)
