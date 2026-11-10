#!/usr/bin/env python3
"""Mantém os 3 conjuntos de dados do painel "Fila de desenvolvimento".

Arquivos numa pasta: queue.json, meta.json, log.json (listas JSON).
Cada comando imprime, no fim, `alterados: <arquivos gravados>`.
Só biblioteca padrão. Uso: painel.py [--now ISO] <subcomando> DIR ...
(o subcomando vem ANTES da pasta: `painel.py row <pasta> '#n' status=...`).
"""
import argparse
import datetime
import json
import os
import sys

STATUS = ["aguardando", "em andamento", "concluída", "falhou", "esperando dono"]
KINDS = ["etapa", "bug", "patch"]
STAGES = ["", "Fases", "Testador", "Correção", "Fechamento", "Mesclada"]
FILES = ["queue", "meta", "log"]
INT_FIELDS = ["order", "phasesTotal", "phasesDone"]
QUEUE_EMPTY = {
    "order": 0, "issue": "", "title": "", "kind": "etapa", "step": "",
    "status": "aguardando", "pr": "", "started": "", "ended": "",
    "phases": "", "phasesTotal": 0, "phasesDone": 0, "stage": "",
    # Ficha da etapa (dependências, fases, Toca em, Testador), para não reler a issue.
    "plan": "",
    # Filhas que ainda devem aviso (ids separados por espaço) e desde quando.
    "child": "", "childAt": "",
    # Motivo curto de a filha esperar o coordenador (pergunta, CI travado, chama o dono); vazio se não espera.
    "wait": "",
    # Sessões criadas para a etapa (ids separados por espaço), para arquivar no fim.
    "sessions": "",
}
TIME_FIELDS = ["started", "ended", "childAt"]
LATE_MINUTES = 30

NOW_OVERRIDE = None


class Erro(Exception):
    """Erro de uso: sai com código 2 e a mensagem."""


def now():
    if NOW_OVERRIDE:
        return NOW_OVERRIDE
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def check_iso(value):
    try:
        datetime.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        raise Erro(f"horário inválido '{value}' (use ISO UTC como 2026-11-08T16:00:11Z)")
    return value


def path(d, name):
    return os.path.join(d, name + ".json")


def load(d, name):
    p = path(d, name)
    if not os.path.exists(p):
        raise Erro(f"{p} não existe (rode `init` antes)")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(d, name, data):
    """Gravação atômica: arquivo temporário na mesma pasta + os.replace."""
    p = path(d, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, p)


class Sessao:
    """Carrega sob demanda, marca o que mudou e grava tudo no fim."""

    def __init__(self, d):
        self.d = d
        self.data = {}
        self.dirty = []

    def get(self, name):
        if name not in self.data:
            self.data[name] = load(self.d, name)
        return self.data[name]

    def touch(self, name):
        if name not in self.dirty:
            self.dirty.append(name)

    def commit(self):
        meta = self.get("meta")
        if not meta:
            raise Erro("meta.json está vazio")
        meta[0]["updatedAt"] = now()
        self.touch("meta")
        order = [n for n in FILES if n in self.dirty]
        for n in order:
            save(self.d, n, self.data[n])
        print("alterados: " + " ".join(n + ".json" for n in order))


def parse_pairs(items):
    out = {}
    for it in items:
        if "=" not in it:
            raise Erro(f"argumento '{it}' deveria ser chave=valor")
        k, v = it.split("=", 1)
        out[k.strip()] = v
    return out


def norm_issue(num):
    n = num.strip()
    if not n.startswith("#") or not n[1:].isdigit():
        raise Erro(f"issue '{num}' inválida (use '#123')")
    return n


def to_int(k, v):
    try:
        return int(v)
    except ValueError:
        raise Erro(f"{k} precisa ser inteiro, veio '{v}'")


def count_phases(phases):
    parts = [p for p in phases.split("|") if p]
    return len(parts), sum(1 for p in parts if p.endswith(":ok"))


def validate_choice(k, v, allowed):
    if v not in allowed:
        raise Erro(f"{k} inválido '{v}'; válidos: " + ", ".join(repr(a) for a in allowed))


def find_row(queue, issue):
    for r in queue:
        if r["issue"] == issue:
            return r
    return None


# --- subcomandos ---

