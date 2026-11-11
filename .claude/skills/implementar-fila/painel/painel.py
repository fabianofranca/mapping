#!/usr/bin/env python3
"""Mantém os 3 conjuntos de dados do painel "Fila de desenvolvimento".

Arquivos numa pasta: queue.json, meta.json, log.json (listas JSON).
Cada comando imprime, no fim, `alterados: <arquivos gravados>`.
A nota "Vagas k/N" (meta.vagas) é recalculada em toda gravação, a partir das fichas (`plan`),
de `meta.paralelo` (`start --paralelo N`) e de `meta.merged` (`merged`); `context` guarda o contexto
do coordenador (alerta acima de CONTEXT_LIMIT). `show` imprime `vagas:`, `começar agora:`, `contexto:`.
Ficha incompleta (decisão 11 da #1532): `dep`, `toca` ou `fases` em `?` (ou `dep` e `toca` sem o campo) dá o motivo
`ficha incompleta (<campos>)` e entra em `fichas a refazer:` do `show`; a etapa começada com `toca=?` segue conflitando
com toda candidata (`arquivo ? com #N`). `exclusive=sim` na linha (`exclusive=` limpa) faz a etapa começar só com a fila
sem etapa começada e não mesclada, e segura todas as outras enquanto roda (`exclusiva (espera a fila esvaziar)`,
`exclusiva #N em andamento`). O `docs/FLOW.md`, o `docs/PROCESS.md` e os `.claude/skills/*/SKILL.md` se comparam por seção
(`docs/FLOW.md#<slug>`, como o `docs/TESTING.md` por roteiro); `slug "<título>"` imprime o slug de um `##`.
`ciWait` (o PR cujo CI espera o coordenador, ex. `PR #7`) e `ciWaitAt` (desde quando; `ciWait=` limpa os
dois) entram na linha `CI esperando o coordenador:` do `show`; trocar ou limpar `child` não mexe neles.
`apply DIR <arquivo|->` grava vários subcomandos de uma vez (um por linha, na sintaxe da linha de comando
sem `painel.py` e sem a pasta; linha vazia e `#` são ignoradas; `show`, `init`, `published` e `apply` não
entram): tudo ou nada, com uma linha `alterados:` e, no erro, código 2 citando o número da linha.
Toda gravação soma os arquivos a `meta.unpublished` (`{since, files}`: o que foi gravado e ainda não foi
publicado; o `show` o imprime). `published DIR` imprime `at: <ISO UTC>` (o valor de `updated.at` e `edit.at`
da publicação), lista os arquivos a enviar, grava `meta.publishedAt` e limpa `unpublished`; `touch DIR` marca
de novo os três arquivos (a publicação falhou).
Custo (decisões 5 e 26 da #1532): `session DIR '#n' <id> kind=<tipo> [label=<código>]` acrescenta `{id, issue, kind, label,
created}` a `meta.sessions` (sem `kind`, só o `sessions` da linha, como antes); `cost DIR <id> usd= ctx= [model= effort=
served=] [issue= kind=]` grava o custo da sessão (`kind` obrigatório com id novo); `costs [--desde <ISO>] DIR` lê só o `meta`
e imprime o total, uma linha por tipo (sessões, US$, mediana) e uma por etapa (com `--desde`, só as com `created` a partir
da data); o `show` traz a linha `custo:`.
Só biblioteca padrão. Uso: painel.py [--now ISO] <subcomando> DIR ...
(o subcomando vem ANTES da pasta: `painel.py row <pasta> '#n' status=...`).
"""
import argparse
import datetime
import fnmatch
import json
import os
import re
import shlex
import statistics
import sys
import unicodedata

