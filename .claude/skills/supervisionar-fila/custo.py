#!/usr/bin/env python3
"""Agrega um JSONL de `get_session` por grupo de sessões (skill `supervisionar-fila`, argumento `varredura`).

Uso: custo.py <arquivo.jsonl>

Cada linha é o JSON devolvido por `get_session` (com ou sem o envelope `ccr`). O grupo sai do título:
"Testador — …" (Reteste, se o título diz reteste), "Fila — coordenador…", "Detalhamento — …",
"Supervisor…", "<código> — …" (Fase; Correção ou Fechamento, se o título diz); o resto é Outras.
Imprime, por grupo, o número de sessões, o US$ e a mediana, o total e o % de US$ por modelo.
Só biblioteca padrão. Erro de uso ou linha inválida sai com 2.
"""
import json
import re
import statistics
import sys

GROUPS = ["Testador", "Fase", "Coordenador", "Detalhamento", "Supervisão",
          "Reteste", "Correção", "Fechamento", "Outras"]
CODE = re.compile(r"^\S+ — ")


def group_of(title):
    t = (title or "").strip()
    low = t.lower()
    if low.startswith("supervisor"):
        return "Supervisão"
    if low.startswith("fila — coordenador"):
        return "Coordenador"
    if low.startswith("detalhamento — "):
        return "Detalhamento"
    if low.startswith("testador — "):
        return "Reteste" if "reteste" in low else "Testador"
    if CODE.match(t):
        if "fechamento" in low:
            return "Fechamento"
        if "correção" in low or "correcao" in low:
            return "Correção"
        return "Fase"
    return "Outras"


def read(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                raise SystemExit_(f"linha {n}: não é JSON")
            if not isinstance(obj, dict):
                raise SystemExit_(f"linha {n}: não é um objeto")
            s = obj.get("ccr") if isinstance(obj.get("ccr"), dict) else obj
            meta = s.get("external_metadata") or {}
            usage = meta.get("usage") or {}
            usd = usage.get("cost_usd")
            model = (s.get("session_context") or {}).get("model") or "—"
            out.append((group_of(s.get("title")), usd if isinstance(usd, (int, float)) else 0, model))
    return out


class SystemExit_(Exception):
    pass


def money(x):
    return f"US$ {x:.2f}"


def main(argv):
    if len(argv) != 1:
        raise SystemExit_("uso: custo.py <arquivo.jsonl>")
    rows = read(argv[0])
    total = sum(r[1] for r in rows)
    print(f"total: {len(rows)} sessões, {money(total)}")
    by_group = {}
    by_model = {}
    for g, usd, model in rows:
        by_group.setdefault(g, []).append(usd)
        by_model[model] = by_model.get(model, 0) + usd
    print("por grupo:")
    for g in GROUPS:
        if g in by_group:
            v = by_group[g]
            print(f"  {g}: {len(v)} sessões, {money(sum(v))}, mediana {money(statistics.median(v))}")
    print("por modelo:")
    for m in sorted(by_model, key=lambda k: -by_model[k]):
        pct = 100 * by_model[m] / total if total else 0
        print(f"  {m}: {pct:.1f}%")


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except SystemExit_ as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)