def cmd_init(a):
    os.makedirs(a.dir, exist_ok=True)
    if not a.force:
        ex = [n + ".json" for n in FILES if os.path.exists(path(a.dir, n))]
        if ex:
            raise Erro("já existem: " + " ".join(ex) + " (use --force para recriar)")
    t = now()
    save(a.dir, "queue", [])
    save(a.dir, "meta", [{"runStart": "", "waitingSince": t, "updatedAt": t, "current": ""}])
    save(a.dir, "log", [])
    print("alterados: " + " ".join(n + ".json" for n in FILES))


def cmd_start(a):
    s = Sessao(a.dir)
    m = s.get("meta")[0]
    if not m.get("runStart"):
        m["runStart"] = now()
    s.touch("meta")
    s.commit()


def cmd_row(a):
    s = Sessao(a.dir)
    q = s.get("queue")
    issue = norm_issue(a.issue)
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in QUEUE_EMPTY:
            raise Erro(f"campo desconhecido '{k}'; válidos: " + ", ".join(QUEUE_EMPTY))
    if "issue" in pairs and pairs["issue"] != issue:
        raise Erro("não é possível trocar o campo issue")
    if "status" in pairs:
        validate_choice("status", pairs["status"], STATUS)
    if "kind" in pairs:
        validate_choice("kind", pairs["kind"], KINDS)
    if "stage" in pairs:
        validate_choice("stage", pairs["stage"], STAGES)
    if pairs.get("child") == "":
        pairs["childAt"] = ""
    if "child" in pairs and "wait" not in pairs:
        # Filha trocada (sessão recriada) ou removida: a espera da anterior não vale para a nova.
        pairs["wait"] = ""
    for k in TIME_FIELDS:
        if k in pairs:
            pairs[k] = now() if pairs[k] == "now" else (check_iso(pairs[k]) if pairs[k] else "")
    for k in INT_FIELDS:
        if k in pairs:
            pairs[k] = to_int(k, pairs[k])
    row = find_row(q, issue)
    if row is None:
        row = dict(QUEUE_EMPTY)
        row["issue"] = issue
        if "order" not in pairs:
            row["order"] = max([r["order"] for r in q], default=0) + 1
        q.append(row)
    row.update(pairs)
    if "phases" in pairs:
        row["phasesTotal"], row["phasesDone"] = count_phases(row["phases"])
    s.touch("queue")
    s.commit()


def cmd_phase(a):
    s = Sessao(a.dir)
    q = s.get("queue")
    issue = norm_issue(a.issue)
    row = find_row(q, issue)
    if row is None:
        raise Erro(f"{issue} não está na fila")
    changes = parse_pairs(a.pairs)
    for v in changes.values():
        validate_choice("estado de fase", v, ["ok", "open"])
    parts = [p.split(":", 1) for p in row["phases"].split("|") if p]
    for code, st in changes.items():
        for p in parts:
            if p[0] == code:
                p[1] = st
                break
        else:
            parts.append([code, st])
    row["phases"] = "|".join(c + ":" + st for c, st in parts)
    row["phasesTotal"], row["phasesDone"] = count_phases(row["phases"])
    s.touch("queue")
    s.commit()


def cmd_reorder(a):
    s = Sessao(a.dir)
    q = s.get("queue")
    cited = [norm_issue(i) for i in a.issues]
    if len(set(cited)) != len(cited):
        raise Erro("issue repetida na lista")
    waiting = {r["issue"]: r for r in q if r["status"] == "aguardando"}
    for i in cited:
        if i not in waiting:
            raise Erro(f"{i} não está aguardando (ou não está na fila)")
    rest = sorted((r for r in q if r["issue"] not in cited and r["status"] == "aguardando"),
                  key=lambda r: r["order"])
    seq = [waiting[i] for i in cited] + rest
    # Reaproveita os números de ordem que as linhas aguardando ocupavam.
    slots = sorted(r["order"] for r in seq)
    for r, o in zip(seq, slots):
        r["order"] = o
    q.sort(key=lambda r: r["order"])
    s.touch("queue")
    s.commit()


def cmd_log(a):
    s = Sessao(a.dir)
    s.get("log").append({"at": now(), "text": a.text})
    s.touch("log")
    s.commit()


def cmd_current(a):
    s = Sessao(a.dir)
    s.get("meta")[0]["current"] = a.text
    s.touch("meta")
    s.commit()