STATUS = ["aguardando", "em andamento", "concluída", "falhou", "esperando dono"]
KINDS = ["etapa", "bug", "patch"]
STAGES = ["", "Fases", "Testador", "Correção", "Fechamento", "Mesclada"]
FILES = ["queue", "meta", "log"]
SESSION_KINDS = ["fase", "correção", "testador", "reteste", "fechamento", "coordenador", "supervisor"]
CONTEXT_LIMIT = 60
DEFAULT_PARALELO = 2
INT_FIELDS = ["order", "phasesTotal", "phasesDone"]
QUEUE_EMPTY = {
    "order": 0, "issue": "", "title": "", "kind": "etapa", "step": "",
    "status": "aguardando", "pr": "", "started": "", "ended": "",
    "phases": "", "phasesTotal": 0, "phasesDone": 0, "stage": "",
    # Ficha da etapa (dependências, fases, Toca em, Testador), para não reler a issue.
    "plan": "",
    # Filhas que ainda devem aviso (ids separados por espaço) e desde quando.
    "child": "", "childAt": "",
    # PR cujo CI espera o coordenador (ex.: "PR #1467") e desde quando; vazio se nenhum.
    "ciWait": "", "ciWaitAt": "",
    # Motivo curto de a filha esperar o coordenador (pergunta, CI travado, chama o dono); vazio se não espera.
    "wait": "",
    # Sessões criadas para a etapa (ids separados por espaço), para arquivar no fim.
    "sessions": "",
    # Motivo do dono para segurar uma etapa que não começou ("esperando dono (…)",
    # "ordem do dono (…)", "pausada pelo dono"); vazio: não está segura.
    "hold": "",
    # "sim": etapa exclusiva (começa só com a fila sem etapa começada e não mesclada; nenhuma outra começa com ela); vazio: não.
    "exclusive": "",
}
TIME_FIELDS = ["started", "ended", "childAt", "ciWaitAt"]
LATE_MINUTES = 30

NOW_OVERRIDE = None
BATCH = None  # a Sessao compartilhada de um `apply` em andamento (None fora dele)


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
        self.deferred = False  # num `apply`, o commit de cada linha espera o fim do lote
        self.loud = False  # algum comando que conta como "não publicado" (o `context` sozinho não conta)

    def get(self, name):
        if name not in self.data:
            self.data[name] = load(self.d, name)
        return self.data[name]

    def touch(self, name):
        if name not in self.dirty:
            self.dirty.append(name)

    def commit(self, quiet=False):
        self.loud = self.loud or not quiet
        if self.deferred:
            return
        self.flush()

    def flush(self):
        meta = self.get("meta")
        if not meta:
            raise Erro("meta.json está vazio")
        meta[0]["updatedAt"] = now()
        text, _, items = slots_plan(self.get("queue"), meta[0])
        meta[0]["vagas"] = text
        meta[0]["vagasItens"] = items
        self.touch("meta")
        order = [n for n in FILES if n in self.dirty]
        if self.loud:
            mark_unpublished(meta[0], order)
        for n in order:
            save(self.d, n, self.data[n])
        print("alterados: " + " ".join(n + ".json" for n in order))


def mark_unpublished(meta, files):
    """Soma `files` (nomes sem .json) a meta.unpublished; o `since` é o da primeira gravação não publicada."""
    pend = meta.get("unpublished") or {}
    have = set(pend.get("files", [])) | {n + ".json" for n in files}
    meta["unpublished"] = {
        "since": pend.get("since") or now(),
        "files": [n + ".json" for n in FILES if n + ".json" in have],
    }


def open_session(d):
    """A sessão do `apply` em andamento, se houver; senão uma nova."""
    return BATCH if BATCH is not None else Sessao(d)


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
    s = open_session(a.dir)
    m = s.get("meta")[0]
    if not m.get("runStart"):
        m["runStart"] = now()
    if a.paralelo is not None:
        if a.paralelo < 1:
            raise Erro("--paralelo precisa ser um inteiro a partir de 1")
        m["paralelo"] = a.paralelo
    s.touch("meta")
    s.commit()


