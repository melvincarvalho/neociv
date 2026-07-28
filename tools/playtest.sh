#!/usr/bin/env bash
# Empires as theorems — a career that must be winnable, controls that must lose,
# and a mechanism proof for every law of the world.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-chromium}"
run() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=180000 --dump-dom \
    "file://$DIR/index.html?verify=$1" 2>/dev/null | grep -o 'VERIFY:{[^<]*' | head -1
}
for m in solution solution-seeds null ablate-science ablate-expansion \
         mech-yield mech-growth mech-starve mech-found mech-build mech-tech \
         mech-combat mech-walls mech-vet mech-stack mech-upkeep mech-capture mech-victory mech-beacon; do
  run "$m"
done
