#!/usr/bin/env bash
# Preparo do R8.5 (docs/TESTING.md): cria, na pasta dada, o que o roteiro usa, sem mexer no pacote
# do repositório (`libraries/material3-compose/`):
#   solta.json     especialização solta inválida (tipo de campo desconhecido e uma chave a mais);
#   mat-sem-badge  o Material 3 (Compose) sem o tipo badge e sem migração (versão 8, uma acima do pacote instalado);
#   mat-aviso      o Material 3 (Compose) com o rótulo do primeiro exemplo do Switch grande demais.
#
# Uso: scripts/testing/r85-prep.sh <pasta-de-destino>   (na raiz do repositório; precisa de python3)
set -euo pipefail

out="${1:?uso: scripts/testing/r85-prep.sh <pasta-de-destino>}"
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
    s["version"] = 8  # o pacote instalado está na 7: com a mesma versão a app diz "Nada a fazer"
    for layer in s["layers"]:
        layer["annotationTypes"] = [t for t in layer["annotationTypes"] if t["id"] != "badge"]

def long_label(s):
    sw = next(t for l in s["layers"] for t in l["annotationTypes"] if t["id"] == "switch")
    sw["examples"][0]["values"]["label"] = "Long label " * 20

edit("mat-sem-badge", no_badge)
edit("mat-aviso", long_label)
PY
echo "R8.5: $out/solta.json, $out/mat-sem-badge e $out/mat-aviso prontos"