def cmd_row(a):
    s = open_session(a.dir)
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
    if "exclusive" in pairs:
        validate_choice("exclusive", pairs["exclusive"], ["", "sim"])
    if "stage" in pairs:
        validate_choice("stage", pairs["stage"], STAGES)
    if pairs.get("child") == "":
        pairs["childAt"] = ""
    if pairs.get("ciWait") == "":
        pairs["ciWaitAt"] = ""
    if pairs.get("ciWait") and "ciWaitAt" not in pairs:
        # PR novo na espera: o horário é o de agora, nunca o do PR anterior (nem em branco).
        pairs["ciWaitAt"] = "now"
    if (pairs.get("status") in ("concluída", "falhou") or pairs.get("ended")) and "ciWait" not in pairs:
        # Etapa terminada não espera CI: um ciWait esquecido não fica na conferência para sempre.
        pairs["ciWait"] = pairs["ciWaitAt"] = ""
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
    if pairs.get("status", "aguardando") != "aguardando" and "hold" not in pairs:
        pairs["hold"] = ""  # o hold só vale enquanto a etapa não começou
    row.update(pairs)
    if "phases" in pairs:
        row["phasesTotal"], row["phasesDone"] = count_phases(row["phases"])
    s.touch("queue")
    s.commit()


def cmd_phase(a):
    s = open_session(a.dir)
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
    s = open_session(a.dir)
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
    s = open_session(a.dir)
    s.get("log").append({"at": now(), "text": a.text})
    s.touch("log")
    s.commit()


def cmd_current(a):
    s = open_session(a.dir)
    s.get("meta")[0]["current"] = a.text
    s.touch("meta")
    s.commit()


def cmd_reserve(a):
    s = open_session(a.dir)
    s.get("meta")[0]["reserve"] = a.trigger
    s.touch("meta")
    s.commit()


def cmd_session(a):
    s = open_session(a.dir)
    issue = norm_issue(a.issue)
    row = find_row(s.get("queue"), issue)
    if row is None:
        raise Erro(f"{a.issue} não está na fila")
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in ("kind", "label"):
            raise Erro(f"campo desconhecido '{k}'; válidos: kind, label")
    if "label" in pairs and "kind" not in pairs:
        raise Erro("label= só com kind=")
    if "kind" in pairs:
        validate_choice("kind", pairs["kind"], SESSION_KINDS)
    ids = row.get("sessions", "").split()
    if a.session not in ids:
        ids.append(a.session)
    row["sessions"] = " ".join(ids)
    s.touch("queue")
    if "kind" in pairs:
        entry = session_entry(s.get("meta")[0], a.session)
        entry.setdefault("created", now())
        entry.update({"issue": issue, "kind": pairs["kind"], "label": pairs.get("label", "")})
        s.touch("meta")
    s.commit()


def session_entry(meta, sid):
    """A entrada de `meta.sessions` com esse id; cria (só com o id) se não houver."""
    lst = meta.setdefault("sessions", [])
    for e in lst:
        if e.get("id") == sid:
            return e
    e = {"id": sid}
    lst.append(e)
    return e


def to_number(k, v, conv):
    try:
        x = conv(v)
    except ValueError:
        raise Erro(f"{k} precisa ser numérico, veio '{v}'")
    if x != x or x in (float("inf"), float("-inf")) or x < 0:
        raise Erro(f"{k} precisa ser numérico, veio '{v}'")
    return x


def cmd_cost(a):
    s = open_session(a.dir)
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in ("usd", "ctx", "model", "effort", "served", "issue", "kind"):
            raise Erro(f"campo desconhecido '{k}'; válidos: usd, ctx, model, effort, served, issue, kind")
    for k in ("usd", "ctx"):
        if k not in pairs:
            raise Erro(f"falta {k}=")
    usd = to_number("usd", pairs["usd"], float)
    ctx = to_number("ctx", pairs["ctx"], lambda v: int(float(v)))
    if "kind" in pairs:
        validate_choice("kind", pairs["kind"], SESSION_KINDS)
    if "issue" in pairs:
        norm_issue(pairs["issue"])
    m = s.get("meta")[0]
    known = any(e.get("id") == a.session for e in m.get("sessions", []))
    if not known and "kind" not in pairs:
        raise Erro(f"{a.session} é uma sessão nova: falta kind=<tipo>")
    entry = session_entry(m, a.session)
    for k in ("issue", "kind"):
        if k in pairs:
            entry[k] = pairs[k]
    cost = {"usd": usd, "ctx": ctx, "at": now()}
    for k in ("model", "effort", "served"):
        if pairs.get(k):
            cost[k] = pairs[k]
    entry["cost"] = cost
    s.touch("meta")
    s.commit()