def cmd_reserve(a):
    s = Sessao(a.dir)
    s.get("meta")[0]["reserve"] = a.trigger
    s.touch("meta")
    s.commit()


def cmd_session(a):
    s = Sessao(a.dir)
    row = find_row(s.get("queue"), norm_issue(a.issue))
    if row is None:
        raise Erro(f"{a.issue} não está na fila")
    ids = row.get("sessions", "").split()
    if a.session not in ids:
        ids.append(a.session)
    row["sessions"] = " ".join(ids)
    s.touch("queue")
    s.commit()


def minutes_since(iso):
    t = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
    n = datetime.datetime.strptime(now(), "%Y-%m-%dT%H:%M:%SZ")
    return int((n - t).total_seconds() // 60)


def late_rows(q):
    """Filha sem aviso há mais de 30 min; a que espera o coordenador (`wait`) não conta."""
    return [r for r in q if r.get("child") and r.get("childAt") and not r.get("wait")
            and minutes_since(r["childAt"]) > LATE_MINUTES]


def waiting_rows(q):
    return [r for r in q if r.get("child") and r.get("wait")]


def show_row(r):
    print(f"{r['issue']} {r['title']}")
    for k, v in r.items():
        if k not in ("issue", "title") and v not in ("", 0):
            print(f"  {k}: {v}")


def cmd_show(a):
    q, m, lg = (load(a.dir, n) for n in FILES)
    if a.issue:
        row = find_row(q, norm_issue(a.issue))
        if row is None:
            raise Erro(f"{a.issue} não está na fila")
        show_row(row)
        return
    print(f"fila: {len(q)} linhas")
    for st in STATUS:
        print(f"  {st}: {sum(1 for r in q if r['status'] == st)}")
    meta = m[0] if m else {}
    print(f"atual: {meta.get('current') or '—'}")
    print(f"início: {meta.get('runStart') or '—'}  atualizado: {meta.get('updatedAt', '—')}")
    print(f"reserva: {meta.get('reserve') or '—'}")
    for r in q:
        if r["status"] == "em andamento":
            print(f"  {r['issue']} {r['stage']} · {r['step']} · filhas: {r.get('child') or '—'}")
    late = late_rows(q)
    print("atrasadas: " + ("; ".join(
        f"{r['issue']} {r['child']} ({minutes_since(r['childAt'])} min)" for r in late) or "nenhuma"))
    print("esperando o coordenador: " + ("; ".join(
        f"{r['issue']} ({r['wait']})" for r in waiting_rows(q)) or "nenhuma"))
    print("últimas do log:")
    for e in lg[-5:]:
        print(f"  {e['at']}  {e['text']}")


def build_parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--now", help="substitui o relógio (ISO UTC, para testes)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_):
        sp = sub.add_parser(name, help=help_)
        sp.add_argument("dir", help="pasta dos arquivos JSON")
        sp.set_defaults(fn=fn)
        return sp

    sp = add("init", cmd_init, "cria os 3 arquivos vazios")
    sp.add_argument("--force", action="store_true")
    add("start", cmd_start, "marca o início da execução")
    sp = add("row", cmd_row, "insere ou atualiza uma linha da fila")
    sp.add_argument("issue")
    sp.add_argument("pairs", nargs="*")
    sp = add("phase", cmd_phase, "muda o estado de fases de uma linha")
    sp.add_argument("issue")
    sp.add_argument("pairs", nargs="+")
    sp = add("reorder", cmd_reorder, "renumera as linhas aguardando")
    sp.add_argument("issues", nargs="+")
    sp = add("log", cmd_log, "acrescenta ao registro")
    sp.add_argument("text")
    sp = add("current", cmd_current, "muda a linha 'atual' do painel")
    sp.add_argument("text")
    sp = add("reserve", cmd_reserve, "guarda o id da conferência de reserva da sessão")
    sp.add_argument("trigger")
    sp = add("session", cmd_session, "registra uma sessão criada para a etapa (sem repetir)")
    sp.add_argument("issue")
    sp.add_argument("session")
    sp = add("show", cmd_show, "resumo legível; com '#n', a linha inteira (com a ficha)")
    sp.add_argument("issue", nargs="?")
    return p


def main(argv=None):
    global NOW_OVERRIDE
    a = build_parser().parse_args(argv)
    try:
        if a.now:
            NOW_OVERRIDE = check_iso(a.now)
        a.fn(a)
    except Erro as e:
        print(f"erro: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
