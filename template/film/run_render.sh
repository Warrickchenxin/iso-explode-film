#!/usr/bin/env bash
# Render the whole film: build pages -> score -> frames in parallel -> MP4 (with and without sound) -> contact sheet.
#   bash film/run_render.sh [split|dark|both] [workers]      (env DURATION=… RATIO=16:9 to override)
# Works the same on a laptop CPU, a cloud workspace or a rented server (AutoDL etc.): only the
# worker count changes. Re-running resumes: frames already on disk are skipped.
set -e
cd "$(dirname "$0")/.."
LOOKS=${1:-both}; [ "$LOOKS" = both ] && LOOKS="split dark"
NW=${2:-$(python3 -c "import os; print(max(1, (os.cpu_count() or 2) - 1))")}
mkdir -p out
TITLE=$(node -e 'import("./object/film.mjs").then(m=>console.log(m.FILM.title.replace(/[^A-Za-z0-9_-]+/g,"_")))')
for L in $LOOKS; do node motion/build.mjs --look $L --ratio ${RATIO:-16:9} ${DURATION:+--duration $DURATION}; done
python3 film/synth.py --out out/score.wav
for L in $LOOKS; do
  OUT=out/frames-$L; mkdir -p $OUT
  echo "rendering $L with $NW workers …"
  for k in $(seq 0 $((NW-1))); do
    python3 film/render_film.py $OUT --look $L --every $NW --offset $k > out/log-$L-$k.txt 2>&1 &
  done
  wait
  ffmpeg -y -loglevel error -framerate 30 -i $OUT/f_%05d.jpg -i out/score.wav -map 0:v -map 1:a \
    -c:v libx264 -crf 16 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 256k -shortest out/${TITLE}_$L.mp4
  ffmpeg -y -loglevel error -framerate 30 -i $OUT/f_%05d.jpg -c:v libx264 -crf 16 -preset veryfast -pix_fmt yuv420p out/${TITLE}_${L}_silent.mp4
  python3 film/contact_sheet.py out/check_$L.jpg out/${TITLE}_$L.mp4 --times $(python3 -c "
import json; p=json.load(open('film/plan.json')); ts=[]
for b in p['beats']: ts += [round(b['t0']+0.35*(b['t1']-b['t0']),2), round(b['t0']+0.9*(b['t1']-b['t0']),2)]
print(','.join(str(t) for t in ts[:18]))") --cols 3
  echo "done: out/${TITLE}_$L.mp4  ·  check sheet: out/check_$L.jpg"
done