def costed(meta, since=None):
    """Entradas de `meta.sessions` com custo; com `since`, só as com `created` a partir dele."""
    out = []
    for e in meta.get("sessions", []):
        if not e.get("cost"):
            continue
        if since and not (e.get("created") and e["created"] >= since):
            continue
        out.append(e)
    return out


def money(x):
    return f"US$ {x:.2f}"


def cost_summary(meta):
    """`custo: …` do `show`: total e número de sessões com custo, ou `—`."""
    es = costed(meta)
    if not es:
        return "—"
    return f"{money(sum(e['cost']['usd'] for e in es))} em {len(es)} sessões"


def cmd_costs(a):
    since = check_iso(a.desde) if a.desde else None
    m = load(a.dir, "meta")
    es = costed(m[0] if m else {}, since)
    if not es:
        print("custo total: —")
        return
    print(f"custo total: {money(sum(e['cost']['usd'] for e in es))} em {len(es)} sessões")
    by_kind, by_issue = {}, {}
    for e in es:
        by_kind.setdefault(e.get("kind") or "—", []).append(e["cost"]["usd"])
        by_issue.setdefault(e.get("issue") or "—", []).append(e["cost"]["usd"])
    print("por tipo:")
    for k in SESSION_KINDS + sorted(set(by_kind) - set(SESSION_KINDS)):
        if k in by_kind:
            v = by_kind[k]
            print(f"  {k}: {len(v)} sessões, {money(sum(v))}, mediana {money(statistics.median(v))}")
    print("por etapa:")
    for k in sorted(by_issue, key=lambda i: (not i.startswith("#"), int(i[1:]) if i[1:].isdigit() else 0, i)):
        v = by_issue[k]
        print(f"  {k}: {len(v)} sessões, {money(sum(v))}")


def cmd_merged(a):
    s = open_session(a.dir)
    n = norm_issue(a.issue)
    m = s.get("meta")[0]
    merged = m.setdefault("merged", [])
    if n not in merged:
        merged.append(n)
    s.touch("meta")
    s.commit()


def cmd_context(a):
    s = open_session(a.dir)
    try:
        pct = int(a.pct)
    except ValueError:
        raise Erro(f"pct precisa ser inteiro de 0 a 100, veio '{a.pct}'")
    if not 0 <= pct <= 100:
        raise Erro(f"pct precisa ser inteiro de 0 a 100, veio '{a.pct}'")
    m = s.get("meta")[0]
    m["context"] = pct
    m["contextAt"] = now()
    s.touch("meta")
    s.commit(quiet=True)  # o contexto sozinho não faz a conferência de hora em hora publicar


def cmd_touch(a):
    """A publicação falhou: marca de novo os três arquivos como não publicados."""
    s = open_session(a.dir)
    mark_unpublished(s.get("meta")[0], FILES)
    s.touch("meta")
    s.commit()


def cmd_published(a):
    """Imprime a hora real da publicação e os arquivos a enviar; limpa o que falta publicar."""
    d = a.dir
    m = load(d, "meta")
    if not m:
        raise Erro("meta.json está vazio")
    at = now()
    files = list((m[0].get("unpublished") or {}).get("files", []))
    if "meta.json" not in files:
        files.append("meta.json")  # o meta enviado já sai limpo, então vai sempre
    m[0].pop("unpublished", None)
    m[0]["publishedAt"] = at
    save(d, "meta", m)
    print(f"at: {at}")
    print("enviar: " + " ".join(n + ".json" for n in FILES if n + ".json" in files))
    print("alterados: meta.json")


BATCH_REJECTED = ("show", "apply", "init", "published", "slug", "costs")


