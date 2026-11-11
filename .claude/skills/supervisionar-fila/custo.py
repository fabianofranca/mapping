#!/usr/bin/env python3
"""Agrega um JSONL de `get_session` por grupo de sessões (skill `supervisionar-fila`, argumento `varredura`).

Uso: custo.py <arquivo.jsonl>

Cada linha é o JSON devolvido por `get_session` (com ou sem o envelope `ccr`). O grupo sai do título:
"Testador — …" (Reteste, se o título diz reteste), "Fila — coordenador…", "Detalhamento — …",
"Supervisor…", "<código> — …" (Fase; Correção ou Fechamento, se o título diz); o resto é Outras.
Imprime, por grupo, o número de sessões, o US$ e a mediana, o total e o % de US$ por modelo.
Sessão sem `cost_usd` não entra nas contas (vai numa linha `sem custo`). Só biblioteca padrão. Erro de uso, arquivo ilegível ou linha inválida sai com 2.
"""
import json
import re
import statistics
import sys

GROUPS = ["Testador", "Fase", "Coordenador", "Detalhamento", "Supervisão",
          "Reteste", "Correção", "Fechamento", "Outras"]
# Código de fase: maiúsculas e dígitos, com ao menos um dígito (FM8, RS1, FM4-C); "CR — …" não é fase.
CODE = re.compile(r"^[A-Z][A-Z0-9-]*\d[A-Za-z0-9-]* — ")


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
    """Devolve (sessões com custo, número de sessões sem custo)."""
    out, no_cost = [], 0
    try:
        f = open(path, encoding="utf-8")
    except OSError as e:
        raise UsageError(str(e))
    with f:
        try:
            lines = list(f)
        except UnicodeDecodeError:
            raise UsageError("o arquivo não é UTF-8")
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            raise UsageError(f"linha {n}: não é JSON")
        if not isinstance(obj, dict):
            raise UsageError(f"linha {n}: não é um objeto")
        s = obj["ccr"] if isinstance(obj.get("ccr"), dict) else obj
        title = s.get("title") if isinstance(s.get("title"), str) else ""
        ctx = s.get("session_context") if isinstance(s.get("session_context"), dict) else {}
        meta = s.get("external_metadata") if isinstance(s.get("external_metadata"), dict) else {}
        usage = meta.get("usage") if isinstance(meta.get("usage"), dict) else {}
        usd = usage.get("cost_usd")
        if isinstance(usd, bool) or not isinstance(usd, (int, float)):
            no_cost += 1  # sem custo gravado (ainda rodando, por exemplo): fora das contagens e das medianas
            continue
        model = ctx.get("model") if isinstance(ctx.get("model"), str) else "—"
        out.append((group_of(title), usd, model))
    return out, no_cost


class UsageError(Exception):
    pass


def money(x):
    return f"US$ {x:.2f}"


def main(argv):
    if len(argv) != 1:
        raise UsageError("uso: custo.py <arquivo.jsonl>")
    rows, no_cost = read(argv[0])
    total = sum(r[1] for r in rows)
    print(f"total: {len(rows)} sessões, {money(total)}")
    if no_cost:
        print(f"sem custo (fora das contas): {no_cost} sessões")
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
    except UsageError as e:
        print(str(e), file=sys.stderr)
        sys.exit(2)
