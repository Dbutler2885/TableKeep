#!/usr/bin/env bash
# Prepares the captain's backpack pictures for the Lubec Gear tab, once.
#
# Needs ImageMagick 7 (`magick`) and `cwebp` (libwebp), both from Homebrew.
#
# Every pack is put on the default picture's canvas, so the slot boxes in
# src/features/lubec/gear/backpackSlots.json fit every pack without moving:
#   1. the background goes transparent: a flood from the four corners, and one
#      from each seed point below, inside the handle and the gaps between a
#      strap and the pack, which the corner flood cannot reach;
#   2. the picture is trimmed to the pack, soft shadow included;
#   3. the pack is scaled to 98% of the default pack's height of 1114 pixels,
#      1092: at the full 1114 the two widest packs (blue-red, slate-red) put a
#      strap outside the pack box's crop (x 10 to 1110), so the whole set is
#      shrunk a little rather than one pack special-cased (spec 6.2);
#   4. it is centred on the default pack's centre, x = 559 and y = 677, so its
#      top is at y = 131, on a transparent 1122x1402 canvas.
# Each pack is saved as <short-name>.webp, with a 224x280 <short-name>.thumb.webp
# for the picker. The default, navy-stripe, is already on the canvas: it is
# only measured and given a thumbnail, so it must already be in the output
# folder.
#
# Git keeps every version of a picture forever, so the set is committed once,
# after the captain has seen the overlay check page
# (node scripts/backpacks/overlay-check.mjs), and not re-committed to tune it.
#
# Usage: scripts/backpacks/prepare.sh <source-folder> [output-folder] [report.json]
#   source-folder  the captain's PNGs (Lubec-Mothership-Character-Sheets/Backpacks)
#   output-folder  default src/features/lubec/gear/assets/backpacks
#   report.json    what overlay-check.mjs reads, default .scratch/backpack-prepare-report.json

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SRC=${1:?usage: scripts/backpacks/prepare.sh <source-folder> [output-folder] [report.json]}
OUT=${2:-$ROOT/src/features/lubec/gear/assets/backpacks}
REPORT=${3:-$ROOT/.scratch/backpack-prepare-report.json}

CANVAS_W=1122
CANVAS_H=1402
PACK_H=1092
PACK_TOP=$((120 + (1114 - PACK_H) / 2))
CENTRE_X=559
FUZZ=7%
DEFAULT=navy-stripe

# Short name (spec 6.1) | source file | seed points inside the handle and strap gaps.
# The seeds are the centres of the enclosed background patches that
# `magick -connected-components` finds at a fuzz of 12%, minus the cream
# stripes on olive-stripe and a highlight on tan-stripe, which are on the pack.
# `Two-Tone Navy and Sage Backpack-3 (1).png` is a byte-identical copy of
# `...-3.png`, so it is left out.
PACKS=$(cat <<'EOF'
olive-band|Distressed Olive Canvas Backpack.png|571,177 114,966 1036,989 127,1075 1026,1080
olive-molle|Olive Green Tactical Backpack Product Photo.png|557,196 108,987 1020,1001 119,1085
flap-rucksack|Retro 1977 School Backpack Inventory UI.png|564,226 104,1006 1050,1033
retro-swirl|Retro Olive Canvas Backpack.png|560,196 1020,996 110,981 121,1081
navy-sage|Two-Tone Navy and Sage Backpack-3.png|559,197 1019,999 110,986 121,1086 1007,1089
tan-stripe|Vintage 1977-Inspired Canvas Backpack.png|559,198 1020,999 108,984 119,1085
burgundy-blue|Vintage Burgundy and Slate Canvas Backpack-2.png|599,139 122,969 1079,977 134,1082 1070,1082
burgundy-tan|Vintage Burgundy Canvas Backpack.png|560,200 1019,1008 107,995 118,1099 1004,1097
slate-tan|Vintage Distressed Canvas Backpack.png|560,201 1018,1008 108,995 118,1099 1003,1097
blue-red|Vintage Navy Canvas Backpack.png|593,135 123,937 1074,952 134,1046 1060,1047
olive-navy|Vintage Olive and Navy Canvas Backpack-1 (1).png|558,196 108,983 1020,999 119,1083
olive-stripe|Vintage Olive Canvas Backpack (1).png|559,199 1020,1000 109,985 119,1086
olive-tan|Vintage Olive Canvas Backpack (2).png|560,197 109,988 1019,999 120,1088 1005,1088
olive-buckle|Vintage Olive Canvas Field Pack.png|561,183 105,985 1024,993 117,1093 1015,1096
rust-navy|Vintage Rust and Navy Waxed Canvas Backpack.png|560,193 114,980 1016,997 123,1088 1004,1092
slate-red|Vintage Teal Canvas Backpack Product Shot.png|592,136 123,940 1072,955 133,1049 1058,1050
teal|Vintage Teal Waxed Canvas Backpack.png|558,197 108,991 1022,1009 122,1084 1007,1094
EOF
)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT" "$(dirname "$REPORT")"