def batch_lines(src):
    if src == "-":
        text = sys.stdin.read()
    else:
        try:
            with open(src, encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            raise Erro(f"não consegui ler {src}: {e.strerror}")
    return text.splitlines()


def parse_batch_line(n, line, d):
    """Os argumentos de uma linha do lote, com a pasta posta depois do subcomando."""
    try:
        words = shlex.split(line)
    except ValueError as e:
        raise Erro(f"linha {n}: {e}")
    if words[0] in BATCH_REJECTED:
        raise Erro(f"linha {n}: `{words[0]}` não entra no lote")
    return [words[0], d] + words[1:]


def cmd_apply(a):
    global BATCH
    parsed = []
    for n, line in enumerate(batch_lines(a.file), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parsed.append((n, parse_batch_line(n, line, a.dir)))
    if not parsed:
        raise Erro("o lote não tem nenhum comando")
    BATCH = Sessao(a.dir)
    BATCH.deferred = True
    try:
        for n, argv in parsed:
            try:
                sub = build_parser().parse_args(argv)
                sub.fn(sub)
            except Erro as e:
                raise Erro(e if str(e).startswith(f"linha {n}:") else f"linha {n}: {e}")
            except SystemExit:  # `-h` do argparse: não é um comando
                raise Erro(f"linha {n}: ajuda (-h) não entra no lote")
        BATCH.deferred = False
        BATCH.flush()
    finally:
        BATCH = None


# --- vagas (etapa #1440) ---

IGNORED_PREFIXES = ("changelog/", "docs/design-system/")
IGNORED_EXACT = ("mcp/version.ts", "docs/TESTING-NUVEM.md#blocos")
ROUTE_FILE = "docs/TESTING.md"  # comparado por âncora (roteiro)
SECTION_FILES = ("docs/FLOW.md", "docs/PROCESS.md")  # e os SKILL.md: comparados por âncora (seção `##`)
SECTION_GLOB = ".claude/skills/*/SKILL.md"
STARTED_STATUS = ("em andamento", "esperando dono", "falhou")


def plan_field(plan, key):
    """Valor de `key=` na ficha (campos separados por `|` ou `;`); None se faltar."""
    for part in plan.replace(";", "|").split("|"):
        part = part.strip()
        if part.startswith(key + "="):
            return part[len(key) + 1:].strip()
    return None


def norm_path(x):
    x = x.replace("`", "").replace(" ", "")
    while x.startswith("./"):
        x = x[2:]
    return x


def toca_list(plan):
    """Citações do `toca=` já normalizadas, sem as que não contam; `?` se a ficha não diz."""
    raw = plan_field(plan, "toca")
    if raw is None or raw.strip() in ("", "?"):
        return ["?"]
    # Anotação entre parênteses depois do caminho ("x.ts (novo método)") não faz parte dele.
    raw = re.sub(r"\s+\([^)]*\)", "", raw)
    out = []
    for x in raw.split(","):
        x = norm_path(x)
        if not x or x in IGNORED_EXACT or x.startswith(IGNORED_PREFIXES):
            continue
        out.append(x)
    return out


def covers(a, b):
    """`a` (pasta `x/` ou `x/**`, pasta sem barra final ou glob `*`) cobre o caminho `b`?"""
    if a.endswith("/**"):
        a = a[:-2]
    if a.endswith("/"):
        return b.startswith(a)
    if "*" in a:
        return fnmatch.fnmatchcase(b, a)
    return b.startswith(a + "/")


def same_target(a, b):
    """Duas citações do `toca=` mexem no mesmo lugar? (roteiro do TESTING.md, pasta, arquivo)"""
    if a == "?" or b == "?":
        return True
    pa, _, anc_a = a.partition("#")
    pb, _, anc_b = b.partition("#")
    if pa != pb:
        return covers(pa, pb) or covers(pb, pa)
    if pa != ROUTE_FILE and pa not in SECTION_FILES and not fnmatch.fnmatchcase(pa, SECTION_GLOB):
        return True
    return not anc_a or not anc_b or anc_a == anc_b


def first_conflict(mine, other):
    for x in mine:
        for y in other:
            if same_target(x, y):
                return "?" if y == "?" else x
    return None


def dep_state(plan):
    """Dependências da ficha: ('?', []) se faltar; senão ('ok', [(#n, estado)])."""
    raw = plan_field(plan, "dep")
    if raw is None or raw.strip() in ("", "?"):
        return None
    if raw.strip().lower() == "nenhuma":
        return []
    deps = []
    for d in raw.split(","):
        d = d.strip()
        if not d:
            continue
        num, _, st = d.partition(":")
        deps.append((num.strip(), st.strip()))
    return deps or None


def incomplete_fields(plan):
    """Campos da ficha que faltam: `dep` e `toca` em `?` ou ausentes; `fases` só em `?` ou vazio."""
    out = []
    if dep_state(plan) is None:
        out.append("dep")
    if toca_list(plan) == ["?"]:
        out.append("toca")
    fases = plan_field(plan, "fases")
    if fases is not None and fases.strip() in ("", "?"):
        out.append("fases")
    return out


def redo_rows(q):
    """Linhas não concluídas com a ficha incompleta (a ficha se refaz no ciclo)."""
    return [r for r in q if r["status"] != "concluída" and incomplete_fields(r.get("plan", ""))]


def changes_schema(plan):
    v = plan_field(plan, "schema")
    return v is None or v.strip() != "não"


def plan_block(plan, merged, done):
    """Motivo de a ficha segurar a etapa: ficha incompleta ou dependência fora da `main`; "" se não segura."""
    miss = incomplete_fields(plan)
    if miss:
        return "ficha incompleta (" + ", ".join(miss) + ")"
    miss = [d for d, st in dep_state(plan) or []
            if not (st == "main" or d in merged or d in done)]
    return "dep " + ", ".join(miss) if miss else ""


def exclusive_block(r, taking):
    """Decisão 12: a exclusiva só começa com ninguém começado; com uma exclusiva rodando, ninguém começa."""
    for o in taking:
        if o.get("exclusive") == "sim":
            return f"exclusiva {o['issue']} em andamento"
    if r.get("exclusive") == "sim" and taking:
        return "exclusiva (espera a fila esvaziar)"
    return ""


def slots_plan(q, meta):
    """(texto de meta.vagas, [issues que começam agora], pedaços do texto); decisões 4 e 5 da #1440."""
    n = meta.get("paralelo") or DEFAULT_PARALELO
    merged = set(meta.get("merged", []))
    done = {r["issue"] for r in q if r["status"] == "concluída"}
    busy = sum(1 for r in q if r["status"] == "em andamento")
    started = [r for r in q if r["status"] in STARTED_STATUS
               or (r["status"] == "aguardando" and r.get("started"))]
    cands = sorted((r for r in q if r["status"] == "aguardando" and not r.get("started")),
                   key=lambda r: r["order"])
    free = n - busy
    parts = [f"Vagas {busy}/{n}"]
    now_list = []
    taking = list(started)
    for r in cands:
        plan = r.get("plan", "")
        why = r.get("hold") or ""
        if not why:
            why = plan_block(plan, merged, done)
        if not why:
            why = exclusive_block(r, taking)
        mine = toca_list(plan)
        if not why:
            for o in taking:
                c = first_conflict(mine, toca_list(o.get("plan", "")))
                if c:
                    why = f"arquivo {c} com {o['issue']}"
                    break
        if not why:
            for o in taking:
                if changes_schema(plan) and changes_schema(o.get("plan", "")):
                    why = f"schema com {o['issue']}"
                    break
        if not why:
            if free > 0:
                why = "começa"
                free -= 1
                now_list.append(r["issue"])
                taking.append(r)
            else:
                why = "vagas cheias"
        parts.append(f"{r['issue']} {why}")
    if free > 0:
        parts.append("nenhuma ready elegível")
    return " · ".join(parts), now_list, parts


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


def ci_wait_rows(q):
    return [r for r in q if r.get("ciWait")]


def ci_wait_text(r):
    since = r.get("ciWaitAt")
    mins = f" ({minutes_since(since)} min)" if since else ""
    return f"{r['issue']} {r['ciWait']}{mins}"


def show_row(r):
    print(f"{r['issue']} {r['title']}")
    for k, v in r.items():
        if k not in ("issue", "title") and v not in ("", 0):
            print(f"  {k}: {v}")


def slugify(title):
    """Slug de um `##`: minúsculas, sem acento (NFKD, sem as marcas), `-` por sequência fora de [a-z0-9], sem `-` nas pontas."""
    text = unicodedata.normalize("NFKD", title)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def cmd_slug(a):
    print(slugify(a.title))


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
    vagas, agora, _ = slots_plan(q, meta)
    print(f"vagas: {vagas}")
    print("começar agora: " + (" ".join(agora) or "nenhuma"))
    print(f"início: {meta.get('runStart') or '—'}  atualizado: {meta.get('updatedAt', '—')}")
    print(f"reserva: {meta.get('reserve') or '—'}")
    redo = redo_rows(q)
    print("fichas a refazer: " + (" ".join(r["issue"] for r in redo) or "nenhuma"))
    pend = meta.get("unpublished") or {}
    if pend.get("files"):
        print(f"não publicado desde {(pend.get('since') or '')[11:16] or '—'}: " + " ".join(pend["files"]))
    else:
        print("não publicado: nenhum")
    print(f"custo: {cost_summary(meta)}")
    ctx = meta.get("context")
    if ctx is None:
        print("contexto: —")
    else:
        alert = (f" — acima de {CONTEXT_LIMIT}%: troque de sessão agora (\"Troca de sessão\")"
                 if ctx > CONTEXT_LIMIT else "")
        print(f"contexto: {ctx}% ({meta.get('contextAt', '—')}){alert}")
    for r in q:
        if r["status"] == "em andamento":
            print(f"  {r['issue']} {r['stage']} · {r['step']} · filhas: {r.get('child') or '—'}")
    late = late_rows(q)
    print("atrasadas: " + ("; ".join(
        f"{r['issue']} {r['child']} ({minutes_since(r['childAt'])} min)" for r in late) or "nenhuma"))
    print("esperando o coordenador: " + ("; ".join(
        f"{r['issue']} ({r['wait']})" for r in waiting_rows(q)) or "nenhuma"))
    print("CI esperando o coordenador: " + ("; ".join(
        ci_wait_text(r) for r in ci_wait_rows(q)) or "nenhuma"))
    print("últimas do log:")
    for e in lg[-5:]:
        print(f"  {e['at']}  {e['text']}")


class Parser(argparse.ArgumentParser):
    """Dentro de um `apply`, argumento inválido vira Erro (o lote cita a linha) em vez de sair."""

    def error(self, message):
        if BATCH is not None:
            raise Erro(message)
        super().error(message)


def build_parser():
    p = Parser(description=__doc__)
    p.add_argument("--now", help="substitui o relógio (ISO UTC, para testes)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_):
        sp = sub.add_parser(name, help=help_)
        sp.add_argument("dir", help="pasta dos arquivos JSON")
        sp.set_defaults(fn=fn)
        return sp

    sp = add("init", cmd_init, "cria os 3 arquivos vazios")
    sp.add_argument("--force", action="store_true")
    sp = add("start", cmd_start, "marca o início da execução (e as vagas com --paralelo N)")
    sp.add_argument("--paralelo", type=int, help="número de vagas (padrão 2)")
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
    sp = add("session", cmd_session, "registra uma sessão criada para a etapa (sem repetir; kind= [label=] também a põe em meta.sessions)")
    sp.add_argument("issue")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="*")
    sp = add("cost", cmd_cost, "grava o custo de uma sessão (usd= ctx= [model= effort= served= issue= kind=])")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="+")
    sp = add("merged", cmd_merged, "registra uma etapa mesclada na main (sem repetir)")
    sp.add_argument("issue")
    sp = add("context", cmd_context, "registra o contexto do coordenador (0 a 100)")
    sp.add_argument("pct")
    sp = add("apply", cmd_apply, "grava vários subcomandos de uma vez (um por linha; '-' lê do stdin)")
    sp.add_argument("file", metavar="arquivo", help="arquivo com os comandos, ou - para o stdin")
    add("published", cmd_published, "imprime a hora da publicação (at:) e limpa o que falta publicar")
    add("touch", cmd_touch, "a publicação falhou: marca de novo os 3 arquivos como não publicados")
    sp = sub.add_parser("slug", help="imprime o slug de um título `##` (âncora de seção)")
    sp.add_argument("title", metavar="título")
    sp.set_defaults(fn=cmd_slug)
    sp = sub.add_parser("costs", help="total, por tipo e por etapa (lê só o meta; --desde <ISO> filtra por created)")
    sp.add_argument("--desde", help="só as sessões com created a partir desta data (ISO UTC)")
    sp.add_argument("dir", help="pasta dos arquivos JSON")
    sp.set_defaults(fn=cmd_costs)
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
