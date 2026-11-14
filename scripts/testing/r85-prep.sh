#!/usr/bin/env bash
# Setup for R8.5 (docs/TESTING.md): creates, in the given folder, what the test script uses, without touching the repository's
# package (`libraries/material3-compose/`):
#   solta.json     invalid loose specialization (unknown field type and an extra key);
#   mat-sem-badge  Material 3 (Compose) without the badge type and without a migration (one version above the installed package);
#   mat-aviso      Material 3 (Compose) with the label of the Switch's first example too long.
#
# Usage: scripts/testing/r85-prep.sh <destination-folder>   (at the repository root; needs python3)
set -euo pipefail

out="${1:?usage: scripts/testing/r85-prep.sh <destination-folder>}"
src="libraries/material3-compose"
mkdir -p "$out"

cat > "$out/solta.json" <<'JSON'
{"format":"mapping-spec","formatVersion":15,"id":"solta","name":"Solta","version":1,
 "layers":[{"id":"l","name":"L","color":"#112233","annotationTypes":[
  {"id":"t","name":"T","fields":[{"key":"k","label":"K","type":"foo","extra":1}]}]}]}
JSON

cp -r "$src" "$out/mat-sem-badge"
cp -r "$src" "$out/mat-aviso"

python3 - "$out" <<'PY'
import json, sys
out = sys.argv[1]

def edit(folder, change):
    p = f"{out}/{folder}/material3-compose.spec.json"
    s = json.load(open(p))
    change(s)
    json.dump(s, open(p, "w"), ensure_ascii=False, indent=2)

def no_badge(s):
    s["version"] += 1  # one above the installed package: with the same version the app says "Nothing to do"
    for layer in s["layers"]:
        layer["annotationTypes"] = [t for t in layer["annotationTypes"] if t["id"] != "badge"]

def long_label(s):
    sw = next(t for l in s["layers"] for t in l["annotationTypes"] if t["id"] == "switch")
    sw["examples"][0]["values"]["label"] = "Long label " * 20

edit("mat-sem-badge", no_badge)
edit("mat-aviso", long_label)
PY
echo "R8.5: $out/solta.json, $out/mat-sem-badge and $out/mat-aviso ready"