webp() { cwebp -quiet -q 80 -alpha_q 90 -m 6 "$1" -o "$2"; }

thumb() {
  magick "$1" -resize 224x280 "$TMP/thumb.png"
  webp "$TMP/thumb.png" "$2"
}

# One report row, printed and appended to the JSON.
report() {
  local short=$1 file=$2 original=$3 box=$4 scale=$5 width=$6 left=$7 right=$8
  printf '%-14s %-50s %-9s %-15s %s  width %4s  left %3s  right %3s\n' \
    "$short" "$file" "$original" "$box" "$scale" "$width" "$left" "$right"
  ROWS+=("$(printf '{"short":"%s","file":"%s","original":"%s","box":"%s","scale":%s,"width":%s,"left":%s,"right":%s}' \
    "$short" "$file" "$original" "$box" "$scale" "$width" "$left" "$right")")
}

# The four corners, then every seed point.
flood_args() {
  local w=$1 h=$2 seeds=$3 point
  for point in 0,0 $((w - 1)),0 0,$((h - 1)) $((w - 1)),$((h - 1)) $seeds; do
    printf '%s\n' -draw "color $point floodfill"
  done
}

prepare() {
  local short=$1 file=$2 seeds=$3 size w h box bh width left right
  size=$(magick identify -format '%w %h' "$SRC/$file")
  w=${size% *}
  h=${size#* }
  local floods=()
  while IFS= read -r arg; do floods+=("$arg"); done < <(flood_args "$w" "$h" "$seeds")
  magick "$SRC/$file" -alpha set -fuzz "$FUZZ" -fill none "${floods[@]}" -fuzz 0 -trim "$TMP/pack.png"
  box=$(magick identify -format '%wx%h%O' "$TMP/pack.png")
  bh=$(magick identify -format '%h' "$TMP/pack.png")
  magick "$TMP/pack.png" +repage -resize "x$PACK_H" "$TMP/scaled.png"
  width=$(magick identify -format '%w' "$TMP/scaled.png")
  left=$(((2 * CENTRE_X - width) / 2))
  right=$((CANVAS_W - left - width))
  magick -size "${CANVAS_W}x$CANVAS_H" xc:none "$TMP/scaled.png" -geometry "+$left+$PACK_TOP" -composite "$TMP/canvas.png"
  webp "$TMP/canvas.png" "$OUT/$short.webp"
  thumb "$TMP/canvas.png" "$OUT/$short.thumb.webp"
  report "$short" "$file" "${w}x$h" "$box" "$(printf '%.3f' "$(bc -l <<<"$PACK_H / $bh")")" "$width" "$left" "$right"
}

# The default is measured off its own transparency.
prepare_default() {
  local art=$OUT/$DEFAULT.webp box width left
  [ -f "$art" ] || { echo "missing $art: rename G05's backpack4-navy.webp to it first" >&2; exit 1; }
  box=$(magick "$art" -alpha extract -format '%@' info:)
  width=${box%%x*}
  left=${box#*+}
  left=${left%%+*}
  thumb "$art" "$OUT/$DEFAULT.thumb.webp"
  report "$DEFAULT" "backpack4-navy.webp (G05)" "${CANVAS_W}x$CANVAS_H" "$box" "1.000" "$width" "$left" "$((CANVAS_W - left - width))"
}

ROWS=()
prepare_default
while IFS='|' read -r short file seeds; do
  prepare "$short" "$file" "$seeds"
done <<<"$PACKS"

{ printf '[\n'; (IFS=$'\n'; printf '%s\n' "${ROWS[*]}" | sed '$!s/$/,/'); printf ']\n'; } >"$REPORT"
echo "wrote ${#ROWS[@]} packs to $OUT and the report to $REPORT"
