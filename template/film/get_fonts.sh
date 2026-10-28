#!/usr/bin/env bash
# Fetch HarmonyOS Sans SC (Thin / Light / Regular) for the cards and labels, as TTF in film/fonts/.
# Source: github.com/IKKI2000/harmonyos-fonts (woff2 copies of Huawei's HarmonyOS Sans).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$HERE/fonts"; cd "$HERE/fonts"
python3 -c "import fontTools, brotli" 2>/dev/null || pip install fonttools brotli --break-system-packages -q 2>/dev/null || pip install fonttools brotli -q
for w in Thin Light Regular; do
  [ -f "H_$w.ttf" ] && continue
  curl -fsSL -o "$w.woff2" "https://raw.githubusercontent.com/IKKI2000/harmonyos-fonts/main/fonts/HarmonyOS_Sans_SC/HarmonyOS_Sans_SC_$w.woff2" \
   || curl -fsSL -o "$w.woff2" "https://github.com/IKKI2000/harmonyos-fonts/raw/main/fonts/HarmonyOS_Sans_SC_$w.woff2"
  python3 -c "from fontTools.ttLib import TTFont; f=TTFont('$w.woff2'); f.flavor=None; f.save('H_$w.ttf')"
  rm -f "$w.woff2"; echo "font H_$w.ttf"
done
