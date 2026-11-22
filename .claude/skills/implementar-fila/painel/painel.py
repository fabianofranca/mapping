#!/usr/bin/env python3
"""Maintains the 3 data sets of the "Fila de desenvolvimento" panel.

Files in one folder: queue.json, meta.json, log.json (JSON lists).
Each command prints, at the end, `alterados: <files written>`; `apply`, a lone `row` that writes `stage` or `status` and `merged` then print, after `alterados:`, the
`começar agora:` line of `show` (stage #2480, computed on the state just written), only when it is not `nenhuma`.
The note "Vagas k/N" (meta.vagas) is recalculated on every write, from the fichas (`plan`),
from `meta.paralelo` (`start --paralelo N`) and from `meta.merged` (`merged`); `context` keeps the coordinator's
context: `context --medir --max <n>` measures it with `scripts/ci/contextUsage.mjs` and writes the `pct` with the source
(`sessao`/`recente`); `context <pct> [--fonte get_session]` is the number given by hand (source `manual`, or `get_session`).
`show` prints `vagas:`, `começar agora:`, `contexto: <pct>% (<when>, <source>)`, with the alert above
CONTEXT_LIMIT and the notices for a hand-given measure and for a stale measure (older than CONTEXT_STALE_MINUTES).
Incomplete ficha (decision 11 of #1532): `dep`, `toca` or `fases` set to `?` (or `dep` and `toca` without the field) gives the reason
`ficha incompleta (<fields>)` and goes into `fichas a refazer:` of `show`; a stage started with `toca=?` keeps conflicting
with every candidate (`arquivo ? com #N`). The `toca=` lists files and sections (#1812): a file, a file pattern
(`*` only in the last segment, which does not start with `*`, and never in `docs/`, in `.claude/` or in a root `.md`), a section of a
document with sections (`docs/TESTING.md#R9`, `CLAUDE.md#regras-de-arquitetura`) or a document with sections that does not
exist yet, cited whole. A folder (ends in `/` or `/**`, or exists at the repository root), `**`, a pattern outside that form,
an existing document with sections but no anchor, and an anchor outside the form (in `docs/TESTING.md`, `R<n>`, `RP`, `RF`, `RA`, `RB`, a
slug or `inicio`; in the others, a slug or `inicio`) give `ficha incompleta (toca: <first invalid citation>)` and go into
`fichas a refazer:`, including on the already started stage, whose old citations stay in the comparison as today until the ficha is
redone; the `exclusive=sim` line does not go through this validation (only the `?` makes it incomplete). A non-empty `toca=` whose citations are all ignored (`IGNORED_PREFIXES`, `IGNORED_EXACT`) normalizes to `?` (decision 8 of #2562): it is incomplete (the exclusive line too), a started one conflicts with every candidate, and `toca` and `conflito` print `inválida: <the list> — only ignored citations` (codes 1 and 2); an append-only citation is not ignored. `toca "<citations separated by commas>"` checks a list: `ok` (code 0) or one `inválida: <citation> — <reason>` line per citation (code 1).
`conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]…` (decision 9 of #1864, read-only, outside `apply`) checks a `toca` against
the started and not merged stages of the folder, the ones `show` lists in `começar agora:` and each `--com`, with the same calculation as the queue:
`livre` (code 0, also without `--pasta` and without `--com`), one `conflito: <citation> com #N (<status>|começa agora|fora do painel)` line
per conflicting stage (code 1) or `inválida: <citation> — <reason>` (code 2).
Append-only citations (decisions 1 to 5 of #2314): `APPEND_ONLY` is the fixed list of index sections and key files that every stage appends to
(`docs/MCP.md#tools`, `src/i18n/en-US.ts`, …); `first_conflict` drops them from **both** sides before comparing, so two stages that share only
those start together (`vagas:`, `começar agora:`, `conflito` and the graph's waves all read `first_conflict`). Only the comparison changes:
`toca` still validates them, the ficha keeps them, and `toca=?` still conflicts with every started stage, including a candidate whose
citations are all append-only or ignored. An old whole-document citation (`docs/MCP.md`) is not append-only.
`exclusive=sim` on the row (`exclusive=` clears it) makes the stage start only with the queue
free of any started and not merged stage (`exclusiva (espera a fila esvaziar)`). Once started and not yet merged, it holds all
the others in any state (`em andamento`, `aguardando` with `started`, `esperando dono`, `falhou`), and the reason says the
state: `exclusiva #N <status>` (`em andamento` also for the one that starts in the same calculation). The way out is the owner's alone: with
their order written in the queue chat, the coordinator writes `row '#N' exclusive=` and the `log` "exclusiva #N liberada pelo dono" (decisions
2 and 3 of #1595). The exclusive stage at the front drains the queue (#1813): the first candidate by `order`, without `hold`, with a complete
ficha, merged dependencies and that does not start in this calculation, if it is exclusive, holds the candidates after it
(`segurada para a exclusiva #N`, after `exclusiva #N <status>` and before `exclusiva (espera a fila esvaziar)`) until the
last started one is merged; an ordinary one at the front that waits for a file, schema or slot is the first and there is no draining. `show`
says `drenando para a exclusiva: #N` (or `nenhuma`) after `começar agora:`; nothing is written (recalculated on every write).
Every `.md` under `docs/`, the root `.md` files (`CLAUDE.md`, `README.md`) and the `.claude/skills/*/SKILL.md` are the documents
with sections, and are compared
by section (`docs/ARCHITECTURE.md#desempenho`, `CLAUDE.md#regras-de-arquitetura`; `docs/TESTING.md` by script, `#R12`); the other
files, including the `.md` files of other folders, count whole; `slug "<title>"` prints the slug of a `##`.
`ciWait` (the PR whose CI the coordinator is waiting for, e.g. `PR #7`) and `ciWaitAt` (since when; `ciWait=` clears
both) go into the `CI esperando o coordenador:` line of `show`; changing or clearing `child` does not touch them.
A phase waiting for the owner in its chat (decision 7 of #1602): the row with `child` and a `wait` starting with `dono no chat da fase:`
(the mark; the `status` does not count, because `esperando dono` also applies to a requested merge and to a high-severity finding) goes into
`esperando o dono no chat da fase:` of `show`, and not into `esperando o coordenador:` or `atrasadas:` (the `wait` takes it out of
the count). Since the `wait` takes it out of `atrasadas:`, the `esperando o dono há mais de 1 h:` line gives it back to the hourly
check (`get_session` of the child), with "prazo vencido" from 240 min (CL1, #1627).
`apply DIR <file|->` writes several subcommands at once (one per line, in the command-line syntax
without `painel.py` and without the folder; blank lines and `#` are ignored; `show`, `init`, `published` and `apply` are not
allowed): all or nothing, with a single `alterados:` line and, on error, code 2 citing the line number.
Every write adds the files to `meta.unpublished` (`{since, files}`: what was written and not yet
published; `show` prints it). `published DIR` prints `at: <ISO UTC>` (the value of `updated.at` and `edit.at`
of the publication), lists the files to send, writes `meta.publishedAt` and `meta.publishing` (what is in flight), but
**keeps** `unpublished`: only `published DIR --done`, run after the successful `batch`, clears it (and only if nothing
was written since the `published`; otherwise what was written stays). Without the confirmation (dead session, context overflow),
`show` keeps saying what is missing and the check republishes. On resume, the published copy carries the `publishing` of the send that
succeeded: `published DIR --done` on it, after downloading the three files and before `show`, clears the `unpublished` it
carries (without `publishing`, from an old panel, it prints "nada em voo" and stays as not published; the next publication resolves it; decision 4
of #1595). `touch DIR` marks the three files again.
Cost (decisions 5 and 26 of #1532): `session DIR '#n' <id> kind=<type> [label=<code>]` adds `{id, issue, kind, label,
created}` to `meta.sessions` (without `kind`, only the row's `sessions`, as before); `cost DIR <id> usd= ctx= [model= effort=
served=] [issue= kind=]` writes the session's cost (`kind` required with a new id); `costs [--desde <ISO>] DIR` reads only the `meta`
and prints the total, one line per kind (sessions, US$, median) and one per stage (with `--desde`, only those with `created` from
the date on); `show` brings the `custo:` line.
`outliers [--desde <ISO>] DIR` (decisions 3 to 9 of #1937, read-only, outside `apply`) reads the queue and the meta: for the `concluída` stages
with a valid `fases=` and a `toca=` other than `?` (with `--desde`, `started` from the date on) it divides the stage cost by the planned
phases and lists, per group (`process` by `is_process_stage`, else `product`), those strictly above `OUTLIER_FACTOR` times the group
median, with the cause: the session kind that went furthest above the group's median in that kind. A group under `OUTLIER_MIN_BASE` stages
flags nothing; a stage without a usable ficha (and one only in `meta.merged`) enters `without ficha`.
Tester ceiling (decision 9 of #1639): a `cost` of a `testador` or `reteste` session with `ctx` above TESTER_CONTEXT_LIMIT
is written as always, exits with 0 and prints `acima do teto do testador (300 mil): <id> <ctx>`; `show` brings `testador acima do teto: <stage> <label> <ctx in thousands>k; …` (or `nenhum`), only for the stages not `concluída` or `recusada` and outside `meta.merged`.
Current session of each role (decision 7 of #1532): `role DIR <coordenador|supervisor> <id> [link=<url>]` writes
`meta.roles.<role> = {id, n, at, link, previous}` (`previous` = the id registered before) with `n` = the previous one + 1 (or 1); `roles DIR` reads only the `meta` and prints
`coordenador <n>: <id>` and `supervisor <n>: <id> (<link>)`, or `—`. A session that is not the registered one does not act.
`roles --sessao <id> DIR` (decisions 3 and 4 of #1643) adds the `esta sessão: …` line, the first that matches: `registrada` (the
`roles.supervisor.id`), `coordenador (não supervisiona)` (the `roles.coordenador.id` or `.previous`, or `kind: coordenador` in
`meta.sessions`), `antiga (atual: <id>)` (the `roles.supervisor.previous`, or `kind: supervisor` in `meta.sessions`),
`sucessora (antecessor: <id>)` (another id, with a registered supervisor) or `nova (nenhum supervisor registrado)`; an empty id gives code 2.
Supervisor requests (decision 9 of #1532): `sup DIR SUP-<n> [tipo=A|B] [pedido="…"] estado=<state> [evidencia="…"]` writes
to `meta.requests` (`{id, tipo, pedido, estado, evidencia, at, history}`; a new request needs `tipo` and `pedido`;
`aplicado` and `recusado` require `evidencia`; `atrasado` is not written); `requests DIR` reads only the `meta` and prints the table,
with `atrasado` for `enviado` or `aprovado` for more than 90 min; `show` brings `pedidos do supervisor:`.
`requests --desde <ISO> DIR` (decision 5 of #1643) shows, in the same format, only the requests with `at` from the given time on and all the
open ones (`enviado`, `perguntado ao dono`, `aprovado`); with requests left out, the last line is `<k> pedidos fechados antes de <ISO> fora
da lista`; with nothing to show, `nenhum desde <ISO>` (and `nenhum` if the panel has no request). A `--desde` that is not ISO UTC gives code 2.
Rules in force (decision 10): `rule DIR add "<text>" origem=<dono|SUP-n> [saida="…"]` gives `R<k>` in `meta.rules` and
`rule DIR end R<k> [motivo="…"]` withdraws it; `show` prints `regras em vigor:` with the full text of each one.
Owner questions (stage #2070, decisions 4 and 5): `pergunta DIR '#n' <verbo> texto="…"` opens a question in `meta.perguntas`
(`{issue, verbo, texto, at}`; the verbs are `PERGUNTA_VERBOS`: `segurar`, `reabrir`, `refazer`, `ampliar`, `soltar`; an unknown verb, a missing
`texto` or a row outside the queue gives code 2; the same row and verb already open changes nothing) and `pergunta DIR '#n' <verbo> --fim
[resposta="…"]` closes it, writing the `log` line `pergunta #n <verbo> fechada: <resposta>` (a question that is not open: no-op, code 0).
`row` with a final status closes the row's open questions (`fechada: etapa <status>`). An open question changes nothing in `vagas:`,
`começar agora:`, `atrasadas:` or `esperando o coordenador:`. `show` prints `perguntas ao dono: <k>` (or `nenhuma`) after
`pedidos do supervisor:`, with one indented line per question (`#n <verbo> (há <h> h): <texto>` and, for each supervisor request in
`perguntado ao dono`, `SUP-<k> (há <h> h): <pedido>`); `show '#n'` also prints the row's. `import` brings the questions of the rows it imports.
`pergunta` goes into `apply`.
Hot switch and migration (decisions 17 and 25 of #1532): `upgrade DIR` swaps, idempotently, the hold exactly
`ordem do dono (só com a fila vazia)` for `exclusive=sim` (without hold) and writes to the `log` what changed (nothing, if nothing changed).
`import NEW-DIR OLD-DIR` (a new folder just created with `init`, empty queue; otherwise code 2) brings from the old panel the rows
`aguardando`, `em andamento`, `esperando dono` and `falhou`, in order and renumbered, with the ficha, the phases, the step, the PR, the
`started` and the `hold` (the `em andamento` and `esperando dono` rows with `child` and `wait` also carry `child`, `childAt`, `wait`, `ciWait`, `ciWaitAt` and `sessions`); the
`concluída` ones go into `meta.merged` (together with the old one, without repeats) and the rules in force of `meta.rules` come with their origin. Not brought
over are the `ended`, nor from the `meta` the `sessions` (except those of the canaries, below), `requests`, `current`, `paralelo`, `reserve`, `context`, `roles` and `unpublished`, nor the
log. The holds use the `upgrade` conversion; the `pausada pelo dono` (the transition's drain) is erased. A line in the `log`
records what came over. `import` does not go into `apply`. The canaries (`meta.canarios`) come over with their baseline frozen (stage #2260): the old panel's own
"before" becomes the canary's `base` (`fonte: import`) when it has sessions, otherwise an old `base` stays; and the canary's sessions come with them, the ones whose id
is in the `sessoes` of a carried canary whole (`cost`, `sinais`, `canario`) and, of the same stages, the others without `cost`, so `k/n`, the canary side and the rework
ruler survive the switch and `custo:` counts only the canary's own; the `log` line then ends in `sessões de canário <k>`.
Plan phases (stage #1705): `phases` keeps `<code>:<state>` separated by `|`, with the states `todo` (to do: only comes
from the ficha), `open` (open, with the session created) and `ok` (merged into the epic). Every write (`Sessao.flush`) completes the rows
from the ficha (`fases=`): its phases come first, in its order, with the state they already had (or `todo`), and then the `open`
and `ok` items that the ficha does not bring (the `CLn`); the `todo` of an old ficha goes away. The `concluída` row and an absent, empty
or `?` ficha do not change. If any row changed, `queue.json` goes into `alterados:` and into `meta.unpublished`, even on a `context`.
`phase` accepts only `ok` and `open`: the `todo` is not written by hand.
Queue graph (stage #1761): every write writes, right after `vagas` and `vagasItens`, `meta.grafoNos` and `meta.grafoSetas`
(`show` does not change). Node: `{issue, titulo, onda, rank, estado, motivo, fase, feitas, total}` of each non-`concluída` row, in
the order wave, `rank` (`null` last) and `order`; `estado` is `rodando`, `dono`, `arquivo`, `dep`, `exclusiva`, `segurada`, `livre`
or `ficha`, read from the reason that `slots_plan` gave the candidate. Waves, in rounds: wave 0 has the started ones and those that start now; in
each round enter, in `order`, those that depend only on nodes already placed and have no file (`first_conflict`) and no schema (both
`changes_schema`) in common with the ones already in that round; the rest wait for the next round, so a wave is a set of stages that
can run together (stage #2293). A row with `hold` or an incomplete ficha enters its round without the check, neither blocking nor
blocked. The slots do not cut a wave (`Vagas k/N` already shows them). The exclusive stage at the front (the first by `order`, without
`hold` and with a complete ficha) enters alone after the ordinary ones that come before it and before those it holds (`estado`
`exclusiva`, reason `segurada para a exclusiva #N`); in a cycle, what is left enters together in the last one.
`rank` (1, 2, 3…): the `aguardando` without `started`, except `segurada` and `ficha`, by wave and `order`; the others stay `null`. Arrow
`{de, para, tipo}` (the arrow runs from the holder to the held one): `dep` by the ficha's `dep=` between nodes (without `:main` or `meta.merged`), only the
transitive reduction, and `arquivo` (see below). Every blocker (stage #2293, decisions 4 and 5): a node that is not started, is outside wave 0 and
is not `segurada` or `ficha` has in its `motivo` all its blockers, read from the waves already assigned and joined by `; `: the open dependencies
(`dep #A, #B`, with `#N recusada`, as in `plan_block`), then one `arquivo <citation> com #N` per earlier-wave node (wave, then `order`) that shares a
file with it (the citation of `first_conflict`), then one `schema com #N` per earlier-wave node that shares only the schema. The `exclusiva` state keeps
the `slots_plan` reason first; with no blocker the `slots_plan` reason stays (`vagas cheias`). Each of those file and schema blockers is one `arquivo`
arrow to the node, each pair once; the single `holder` arrow of the reason stays only for the other nodes. `estado` and `rank` do not change.
Usage and quality (stage #1889, decisions 2 to 7): every write refreshes `meta.uso`, one entry per key (`papel`, `modelo`, `esforco`) of
the sessions with a `cost`: the model is the family of the id in `cost.model` (`Haiku`, `Sonnet`, `Opus`, `Fable`; another id as it came),
the effort as written; with `sessoes`, `usd`, `pct`, `medianaSessao`, `medianaEtapa` (only merged stages), `ctxMediano`, `acimaTeto`
(`ctx` > 300000 in `fase`, `correção`, `testador` and `reteste`), `intervencoes` (`dono` plus the context switches), `sinais` (the signals added
up) and, for the roles with a rework ruler (`fase`, `correção`, `testador`, `reteste`): `decididas`, `comRetrabalho`, `sequencia` (decided sessions in
a row without rework, from the most recent back) and `candidato` (the step below, from CLEAN_STREAK = 10 in a row). `uso [--desde <ISO>] DIR`
prints one line per key and the signals. `sinal DIR <id> campo=valor…` writes `meta.sessions[i].sinais` (`ci`, `cr`, `crFix`, `ciclo`,
`dono`, `sub` in `fase` and `correção`; `ok`, `falha`, `alta`, `media`, `baixa`, `falso=<high|medium|low>` and `sub` in `testador` and `reteste`; a
number replaces and `+k` adds; all or nothing, code 2 on a bad field). `escapado DIR '#<bug>' etapa='#<n>' sev=<high|medium|low>` writes
`meta.escapados` (the same bug replaces) and `escapado DIR --conferido` writes `meta.escapadosAt`; `historico DIR --feito desde=<ISO>
ate=<ISO> [linhas=<k>]` writes `meta.historico`. `sinal`, `escapado` and `historico` go into `apply`; `uso` does not. `show` prints
`escapados:` (with `— conferir` after ESCAPE_CHECK_HOURS = 24 h or without a check), `histórico:` and `candidatos a teste:` right after
`testador acima do teto:`. Rework ruler (decision 6): only stages decided (`concluída` or in `meta.merged`) count; a session with no signal and no rework seen is "sem dado", not clean.
Rework per role: `fase` has it with a `correção` or a `testador` with `alta`+`media` > 0 in its stage, an escaped defect `high`/`medium` of the stage, `ci` >= 2
or `ciclo` >= 1; `correção`, with `ci` >= 2, `ciclo` >= 1, an escaped defect of the stage, another `correção` of a different label created after it or a `reteste`
created after it with `alta`+`media` > 0; `testador`, with an escaped defect `high`/`medium` of its stage; `reteste`, with a `falso` of `high` or `medium`.
`fechamento`, `coordenador` and `supervisor` have no ruler. The escaped `low`, `ci` 1 and a successor `correção` of the same label are not rework.
Canaries (stage #1889, decisions 12 to 15, and #2165): canary A (retest on Haiku) was promoted, so the ones in use are B (the phase) and C (the
tester), with A kept as history; `meta.canarios` holds `{id, papel, de, modelo, esforco, filtro, n, volta, inicio,
sessoes, estado, motivo, fim}` plus what every write recomputes (`contadas`, `retrabalhos`, `resumo`; the page draws them in the "Canaries" block).
`canario DIR add <id> papel=<role with a ruler> de="<model> <effort>" [modelo=<family>] [esforco=<effort>] [filtro=processo] n=<k> volta=<k>`
tries a cheaper configuration (`modelo` and `esforco` default to those of `de`; at least one has to change; `filtro` only `processo`;
`n` and `volta` positive; a repeated id, a role without ruler or any other bad field is code 2 and nothing is written);
`canario DIR end <id> [motivo="…"]` makes it `terminado pelo dono` (not a `revertido` one); both go into `apply`.
`canario DIR base <id> <old folder> [fonte=<text>]` (stage #2260) reads `queue.json` and `meta.json` of the old folder, read-only, and writes as the
canary's `base` the side of the canary's role, `de` and filter over the old sessions with a cost created before `inicio`, summarized with the old
panel's own ruler (its decided stages), plus `fonte` (default `painel anterior`) and `at`; it prints `base: <k> sessões` and, with 0 sessions, exits with
code 3 and writes nothing (1 is an uncaught error, 2 an unreadable folder or a bad argument). `canario DIR base <id> --nenhuma` writes `base = {fonte: nenhuma, sessoes: 0}`. A repeat replaces the base; an unknown canary
or a missing folder or file is code 2. It reads another folder, so it stays out of `apply` (an `Erro` there, as `usar`).
`canario DIR usar <fase|correção|reteste|testador> '#n' modelo=<m> esforco=<e>` only reads (outside `apply`) and prints `canario=<id> modelo=<m> esforco=<e>` when the
requested configuration is the `de` of an `ativo` canary of the role that has not counted `n` and, with `filtro=processo`, the ficha of `#n`
passes (decision 14: `testador=nenhum` and every citation of `toca=` is `.claude/`, `.github/`, `scripts/ci/`, `tests/tooling/`, `changelog/`,
`docs/design-system/`, `docs/PROCESS.md`, `docs/FLOW.md`, `docs/TESTING-NUVEM.md` or `CLAUDE.md`, with or without `#section`); otherwise `atual`.
`session DIR '#n' <id> kind=<role> [label=] canario=<id>` adds the session to the canary (code 2 for an unknown canary, another role or a
canary that is not `ativo`; a phase also takes its successor by context, the same stage and label, while the canary is `em avaliação`).
The canary counts `n` in sessions, and in `fase` and `correção` in distinct phases (stage + label). States: `ativo`, `em avaliação` (counted `n`),
`encerrado` (every stage of the canary decided), `revertido` as soon as the rework reaches `volta` (at any time, with one `log` line written
once: `canário <id> revertido: <k> retrabalhos (<ids>)`) and `terminado pelo dono`. Rework of a canary: `reteste`, each `falso` `high`/`medium` in
its sessions; `fase`, a `correção` in the stage of one of its sessions (once per stage) and each `ciclo`; another role, the ruler of decision 6.
`resumo` = `{antes, canario, medida, veredito}`: each side has `sessoes` (with a cost), `medianaSessao`, `medianaEtapa`, `decididas` and `comRetrabalho`
(decision 6) and, for `testador` and `reteste`, `passos` (`ok` + `falha` over the sessions that have either written), `usdPorPasso` (their US$ ÷
`passos`, 3 decimals), `xFalso`, `naoExec`, `xFalsoPct` (100 × `xFalso` ÷ `falha`) and `naoExecPct` (100 × `naoExec` ÷ (`ok` + `falha` + `naoExec`)), the
last four over the sessions that have `naoExec` written (`xFalso` absent counts 0; None without such a session or with a 0 denominator); the other roles have
them None. The effective "before" (`antes`) is the panel's own: the same role and the `de` configuration (and, with a filter, the same filter) created
before `inicio`, `fonte: painel`, when it has a session; otherwise the canary's `base` (its `fonte`); with neither, the empty side (`fonte: nenhuma`). `medida` is `passo` when the
role has steps and both sides have `usdPorPasso`, else `sessão` (`medianaSessao`). The verdict, in this order, is `revertido`, `sem base` (the "before" lacks
the measure compared; in any state), `pode promover` (`encerrado`, at most PROMOTE_MAX_REWORK = 1 rework and the measure lower than before) or `não promover`.
The signals `xFalso` (false ❌) and `naoExec` (steps not executed) are numbers like `ok` (`sinal` on `testador` and `reteste`; `uso` adds them up); they are recorded and shown, never part of the ruler, the rework or the verdict.
A role with a canary `ativo` or `em avaliação` has no `candidato` in `meta.uso`.
`show` prints the line `canários: <id> <role> <de> → <model> <effort> <k>/<n> (retrabalhos <r>/<volta>, <state>; <verdict>); …`
(or `canários: nenhum`) right after the `meta.uso` candidates line; a `sem base` verdict whose `base.fonte` is not `nenhuma` ends in ` — rodar canario base`.
Fast track in the queue (stage #1791, decisions 3 to 7): `KINDS` has `via-rapida` and `STATUS` has `recusada`, final until `reentra` (not a
candidate, not started, out of `grafoNos` and `fichas a refazer:`, skipped by `fill_phases` and `import`; a row that depends on it stays `dep` and its
reason says `dep #N recusada`).
A `via-rapida` row takes a slot and goes through dependency, file, schema, exclusive and draining like any row (there is no code path by kind in
`slots_plan`); its session kind `via-rapida` is in `SESSION_KINDS` (no ruler, signals or ceiling; it shows in `costs` and `uso`) and `canario usar`
answers `atual` for it. `row … phases=` takes only `<code>:<todo|open|ok>` items (an Erro, code 2, otherwise); `phase` counts an item without `:` as `open`.
`ended` follows the status in `row`: `concluída`, `falhou` or `recusada` write `ended=now` (if the row has none), `aguardando`, `em andamento` or
`esperando dono` clear it, and an explicit `ended=` wins. `end DIR` writes `meta.runEnd = now` (into `apply`); `start` clears it. A merge asked to the owner by
text is a row `esperando dono` with a `wait` starting with `merge pedido ao dono:` and no `child` (`row` stamps `childAt` on a new ask): `show` prints
`merge pedido ao dono: #n (PR #p, <hours since the ask>); …` (or `nenhum`), and the row is not in `esperando o coordenador:` nor `atrasadas:`.
Refused row (stage #2204, decisions 3 to 6): `reentra DIR '#n' kind=<via-rapida|etapa|bug> plan="<ficha>"` (also in `apply`) brings a `recusada` row
back as a fresh `aguardando` one (any other status is an Erro, code 2): it sets the `kind` and the `plan`, clears `started`, `ended`, `pr`, `child`,
`childAt`, `wait`, `ciWait`, `ciWaitAt`, `hold`, `stage` and `phases` (rebuilt from the new ficha, all `todo`), writes `step="reentrou depois da recusa"` and the
`log` line `#n reentrou depois da recusa (<kind>)`; the row keeps its `order` and its sessions (the coordinator applies the order again, `reorder`).
A row that depends on a `recusada` one shows `dep #N recusada` in `vagas:` (`dep #N recusada, #K` with another open dependency; the state stays `dep`), and
`show` prints `dependem de recusada: #M (#N); …` (or `nenhum`) right after `perguntas ao dono:`: the `aguardando` rows not yet started with a `recusada`
row among their open dependencies. The question verb `soltar` is the first command of the `soltar`/`esperar` pair. A `toca=` with only ignored
citations (`changelog/`, `docs/design-system/`, `mcp/version.ts`) is a `?` (stage #2562, decision 8), a ficha without a real `toca`: `outliers` counts it in `without ficha` and
`is_process_stage` (the `processo` canary filter too) answers no. Every `row` with a `wait=merge pedido ao dono: …` and no `child` restarts `childAt`.
Early start (stage #2373, phase EA1): a candidate whose only blockers are file conflicts (`first_conflict`) with eligible holders starts at once: a
started row `em andamento` or `esperando dono` in `Testador`, `Correção` or `Fechamento`, not `exclusive=sim`, not `via-rapida` and with no `cedo`
pending. The reason is `começa cedo (espera #S para testar)` (holders comma-separated), it takes a slot like `começa`, and `show` prints
`começar agora: #E (cedo: #S)`; the schema rule, a conflict with a stage that is not an eligible holder, a family in common in `formato=` (the ficha
field right after `schema=`: `não` or families from spec, component, proposal, comment, signature and icons, comma-separated; absent, `?` or an unknown
family is unknown and excludes the pair) and a `via-rapida` candidate keep the usual `arquivo <x> com #S`. `row '#E' status="em andamento"` on such a
candidate writes `cedo` = its holders (`#S #T`); by hand only `cedo=` (empty) is accepted, `import` carries it and `reentra` clears it. The status
`esperando entrega` (a stage that finished its phases and waits for its holders' merge, started and not merged, no slot, no child) is refused by `row`
without `cedo`, and every write rewrites its step to `espera merge de #S para testar` with only the holders still open. A holder is resolved when merged
(`concluída` or `meta.merged`) or released (`falhou`, `recusada` or no row); `show` prints, right after `merge pedido ao dono:`,
`esperando merge para testar: #E (espera #S); …` and `pode sincronizar: #E (#S mesclada; #T falhou); …` (the rows with every holder resolved, with each outcome:
`mesclada`, `falhou`, `recusada`, `fora da fila`), each `nenhuma` when empty; the `em andamento` line of a row with `cedo` ends in ` · cedo: #S`. Once
`cedo` is cleared the stage is an ordinary started one and opens the early start for another (the second level). `fichas a refazer:` also lists the
non-final rows whose ficha has no `formato=` at all (it does not make the ficha incomplete and holds nothing; `formato=?` is a written value). A standalone note in `toca=` (a comma item made only of balanced parenthesized groups, nested or adjacent: `a.ts,(novo),b.ts`, `(novo (ver #12))`, `(n)(m)`; decisions 4 of #2428 and 7 of #2562, read by one depth scan, `split_toca`) is dropped and also lists the row there, holding nothing; a note after its path (`x.ts (new, helper)`, `x.ts (novo (ver #12))`) is removed from the space before its `(` to the matching `)` and is not one of them; text outside the groups (`(a) x.ts (b)`) keeps it a citation. The
session kind `sincronização` (`SESSION_KINDS`) has no ruler, signals or context ceiling, and `sinal` refuses it. Graph: `estado` `entrega` (reason =
the step) for `esperando entrega`, `cedo` on every node (the holders still open, `#S, #T`, or "") and an arrow `{de: #S, para: #E, tipo: entrega}` for
each open holder of a started row with `cedo`; a `começa cedo` candidate is in wave 0 like `começa`.
Standard library only. Usage: painel.py [--now ISO] <subcommand> DIR ...
(the subcommand comes BEFORE the folder: `painel.py row <folder> '#n' status=...`).
"""
import argparse
import datetime
import fnmatch
import functools
import json
import math
import os
import re
import shlex
import statistics
import subprocess
import sys
import unicodedata

STATUS = ["aguardando", "em andamento", "concluída", "falhou", "esperando dono", "recusada", "esperando entrega"]
FINAL_STATUS = ("concluída", "falhou", "recusada")  # `ended` is written with them (decision 5 of #1791)
OPEN_STATUS = ("aguardando", "em andamento", "esperando dono", "esperando entrega")  # `ended` is cleared with them
KINDS = ["etapa", "bug", "patch", "via-rapida"]
STAGES = ["", "Fases", "Testador", "Correção", "Fechamento", "Mesclada"]
FILES = ["queue", "meta", "log"]
SESSION_KINDS = ["fase", "correção", "testador", "reteste", "fechamento", "coordenador", "supervisor", "via-rapida", "sincronização"]
CONTEXT_LIMIT = 35
CONTEXT_STALE_MINUTES = 70  # a context measure older than this is flagged by `show` (decision 5 of #1874)
CONTEXT_MEASURE_TIMEOUT = 30  # seconds for `contextUsage.mjs` to answer
MEASURE_HINT = "meça com context --medir"
TESTER_CONTEXT_LIMIT = 300000  # tester final-context ceiling (decisions 8 and 9 of #1639): only recorded, it does not hold
TESTER_KINDS = ["testador", "reteste"]
ROLES = ["coordenador", "supervisor"]
HOLD_EMPTY_QUEUE = "ordem do dono (só com a fila vazia)"  # becomes exclusive=sim (decisions 12, 17 and 25)
HOLD_PAUSED = "pausada pelo dono"  # the transition's drain: `import` erases it, `upgrade` leaves it
IMPORT_STATUS = ["aguardando", "em andamento", "esperando dono", "falhou", "esperando entrega"]
IMPORT_FIELDS = ["issue", "title", "kind", "plan", "phases", "phasesTotal", "phasesDone", "stage", "step", "pr",
                 "started", "hold", "cedo"]
OWNER_WAIT_PREFIX = "dono no chat da fase:"  # the mark of the `wait` of a phase waiting for the owner in its chat
MERGE_ASK_PREFIX = "merge pedido ao dono:"  # the mark of the `wait` of a merge asked to the owner by text (decision 3 of #1791)
OWNER_RECHECK_MINUTES = 60  # the hourly check rereads the phase waiting for the owner
OWNER_DEADLINE_MINUTES = 240  # with no answer from the owner by here, the coordinator interrupts the question
IMPORT_RUNNING_FIELDS = ["child", "childAt", "wait", "ciWait", "ciWaitAt", "sessions"]
DEFAULT_PARALELO = 2
INT_FIELDS = ["order", "phasesTotal", "phasesDone"]
QUEUE_EMPTY = {
    "order": 0, "issue": "", "title": "", "kind": "etapa", "step": "",
    "status": "aguardando", "pr": "", "started": "", "ended": "",
    "phases": "", "phasesTotal": 0, "phasesDone": 0, "stage": "",
    # Stage ficha (dependencies, phases, Toca em, Testador), so the issue is not reread.
    "plan": "",
    # Children that still owe a notice (ids separated by spaces) and since when.
    "child": "", "childAt": "",
    # PR whose CI the coordinator is waiting for (e.g. "PR #1467") and since when; empty if none.
    "ciWait": "", "ciWaitAt": "",
    # Short reason the child waits for the coordinator (question, stuck CI, calls the owner); empty if it does not wait.
    "wait": "",
    # Sessions created for the stage (ids separated by spaces), to archive at the end.
    "sessions": "",
    # The owner's reason for holding a stage that has not started ("esperando dono (…)",
    # "ordem do dono (…)", "pausada pelo dono"); empty: not held.
    "hold": "",
    # "sim": exclusive stage (starts only with the queue free of any started and not merged stage; no other starts with it); empty: not.
    "exclusive": "",
    # The eligible holders (`#S #T`, separated by spaces) an early-start stage waits for before its tester; written by `row` itself
    # when the stage starts with the reason `começa cedo`, cleared (`cedo=`) when the sync with `main` is merged; empty: not early.
    "cedo": "",
}
TIME_FIELDS = ["started", "ended", "childAt", "ciWaitAt"]
LATE_MINUTES = 30
REQUEST_STATES = ["enviado", "aplicado", "recusado", "perguntado ao dono", "aprovado", "negado"]
REQUEST_NEEDS_EVIDENCE = ("aplicado", "recusado")
REQUEST_LATE_STATES = ("enviado", "aprovado")  # `atrasado` is computed, never written
REQUEST_OPEN_STATES = ("enviado", "perguntado ao dono", "aprovado")
REQUEST_LATE_MINUTES = 90
PERGUNTA_VERBOS = ["segurar", "reabrir", "refazer", "ampliar", "soltar"]  # the first command of each pair the owner can answer (decision 4 of #2070)
# Usage and quality per role x model x effort (stage #1889).
CLEAN_STREAK = 10  # decided sessions in a row without rework that make a key a candidate for a test (decision 7)
ESCAPE_CHECK_HOURS = 24  # `show` asks to check the escaped defects again after this many hours (decision 5)
RULER_KINDS = ["fase", "correção", "testador", "reteste"]  # the roles that have a rework ruler (decision 6)
PHASE_KINDS = ["fase", "correção"]  # the roles that can have a context switch (a successor session of the same stage and label)
CEILING_KINDS = RULER_KINDS  # where the 300 thousand context ceiling applies (decision 3)
OUTLIER_FACTOR = 2  # a stage is an outlier above this many times the median cost per planned phase of its group
OUTLIER_MIN_BASE = 5  # fewer stages than this in a group: no median worth comparing
CONTEXT_CEILING = 300000  # final-context ceiling of the phase and of the tester (docs/FLOW.md, item 3)
EFFORT_LADDER = ["medium", "high", "xhigh", "max"]  # `low` is below `medium`: the step below of an effort above `medium` goes down this list
MODEL_LADDER = ["Haiku", "Sonnet", "Opus", "Fable"]  # cheapest first; the family is read from the id in `cost.model`
SEVERITIES = ["high", "medium", "low"]
PHASE_SIGNALS = ["ci", "cr", "crFix", "ciclo", "dono", "sub"]
TESTER_SIGNALS = ["ok", "falha", "alta", "media", "baixa", "falso", "sub", "xFalso", "naoExec"]
SIGNAL_FIELDS = {"fase": PHASE_SIGNALS, "correção": PHASE_SIGNALS, "testador": TESTER_SIGNALS, "reteste": TESTER_SIGNALS}
SIGNAL_SUMS = ["ci", "cr", "crFix", "ciclo", "dono", "ok", "falha", "alta", "media", "baixa", "xFalso", "naoExec"]  # the numeric signals `uso` adds up
PROMOTE_MAX_REWORK = 1  # a canary can be promoted with at most this much rework (decision 13, P3 of the stage)
STEP_KINDS = ("testador", "reteste")  # the roles whose sessions carry ok/falha: compared per tested step (decision 6 of #2260)
NO_SESSIONS_CODE = 3  # `canario base` over an old panel with no session of the canary (1 stays the uncaught error, 2 `Erro`)
NO_SOURCE = "nenhuma"  # the `fonte` of a side with no baseline
EFFORTS = ["low"] + EFFORT_LADDER  # the efforts a canary `de=` and `esforco=` accept
CANARY_FILTERS = ["processo"]  # the only stage filter: process stages (decision 14)
CANARY_KEYS = ["papel", "de", "modelo", "esforco", "filtro", "n", "volta"]  # the fields of `canario add` after the id
CANARIO_HELP = "canaries B (phase) and C (tester), A is history: add <id> papel= de=\"<model> <effort>\" [modelo=] [esforco=] [filtro=processo] n= volta= | end <id> [motivo=] | base <id> <old folder> [fonte=<text>] | base <id> --nenhuma | usar <fase|correção|reteste|testador> '#n' modelo= esforco= (read-only: `canario=<id> modelo=<m> esforco=<e>` or `atual`)"  # the help of `canario` (the list of commands and `canario --help`)
CANARY_BUSY = ("ativo", "em avaliação")  # the canary still running: its role has no candidate and `usar` may offer it
CANARY_FULL = ("em avaliação", "encerrado")  # reached n: a later session runs outside it
CANARY_FINAL = ("revertido", "terminado pelo dono")  # the states that never change again
PROCESS_PREFIXES = (".claude/", ".github/", "scripts/ci/", "tests/tooling/", "changelog/", "docs/design-system/")
PROCESS_FILES = ("docs/PROCESS.md", "docs/FLOW.md", "docs/TESTING-NUVEM.md", "CLAUDE.md")  # with or without `#section`

NOW_OVERRIDE = None
BATCH = None  # the shared Sessao of an `apply` in progress (None outside it)


class Erro(Exception):
    """Usage error: exits with code 2 and the message."""


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
    """Atomic write: temporary file in the same folder + os.replace."""
    p = path(d, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, p)


class Sessao:
    """Loads on demand, marks what changed and writes everything at the end."""

    def __init__(self, d):
        self.d = d
        self.data = {}
        self.dirty = []
        self.deferred = False  # in an `apply`, each line's commit waits for the end of the batch
        self.loud = False  # some command that counts as "not published" (a lone `context` does not count)

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
        filled = False
        for row in self.get("queue"):
            filled = fill_phases(row) or filled
        filled = sync_delivery_steps(self.get("queue"), meta[0]) or filled
        if filled:
            # The ficha completed phases: the change goes into the publication, even on a `context`, which alone is quiet.
            self.touch("queue")
            self.loud = True
        text, _, items, reasons, _ = slots_plan(self.get("queue"), meta[0])
        meta[0]["vagas"] = text
        meta[0]["vagasItens"] = items
        meta[0]["grafoNos"], meta[0]["grafoSetas"] = queue_graph(self.get("queue"), meta[0], reasons)
        if update_canaries(self.get("queue"), meta[0], self.get("log")):
            self.touch("log")  # a canary reverted: the line goes into the publication
            self.loud = True
        meta[0]["uso"] = compute_uso(self.get("queue"), meta[0])
        self.touch("meta")
        order = [n for n in FILES if n in self.dirty]
        if self.loud:
            mark_unpublished(meta[0], order)
        for n in order:
            save(self.d, n, self.data[n])
        print("alterados: " + " ".join(n + ".json" for n in order))


def mark_unpublished(meta, files):
    """Adds `files` (names without .json) to meta.unpublished; the `since` is that of the first unpublished write."""
    meta.pop("publishing", None)  # writing again invalidates what was in flight
    pend = meta.get("unpublished") or {}
    have = set(pend.get("files", [])) | {n + ".json" for n in files}
    meta["unpublished"] = {
        "since": pend.get("since") or now(),
        "files": [n + ".json" for n in FILES if n + ".json" in have],
    }


def open_session(d):
    """The session of the `apply` in progress, if any; otherwise a new one."""
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


PHASE_CODE = re.compile(r"[A-Za-z][A-Za-z0-9-]*")
PHASE_STATES = ("todo", "open", "ok")


def validate_phases(value):
    """`phases=` is `<code>:<state>` items separated by `|` (empty clears it); anything else is an Erro (decision 4 of #1791)."""
    for item in value.split("|") if value else []:
        code, sep, st = item.partition(":")
        if not (sep and PHASE_CODE.fullmatch(code) and st in PHASE_STATES):
            raise Erro(f"invalid phases item '{item}': each one is <code>:<state>, with the state todo, open or ok")


def plan_phase_codes(plan):
    """Codes of the ficha's `fases=`, in order and without repeats; None if missing, empty, `?` or without a valid code."""
    raw = plan_field(plan, "fases")
    if raw is None or raw.strip() in ("", "?"):
        return None
    codes = []
    for item in raw.split(","):
        code = item.split(":", 1)[0].strip()
        if PHASE_CODE.fullmatch(code) and code not in codes:
            codes.append(code)
    return codes or None


def fill_phases(row):
    """Completes `phases` from the ficha (its phases first, `todo` where missing) and returns whether the row changed."""
    if row.get("status") in ("concluída", "recusada"):
        return False
    codes = plan_phase_codes(row.get("plan") or "")
    if codes is None:
        return False
    state = {}
    for item in (row.get("phases") or "").split("|"):
        code, _, st = item.partition(":")
        if item and code not in state:
            state[code] = st or "open"  # a repeat counts as the first; without ":" (by hand) it becomes open, like the page
    parts = [(c, state.get(c, "todo")) for c in codes]
    parts += [(c, st) for c, st in state.items() if c not in codes and st != "todo"]
    phases = "|".join(c + ":" + st for c, st in parts)
    total, done = count_phases(phases)
    if (phases, total, done) == (row.get("phases"), row.get("phasesTotal"), row.get("phasesDone")):
        return False
    row["phases"], row["phasesTotal"], row["phasesDone"] = phases, total, done
    return True


def validate_choice(k, v, allowed):
    if v not in allowed:
        raise Erro(f"{k} inválido '{v}'; válidos: " + ", ".join(repr(a) for a in allowed))


def find_row(queue, issue):
    for r in queue:
        if r["issue"] == issue:
            return r
    return None


# --- subcommands ---

def cmd_init(a):
    os.makedirs(a.dir, exist_ok=True)
    if not a.force:
        ex = [n + ".json" for n in FILES if os.path.exists(path(a.dir, n))]
        if ex:
            raise Erro("already exist: " + " ".join(ex) + " (use --force to recreate)")
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
    m["runEnd"] = ""  # a new run is not over (decision 6 of #1791)
    if a.paralelo is not None:
        if a.paralelo < 1:
            raise Erro("--paralelo precisa ser um inteiro a partir de 1")
        m["paralelo"] = a.paralelo
    s.touch("meta")
    s.commit()


def cmd_end(a):
    """Marks the end of the run: `meta.runEnd = now` (the page stops the total there); `start` clears it."""
    s = open_session(a.dir)
    s.get("meta")[0]["runEnd"] = now()
    s.touch("meta")
    s.commit()


def ended_follows_status(pairs, row):
    """Decision 5 of #1791: a final status writes `ended` (if the row has none), an open one clears it; an explicit `ended=` wins."""
    st = pairs.get("status")
    if "ended" in pairs:
        return
    if st in FINAL_STATUS and not (row or {}).get("ended"):
        pairs["ended"] = "now"
    elif st in OPEN_STATUS:
        pairs["ended"] = ""


def stamp_merge_ask(pairs, row):
    """A merge asked by text has no `child`: the `childAt` says since when (the hours of `show`), restarted on every `row` call that
    carries the ask, even with the same `wait` (the skill never records the same ask as a no-op; decision 6 of #2204)."""
    wait = pairs.get("wait") or ""
    if not wait.startswith(MERGE_ASK_PREFIX) or pairs.get("childAt"):
        return
    child = pairs["child"] if "child" in pairs else (row or {}).get("child")
    if not child:
        pairs["childAt"] = "now"


def validate_row_pairs(pairs, issue):
    """The `row` fields: known names, the closed values and the `phases=` form."""
    for k in pairs:
        if k not in QUEUE_EMPTY:
            raise Erro(f"campo desconhecido '{k}'; válidos: " + ", ".join(QUEUE_EMPTY))
    if "issue" in pairs and pairs["issue"] != issue:
        raise Erro("não é possível trocar o campo issue")
    for k, allowed in (("status", STATUS), ("kind", KINDS), ("exclusive", ["", "sim"]), ("stage", STAGES)):
        if k in pairs:
            validate_choice(k, pairs[k], allowed)
    if pairs.get("cedo"):
        raise Erro("cedo is written by painel.py when the stage starts early; by hand only `cedo=` (empty) is accepted")
    if "phases" in pairs:
        validate_phases(pairs["phases"])


def stamp_early_start(s, pairs, row):
    """Decision 3 of #2373: a candidate that starts (`status=em andamento`) with the reason `começa cedo` gets `cedo` = its holders,
    computed by `slots_plan` on the state before the write; an explicit `cedo=` in the same call wins."""
    if pairs.get("status") != "em andamento" or "cedo" in pairs:
        return
    if row is None or row["status"] != "aguardando" or row.get("started"):
        return
    why, _, early = slots_plan(s.get("queue"), s.get("meta")[0])[3].get(row["issue"], ("", "", []))
    if why.startswith(STARTS_EARLY):
        pairs["cedo"] = " ".join(early)


def check_delivery_wait(pairs, row):
    """Decision 4 of #2373: `esperando entrega` is only for a row with `cedo` (the one it ends with after this write)."""
    status = pairs.get("status", (row or {}).get("status"))
    if status == WAITS_DELIVERY and not pairs.get("cedo", (row or {}).get("cedo")):
        raise Erro("esperando entrega needs a row with cedo (the stage that started early waits for its holders)")


def cmd_row(a):
    s = open_session(a.dir)
    q = s.get("queue")
    issue = norm_issue(a.issue)
    pairs = parse_pairs(a.pairs)
    validate_row_pairs(pairs, issue)
    row = find_row(q, issue)
    stamp_early_start(s, pairs, row)
    check_delivery_wait(pairs, row)
    ended_follows_status(pairs, row)
    if pairs.get("child") == "":
        pairs["childAt"] = ""
    if pairs.get("ciWait") == "":
        pairs["ciWaitAt"] = ""
    if pairs.get("ciWait") and "ciWaitAt" not in pairs:
        # New PR in the wait: the time is now, never that of the previous PR (nor blank).
        pairs["ciWaitAt"] = "now"
    stamp_merge_ask(pairs, row)
    if (pairs.get("status") in FINAL_STATUS or pairs.get("ended")) and "ciWait" not in pairs:
        # A finished stage does not wait for CI: a forgotten ciWait does not stay in the check forever.
        pairs["ciWait"] = pairs["ciWaitAt"] = ""
    if "child" in pairs and "wait" not in pairs:
        # Child replaced (session recreated) or removed: the previous one's wait does not apply to the new one.
        pairs["wait"] = ""
    for k in TIME_FIELDS:
        if k in pairs:
            pairs[k] = now() if pairs[k] == "now" else (check_iso(pairs[k]) if pairs[k] else "")
    for k in INT_FIELDS:
        if k in pairs:
            pairs[k] = to_int(k, pairs[k])
    if row is None:
        row = dict(QUEUE_EMPTY)
        row["issue"] = issue
        if "order" not in pairs:
            row["order"] = max([r["order"] for r in q], default=0) + 1
        q.append(row)
    if pairs.get("status", "aguardando") != "aguardando" and "hold" not in pairs:
        pairs["hold"] = ""  # the hold only applies while the stage has not started
    row.update(pairs)
    if "phases" in pairs:
        row["phasesTotal"], row["phasesDone"] = count_phases(row["phases"])
    close_final_questions(s, issue, pairs)
    s.touch("queue")
    s.commit()
    if BATCH is None and ("stage" in pairs or "status" in pairs):
        print_starting(s)  # a lone write that can free a start; inside an `apply` the batch prints once at the end


REENTRA_KINDS = ["via-rapida", "etapa", "bug"]
REENTRA_CLEARED = ("stage", "started", "ended", "pr", "child", "childAt", "wait", "ciWait", "ciWaitAt", "hold", "phases", "cedo")


def cmd_reentra(a):
    """Decision 3 of #2204: a `recusada` row comes back as a fresh `aguardando` one, with the new `kind` and `plan`."""
    issue = norm_issue(a.issue)
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in ("kind", "plan"):
            raise Erro(f"unknown field '{k}'; valid: kind, plan")
    for k in ("kind", "plan"):
        if not pairs.get(k, "").strip():
            raise Erro(f"missing {k}=")
    validate_choice("kind", pairs["kind"], REENTRA_KINDS)
    s = open_session(a.dir)
    row = find_row(s.get("queue"), issue)
    if row is None:
        raise Erro(f"{issue} is not in the queue")
    if row["status"] != "recusada":
        raise Erro(f"{issue} is '{row['status']}': only a refused row re-enters")
    row.update({k: QUEUE_EMPTY[k] for k in REENTRA_CLEARED})  # `phases` comes back from the new ficha (`fill_phases`, all `todo`)
    row.update(status="aguardando", kind=pairs["kind"], plan=pairs["plan"], step="reentrou depois da recusa",
               phasesTotal=0, phasesDone=0)
    s.get("log").append({"at": now(), "text": f"{issue} reentrou depois da recusa ({pairs['kind']})"})
    s.touch("queue")
    s.touch("log")
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
    # an item without ":" (an old panel, by hand) counts as `open`, as `fill_phases` does
    parts = [[c, st or "open"] for c, _, st in (item.partition(":") for item in row["phases"].split("|") if item)]
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
    # Reuses the order numbers that the aguardando rows occupied.
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
        if k not in ("kind", "label", "canario"):
            raise Erro(f"campo desconhecido '{k}'; válidos: kind, label, canario")
    if "label" in pairs and "kind" not in pairs:
        raise Erro("label= só com kind=")
    if "kind" in pairs:
        validate_choice("kind", pairs["kind"], SESSION_KINDS)
    meta = s.get("meta")[0]
    joined = canary_to_join(meta, pairs, a.session, issue) if "canario" in pairs else None
    if "canario" in pairs and joined is None:
        log_outside_canary(s, pairs["canario"], a.session)
    ids = row.get("sessions", "").split()
    if a.session not in ids:
        ids.append(a.session)
    row["sessions"] = " ".join(ids)
    s.touch("queue")
    if "kind" in pairs:
        entry = session_entry(meta, a.session)
        entry.setdefault("created", now())
        entry.update({"issue": issue, "kind": pairs["kind"]})
        if "label" in pairs or "label" not in entry:
            entry["label"] = pairs.get("label", "")
        s.touch("meta")
    if joined is not None:
        entry = session_entry(meta, a.session)
        entry["canario"] = joined["id"]
        if a.session not in joined["sessoes"]:
            joined["sessoes"].append(a.session)
        s.touch("meta")
    s.commit()


def log_outside_canary(s, canary_id, sid):
    """A session that asked for a canary that already has its `n` runs outside it; the log says so."""
    s.get("log").append({"at": now(), "text": f"canary {canary_id} already has its n: session {sid} runs outside it"})
    s.touch("log")


def session_entry(meta, sid):
    """The `meta.sessions` entry with that id; creates it (with only the id) if there is none."""
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
    except (ValueError, OverflowError):
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
        pairs["issue"] = norm_issue(pairs["issue"])
    m = s.get("meta")[0]
    known = any(e.get("id") == a.session for e in m.get("sessions", []))
    if not known and "kind" not in pairs:
        raise Erro(f"{a.session} é uma sessão nova: falta kind=<tipo>")
    entry = session_entry(m, a.session)
    for k in ("issue", "kind"):
        if k in pairs:
            entry[k] = pairs[k]
    cost = dict(entry.get("cost") or {})  # what was already written (model, effort, served) stays
    cost.update({"usd": usd, "ctx": ctx, "at": now()})
    for k in ("model", "effort", "served"):
        if pairs.get(k):
            cost[k] = pairs[k]
    entry["cost"] = cost
    s.touch("meta")
    s.commit()
    if over_tester_limit(entry):
        print(f"acima do teto do testador ({TESTER_CONTEXT_LIMIT // 1000} mil): {a.session} {ctx}")


def over_tester_limit(e):
    """Tester or retest session with the final context above the ceiling."""
    ctx = (e.get("cost") or {}).get("ctx")
    return (e.get("kind") in TESTER_KINDS and isinstance(ctx, (int, float))
            and ctx > TESTER_CONTEXT_LIMIT)


def tester_over_limit_text(q, meta):
    """`testador acima do teto:` of `show`: `<stage> <label> <ctx in thousands>k` of the stages not yet delivered (not `concluída`, `recusada` or in `meta.merged`)."""
    done = set(meta.get("merged") or []) | {r["issue"] for r in q if r["status"] in ("concluída", "recusada")}
    return "; ".join(
        f"{e.get('issue') or '—'} {e.get('label') or e['id']} {math.ceil(e['cost']['ctx'] / 1000)}k"
        for e in meta.get("sessions", []) if over_tester_limit(e) and e.get("issue") and e["issue"] not in done) or "nenhum"


def costed(meta, since=None):
    """Entries of `meta.sessions` with a cost; with `since`, only those with `created` from it on."""
    out = []
    for e in meta.get("sessions", []):
        if not e.get("cost"):
            continue
        started = e.get("created") or e["cost"].get("at")  # without `created`, the cost time applies
        if since and not (started and started >= since):
            continue
        out.append(e)
    return out


def usd_of(e):
    """US$ of the entry; 0 if the `cost` came without `usd` (the meta may be edited or published halfway)."""
    v = e["cost"].get("usd")
    return v if isinstance(v, (int, float)) else 0


def money(x):
    return f"US$ {x:.2f}"


def cost_summary(meta):
    """`custo: …` of `show`: total and number of sessions with a cost, or `—`."""
    es = costed(meta)
    if not es:
        return "—"
    return f"{money(sum(usd_of(e) for e in es))} em {len(es)} sessões"


def cmd_costs(a):
    since = check_iso(a.desde) if a.desde else None
    m = load(a.dir, "meta")
    es = costed(m[0] if m else {}, since)
    if not es:
        print("custo total: —")
        return
    print(f"custo total: {money(sum(usd_of(e) for e in es))} em {len(es)} sessões")
    by_kind, by_issue = {}, {}
    for e in es:
        by_kind.setdefault(e.get("kind") or "—", []).append(usd_of(e))
        by_issue.setdefault(e.get("issue") or "—", []).append(usd_of(e))
    print("por tipo:")
    for k in SESSION_KINDS + sorted(set(by_kind) - set(SESSION_KINDS)):
        if k in by_kind:
            v = by_kind[k]
            print(f"  {k}: {len(v)} sessões, {money(sum(v))}, mediana {money(statistics.median(v))}")
    print("por etapa:")
    for k in sorted(by_issue, key=lambda i: (not i.startswith("#"), int(i[1:]) if i[1:].isdigit() else 0, i)):
        v = by_issue[k]
        print(f"  {k}: {len(v)} sessões, {money(sum(v))}")


# --- usage and quality per role x model x effort (stage #1889, phase QM1) ---

def model_family(model):
    """`Haiku`, `Sonnet`, `Opus` or `Fable` by the id in `cost.model`; another id stays as it came; empty, `—`."""
    text = (model or "").strip()
    for family in MODEL_LADDER:
        if family.lower() in text.lower():
            return family
    return text or "—"


def usage_key(e):
    """`(role, model, effort)` of a session with a cost: the kind, the model family and the effort as written."""
    cost = e["cost"]
    return e.get("kind") or "—", model_family(cost.get("model")), cost.get("effort") or "—"


def chronology(meta):
    """`okey(e)`: the order of a session in time: `created` (without it, `cost.at`); its place in `meta.sessions` breaks ties."""
    place = {id(e): i for i, e in enumerate(meta.get("sessions") or [])}

    def okey(e):
        return e.get("created") or (e.get("cost") or {}).get("at") or "", place.get(id(e), 0)
    return okey


def signal_count(e, name):
    """A numeric signal of the session; 0 when it is missing (a session of the history has none: no data is not rework)."""
    v = (e.get("sinais") or {}).get(name)
    return v if isinstance(v, int) and not isinstance(v, bool) else 0


def serious_findings(e):
    """A tester or retest session with ❌ of high or medium severity."""
    return signal_count(e, "alta") + signal_count(e, "media") > 0


def own_rework(e):
    """The session's own signals: `ci` of 2 or more (CI red after the PR opened) or a `ciclo` (the CI cycle diagnosis)."""
    return signal_count(e, "ci") >= 2 or signal_count(e, "ciclo") >= 1


def rework_fase(e, okey, stage, escaped):
    if own_rework(e) or e.get("issue") in escaped:
        return True
    return any(x.get("kind") == "correção" or (x.get("kind") == "testador" and serious_findings(x)) for _, x in stage)


def rework_correcao(e, okey, stage, escaped):
    if own_rework(e) or e.get("issue") in escaped:
        return True
    return any(k > okey and ((x.get("kind") == "correção" and x.get("label") != e.get("label"))
                             or (x.get("kind") == "reteste" and serious_findings(x))) for k, x in stage)


def rework_testador(e, okey, stage, escaped):
    return e.get("issue") in escaped


def rework_reteste(e, okey, stage, escaped):
    """A ✅ of this retest that turned out false (`falsos`) with high or medium severity."""
    return any(sev in ("high", "medium") for sev in (e.get("sinais") or {}).get("falsos") or [])


REWORK_RULES = {"fase": rework_fase, "correção": rework_correcao, "testador": rework_testador, "reteste": rework_reteste}


def severe_escaped(meta):
    """The stages with an escaped defect of high or medium severity (the low one is not rework)."""
    return {x.get("etapa") for x in meta.get("escapados") or [] if x.get("sev") in ("high", "medium")}


class Ruler:
    """The rework ruler (decision 6), over every session of `meta.sessions`, with a cost or not: a stage counts only
    when decided (`concluída` in the queue or in `meta.merged`)."""

    def __init__(self, q, meta):
        self.okey = chronology(meta)
        self.escaped = severe_escaped(meta)
        self.decided = set(meta.get("merged") or []) | {r["issue"] for r in q if r["status"] == "concluída"}
        self.stages = {}
        for e in meta.get("sessions") or []:
            if e.get("issue"):
                self.stages.setdefault(e["issue"], []).append((self.okey(e), e))

    def verdict(self, e):
        """None: outside the ruler (role without it, stage not decided, or "sem dado": no signals and no rework seen);
        True: rework; False: clean."""
        rule = REWORK_RULES.get(e.get("kind"))
        if rule is None or e.get("issue") not in self.decided:
            return None
        rework = rule(e, self.okey(e), self.stages.get(e["issue"], []), self.escaped)
        return rework if rework or e.get("sinais") else None


def clean_streak(flags):
    """Decided sessions in a row without rework, from the most recent back; `flags` (True: rework) are in chronological order."""
    n = 0
    for bad in reversed(flags):
        if bad:
            break
        n += 1
    return n


def step_below(modelo, esforco):
    """The configuration one step below (decision 7), `(model, effort)`: an effort above `medium` goes down one step;
    with `medium` or `low` the model goes down one, with the same effort. None where there is no step."""
    if esforco in EFFORT_LADDER[1:]:
        return modelo, EFFORT_LADDER[EFFORT_LADDER.index(esforco) - 1]
    if esforco in ("medium", "low") and modelo in MODEL_LADDER and MODEL_LADDER.index(modelo) > 0:
        return MODEL_LADDER[MODEL_LADDER.index(modelo) - 1], esforco
    return None


def candidate_of(key, streak):
    """The step below of a key whose streak reached CLEAN_STREAK (a role with a ruler); None otherwise."""
    papel, modelo, esforco = key
    if papel not in RULER_KINDS or streak < CLEAN_STREAK:
        return None
    step = step_below(modelo, esforco)
    return " ".join(step) if step else None


def ruler_columns(key, es, ruler):
    """`decididas`, `comRetrabalho`, `sequencia` and `candidato` of a key; all `None` for a role without a ruler."""
    if key[0] not in RULER_KINDS:
        return {"decididas": None, "comRetrabalho": None, "sequencia": None, "candidato": None}
    judged = sorted(((ruler.okey(e), ruler.verdict(e)) for e in es), key=lambda t: t[0])
    flags = [v for _, v in judged if v is not None]
    streak = clean_streak(flags)
    return {"decididas": len(flags), "comRetrabalho": sum(flags), "sequencia": streak,
            "candidato": candidate_of(key, streak)}


def switch_successors(meta):
    """Ids of the fase/correção sessions that came after the first one of the same stage and label: the context switches."""
    okey = chronology(meta)
    groups = {}
    for e in meta.get("sessions") or []:
        if e.get("kind") in PHASE_KINDS and e.get("issue") and e.get("label"):
            groups.setdefault((e["kind"], e["issue"], e["label"]), []).append((okey(e), e["id"]))
    return {sid for g in groups.values() for _, sid in sorted(g)[1:]}


def stage_median(es, decided):
    """Median, among the decided stages, of what the key spent in each one; None with no decided stage."""
    sums = {}
    for e in es:
        if e.get("issue") in decided:
            sums[e["issue"]] = sums.get(e["issue"], 0) + usd_of(e)
    return round(statistics.median(sums.values()), 2) if sums else None


def ctx_values(es):
    return [e["cost"]["ctx"] for e in es if isinstance((e.get("cost") or {}).get("ctx"), (int, float))]


def over_ceiling(papel, es):
    """Sessions above CONTEXT_CEILING; None in a role the ceiling does not apply to."""
    if papel not in CEILING_KINDS:
        return None
    return sum(1 for c in ctx_values(es) if c > CONTEXT_CEILING)


def signal_sums(es):
    """The numeric signals of the key's sessions added up (only those that were written) and the count of `falsos`."""
    out = {}
    for name in SIGNAL_SUMS:
        vals = [signal_count(e, name) for e in es if name in (e.get("sinais") or {})]
        if vals:
            out[name] = sum(vals)
    falsos = sum(len((e.get("sinais") or {}).get("falsos") or []) for e in es)
    if falsos:
        out["falsos"] = falsos
    return out


def usage_row(key, es, total, ruler, switches):
    """The `meta.uso` entry of a key (decision 3)."""
    papel, modelo, esforco = key
    usd = sum(usd_of(e) for e in es)
    sums = signal_sums(es)
    trocas = sum(1 for e in es if e["id"] in switches)
    if trocas:
        sums["trocas"] = trocas
    ctx = ctx_values(es)
    row = {
        "papel": papel, "modelo": modelo, "esforco": esforco, "sessoes": len(es),
        "usd": round(usd, 2), "pct": round(100 * usd / total, 1) if total else 0.0,
        "medianaSessao": round(statistics.median([usd_of(e) for e in es]), 2),
        "medianaEtapa": stage_median(es, ruler.decided),
        "ctxMediano": int(round(statistics.median(ctx))) if ctx else None,
        "acimaTeto": over_ceiling(papel, es),
        "intervencoes": sums.get("dono", 0) + trocas,
        "sinais": sums,
    }
    row.update(ruler_columns(key, es, ruler))
    return row


def usage_order(row):
    kind = row["papel"]
    return (SESSION_KINDS.index(kind) if kind in SESSION_KINDS else len(SESSION_KINDS), -row["usd"],
            row["modelo"], row["esforco"])


def compute_uso(q, meta, since=None):
    """The usage per role x model x effort of the sessions with a cost (`since` keeps those created from it on): the
    `meta.uso` that every write refreshes. The rework ruler reads all the sessions of a stage, with a cost or not."""
    es = costed(meta, since)
    total = sum(usd_of(e) for e in es)
    ruler, switches = Ruler(q, meta), switch_successors(meta)
    groups = {}
    for e in es:
        groups.setdefault(usage_key(e), []).append(e)
    rows = sorted((usage_row(k, g, total, ruler, switches) for k, g in groups.items()), key=usage_order)
    busy = {c.get("papel") for c in canary_list(meta) if c.get("estado") in CANARY_BUSY}
    tried = {(c["papel"], *parse_de(c["de"]), f"{c['modelo']} {c['esforco']}")
             for c in canary_list(meta) if c.get("estado") == "revertido"}
    for u in rows:
        if u["papel"] in busy or (u["papel"], u["modelo"], u["esforco"], u["candidato"]) in tried:
            u["candidato"] = None  # a role under a canary is already being tried; a reverted step is not offered again
    return rows


def dash(v):
    return "—" if v is None else str(v)


def usage_line(u):
    """One line of `uso` for a key."""
    ctx = "—" if u["ctxMediano"] is None else f"{round(u['ctxMediano'] / 1000)}k"
    stage = "—" if u["medianaEtapa"] is None else money(u["medianaEtapa"])
    rework = "—" if u["decididas"] is None else f"{u['comRetrabalho']} de {u['decididas']}"
    return (f"{u['papel']} {u['modelo']} {u['esforco']}: {u['sessoes']} sessões, {money(u['usd'])} ({u['pct']}%), "
            f"mediana {money(u['medianaSessao'])}, por etapa {stage}, contexto {ctx}, acima do teto {dash(u['acimaTeto'])}, "
            f"intervenções {u['intervencoes']}, retrabalho {rework}, sequência {dash(u['sequencia'])}, "
            f"candidato {dash(u['candidato'])}")


def cmd_uso(a):
    since = check_iso(a.desde) if a.desde else None
    q, m = load(a.dir, "queue"), load(a.dir, "meta")
    rows = compute_uso(q, m[0] if m else {}, since)
    if not rows:
        print("uso: —")
        return
    for u in rows:
        print(usage_line(u))
        if u["sinais"]:
            print("  sinais: " + ", ".join(f"{k} {v}" for k, v in u["sinais"].items()))


def find_session(meta, sid):
    for e in meta.get("sessions") or []:
        if e.get("id") == sid:
            return e
    raise Erro(f"{sid} is not in meta.sessions")


def signal_number(k, v):
    """`('add', n)` from `+n`, `('set', n)` from `n`; a negative number, a decimal or text is a usage error."""
    if re.fullmatch(r"\+?[0-9]+", v):
        return ("add" if v.startswith("+") else "set"), int(v)
    if re.fullmatch(r"-[0-9]+", v):
        raise Erro(f"{k} cannot be negative, got '{v}'")
    raise Erro(f"{k} must be an integer (or +<n> to add), got '{v}'")


def signal_change(k, v):
    """`(field, op, value)` of one `campo=valor` of a `sinal`."""
    if k == "sub":
        return k, "set", v
    if k == "falso":
        validate_choice("falso", v, SEVERITIES)
        return k, "falso", v
    op, n = signal_number(k, v)
    return k, op, n


def signal_changes(kind, pairs):
    """Every change of a `sinal`, validated before anything is written: the fields have to be those of the session's role."""
    allowed = SIGNAL_FIELDS.get(kind)
    if allowed is None:
        raise Erro(f"a {kind or '—'} session has no signals (only {', '.join(SIGNAL_FIELDS)})")
    known = set(PHASE_SIGNALS) | set(TESTER_SIGNALS)
    for k in pairs:
        if k not in known:
            raise Erro(f"unknown field '{k}'; valid in {kind}: " + ", ".join(allowed))
        if k not in allowed:
            raise Erro(f"field '{k}' does not apply to {kind}; valid: " + ", ".join(allowed))
    return [signal_change(k, v) for k, v in pairs.items()]


def write_signal(sinais, change):
    k, op, v = change
    if k == "falso":
        sinais.setdefault("falsos", []).append(v)
    elif op == "add":
        sinais[k] = signal_count({"sinais": sinais}, k) + v
    else:
        sinais[k] = v


def cmd_sinal(a):
    s = open_session(a.dir)
    entry = find_session(s.get("meta")[0], a.session)
    changes = signal_changes(entry.get("kind"), parse_pairs(a.pairs))
    sinais = entry.setdefault("sinais", {})
    for change in changes:
        write_signal(sinais, change)
    s.touch("meta")
    s.commit()


def escaped_record(a):
    """The `meta.escapados` entry of an `escapado`: `bug`, `etapa` and `sev` checked."""
    if not a.bug:
        raise Erro("missing the bug: escapado <folder> '#<bug>' etapa='#<n>' sev=<high|medium|low>")
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in ("etapa", "sev"):
            raise Erro(f"unknown field '{k}'; valid: etapa, sev")
    for k in ("etapa", "sev"):
        if k not in pairs:
            raise Erro(f"falta {k}=")
    validate_choice("sev", pairs["sev"], SEVERITIES)
    return {"bug": norm_issue(a.bug), "etapa": norm_issue(pairs["etapa"]), "sev": pairs["sev"], "at": now()}


def cmd_escapado(a):
    if a.conferido and (a.bug or a.pairs):
        raise Erro("--conferido takes no bug or fields")
    record = None if a.conferido else escaped_record(a)
    s = open_session(a.dir)
    m = s.get("meta")[0]
    if record is None:
        m["escapadosAt"] = now()
    else:
        listed = m.setdefault("escapados", [])
        for i, x in enumerate(listed):
            if x.get("bug") == record["bug"]:
                listed[i] = record
                break
        else:
            listed.append(record)
    s.touch("meta")
    s.commit()


def cmd_historico(a):
    if a.feito is None:
        raise Erro("historico needs --feito desde=<ISO> ate=<ISO> [linhas=<k>]")
    pairs = parse_pairs(a.feito + a.pairs)
    for k in pairs:
        if k not in ("desde", "ate", "linhas"):
            raise Erro(f"unknown field '{k}'; valid: desde, ate, linhas")
    for k in ("desde", "ate"):
        if k not in pairs:
            raise Erro(f"falta {k}=")
    lines = to_int("linhas", pairs.get("linhas", "0"))
    if lines < 0:
        raise Erro(f"linhas cannot be negative, got '{pairs['linhas']}'")
    since, until = check_iso(pairs["desde"]), check_iso(pairs["ate"])
    if since > until:
        raise Erro(f"desde ({since}) is after ate ({until})")
    s = open_session(a.dir)
    s.get("meta")[0]["historico"] = {"desde": since, "ate": until, "linhas": lines}
    s.touch("meta")
    s.commit()


def escaped_text(meta):
    """`escapados:` of `show`: the count, each `#bug→#etapa sev` and how long ago they were checked (`— conferir` after
    ESCAPE_CHECK_HOURS or never)."""
    listed = meta.get("escapados") or []
    head = str(len(listed))
    if listed:
        head += " (" + "; ".join(f"{x['bug']}→{x['etapa']} {x['sev']}" for x in listed) + ")"
    at = meta.get("escapadosAt")
    if not at:
        return f"{head} · conferidos: nunca — conferir"
    mins = minutes_since(at)
    late = " — conferir" if mins > ESCAPE_CHECK_HOURS * 60 else ""
    return f"{head} · conferidos há {mins // 60} h{late}"


def history_text(meta):
    """`histórico:` of `show`: `a recuperar` until `historico --feito`."""
    h = meta.get("historico")
    if not h:
        return "a recuperar"
    return f"recuperado ({h.get('desde')} a {h.get('ate')}; {h.get('linhas', 0)} linhas sem sessão)"


def candidates_text(rows):
    """`candidatos a teste:` of `show`: the keys with a candidate, or `nenhum`."""
    return "; ".join(f"{u['papel']} {u['modelo']} {u['esforco']} → {u['candidato']} ({u['sequencia']} seguidas)"
                     for u in rows if u.get("candidato")) or "nenhum"


# --- canaries (stage #1889, phase QM3, decisions 12 to 15; B for the phase and C for the tester since #2165, A is history) ---

def canary_list(meta):
    return meta.get("canarios") or []


def find_canary(meta, cid):
    for c in canary_list(meta):
        if c.get("id") == cid:
            return c
    return None


def parse_de(text):
    """`(model family, effort)` of a `de="<model> <effort>"`; code 2 for anything else."""
    words = (text or "").split()
    if len(words) != 2 or model_family(words[0]) not in MODEL_LADDER or words[1] not in EFFORTS:
        raise Erro(f"invalid de '{text}' (use de=\"<model> <effort>\", like \"Sonnet medium\")")
    return model_family(words[0]), words[1]


def positive_int(k, pairs):
    n = to_int(k, pairs[k])
    if n < 1:
        raise Erro(f"{k} must be positive, got '{pairs[k]}'")
    return n


def canary_config(pairs):
    """The fields of a new canary (all but the id and the run state), validated: code 2 for a missing or invalid one."""
    for k in pairs:
        if k not in CANARY_KEYS:
            raise Erro(f"unknown field '{k}'; valid: " + ", ".join(CANARY_KEYS))
    for k in ("papel", "de", "n", "volta"):
        if k not in pairs:
            raise Erro(f"falta {k}=")
    validate_choice("papel", pairs["papel"], RULER_KINDS)
    if "filtro" in pairs:
        validate_choice("filtro", pairs["filtro"], CANARY_FILTERS)
    if "modelo" not in pairs and "esforco" not in pairs:
        raise Erro("falta modelo= or esforco=: a canary changes at least one of them")
    de_model, de_effort = parse_de(pairs["de"])
    modelo = model_family(pairs["modelo"]) if "modelo" in pairs else de_model
    validate_choice("modelo", modelo, MODEL_LADDER)
    esforco = pairs.get("esforco", de_effort)
    validate_choice("esforco", esforco, EFFORTS)
    if (modelo, esforco) == (de_model, de_effort):
        raise Erro("the canary changes nothing: the model and the effort are those of de=")
    return {"papel": pairs["papel"], "de": f"{de_model} {de_effort}", "modelo": modelo, "esforco": esforco,
            "filtro": pairs.get("filtro"), "n": positive_int("n", pairs), "volta": positive_int("volta", pairs)}


def canary_add(a):
    if not a.args or "=" in a.args[0]:
        raise Erro("canario add <id> papel= de=\"<model> <effort>\" [modelo=] [esforco=] [filtro=processo] n= volta=")
    cid = a.args[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", cid):
        raise Erro(f"invalid canary id '{cid}' (letters, digits, - and _)")
    config = canary_config(parse_pairs(a.args[1:]))
    s = open_session(a.dir)
    meta = s.get("meta")[0]
    if find_canary(meta, cid):
        raise Erro(f"canary {cid} already exists")
    canary = {"id": cid, **config, "inicio": now(), "sessoes": [], "estado": "ativo", "motivo": "", "fim": None}
    meta.setdefault("canarios", []).append(canary)
    s.touch("meta")
    s.commit()


def canary_end(a):
    if not a.args or "=" in a.args[0]:
        raise Erro("canario end <id> [motivo=\"…\"]")
    pairs = parse_pairs(a.args[1:])
    for k in pairs:
        if k != "motivo":
            raise Erro(f"unknown field '{k}'; valid: motivo")
    s = open_session(a.dir)
    meta = s.get("meta")[0]
    c = find_canary(meta, a.args[0])
    if c is None:
        raise Erro(f"canary {a.args[0]} does not exist")
    if c["estado"] in CANARY_FINAL:
        raise Erro(f"canary {c['id']} is already {c['estado']}")
    c.update({"estado": "terminado pelo dono", "motivo": pairs.get("motivo", ""), "fim": now()})
    s.touch("meta")
    s.commit()


def old_panel_side(c, old_dir):
    """`(sessions, side)` of the canary's role over an old panel, read-only: the sessions with a cost of the role, `de` and
    filter created before `inicio`, summarized with the old panel's own ruler (its decided stages)."""
    try:
        old_q, old_m = load(old_dir, "queue"), load(old_dir, "meta")
        meta = old_m[0] if old_m else {}
        ruler = Ruler(old_q, meta)
        es = canary_before(c, meta, old_q, ruler)
        return es, side_summary(es, ruler, c["papel"])
    except (ValueError, KeyError, TypeError, AttributeError, IndexError) as e:  # a corrupt or partial download is not "0 sessions"
        raise Erro(f"{old_dir} is not a readable panel ({type(e).__name__}: {e})")


def base_arguments(a):
    """`(id, old folder, fonte)` of `canario base` (the folder and the `fonte` are None with `--nenhuma`); code 2 for a
    bad shape or field."""
    usage = "canario base <id> <old folder> [fonte=<text>] | canario base <id> --nenhuma"
    words = a.args
    if not words or "=" in words[0]:
        raise Erro(usage)
    if a.nenhuma:
        if len(words) > 1:
            raise Erro(usage)
        return words[0], None, None
    if len(words) < 2 or "=" in words[1]:
        raise Erro(usage)
    pairs = parse_pairs(words[2:])
    for k in pairs:
        if k != "fonte":
            raise Erro(f"unknown field '{k}'; valid: fonte")
    return words[0], words[1], pairs.get("fonte", "painel anterior")


def canary_base(a):
    """`canario DIR base <id> <old folder> [fonte=<text>]` freezes the baseline from an old panel; `--nenhuma` declares there is none."""
    if BATCH is not None:
        raise Erro("`canario base` reads another folder: it stays out of the batch (`apply`)")
    cid, old_dir, fonte = base_arguments(a)
    s = open_session(a.dir)
    c = find_canary(s.get("meta")[0], cid)
    if c is None:
        raise Erro(f"canary {cid} does not exist")
    if old_dir is None:
        c["base"] = {"fonte": NO_SOURCE, "sessoes": 0}
    else:
        es, side = old_panel_side(c, old_dir)
        print(f"base: {len(es)} sessões")
        if not es:
            return NO_SESSIONS_CODE
        c["base"] = {**side, "fonte": fonte, "at": now()}
    s.touch("meta")
    s.commit()


# --- cost outliers per planned phase (stage #1937, phase CC2) ---


def outlier_base(q, meta, since):
    """The `concluída` rows with a valid `fases=` and a `toca=` other than `?` (and `started` from `since` on), and the
    count of the stages that stay out for lack of a ficha (rows without one, and those only in `meta.merged`)."""
    rows = [r for r in q if r.get("status") == "concluída" and not (since and (r.get("started") or "") < since)]
    base = [r for r in rows if plan_phase_codes(r.get("plan") or "") and has_toca(r.get("plan") or "")]
    queued = {r.get("issue") for r in q}
    merged_only = {i for i in meta.get("merged") or [] if i not in queued}
    if since:  # a merged-only stage has no row: it counts only with a session created from `since` on
        recent = {e.get("issue") for e in meta.get("sessions") or [] if (e.get("created") or "") >= since}
        merged_only &= recent
    return base, len(rows) - len(base) + len(merged_only)


def stage_kind_costs(meta, issues):
    """US$ per stage and session kind, over the sessions with a cost."""
    out = {i: {} for i in issues}
    for e in costed(meta):
        kinds = out.get(e.get("issue"))
        if kinds is not None:
            kinds[e.get("kind")] = kinds.get(e.get("kind"), 0) + usd_of(e)
    return out


def outlier_cause(kinds, group_kinds):
    """The session kind with the largest positive difference against the group's median in that kind (a missing kind
    is 0; a tie goes by the order of `SESSION_KINDS`): `(kind, usd, group median)`, or None with no positive difference."""
    best = None
    for k in SESSION_KINDS:
        median = statistics.median([g.get(k, 0) for g in group_kinds])
        diff = kinds.get(k, 0) - median
        if diff > 0 and (best is None or diff > best[0]):
            best = (diff, k, kinds.get(k, 0), median)
    return best and best[1:]


def outlier_counts(meta, issue):
    """Switches, sessions above the ceiling, testers, retests and fixes of a stage."""
    es = [e for e in meta.get("sessions") or [] if e.get("issue") == issue]
    switches = switch_successors(meta)
    over = sum(1 for e in es if e.get("kind") in CEILING_KINDS for c in ctx_values([e]) if c > CONTEXT_CEILING)
    kinds = [e.get("kind") for e in es]
    return (sum(1 for e in es if e["id"] in switches), over,
            kinds.count("testador"), kinds.count("reteste"), kinds.count("correção"))


def outlier_line(row, total, phases, cause, counts):
    switches, over, testers, retests, fixes = counts
    kind, usd, median = cause or ("—", 0, 0)
    return (f"  {row['issue']} {money(total)} ({phases} phases, {money(total / phases)} per phase) — "
            f"cause: {kind} {money(usd)} (group median {money(median)}); switches {switches}; above 300k {over}; "
            f"testers {testers}; retests {retests}; fixes {fixes}")


def outlier_group(name, rows, meta, costs):
    """The lines of one group: its header and the stages above the ceiling, or `base too small`."""
    if len(rows) < OUTLIER_MIN_BASE:
        return [f"{name}: base too small ({len(rows)} stages)"]
    per_phase = {}
    for r in rows:
        per_phase[r["issue"]] = sum(costs[r["issue"]].values()) / len(plan_phase_codes(r["plan"]))
    median = statistics.median(per_phase.values())
    ceiling = OUTLIER_FACTOR * median
    lines = [f"{name}: {len(rows)} stages, median {money(median)} per phase, ceiling {money(ceiling)}"]
    group_kinds = [costs[r["issue"]] for r in rows]
    over = [r for r in rows if per_phase[r["issue"]] > ceiling]
    for r in sorted(over, key=lambda r: -per_phase[r["issue"]]):
        i, phases = r["issue"], len(plan_phase_codes(r["plan"]))
        lines.append(outlier_line(r, sum(costs[i].values()), phases, outlier_cause(costs[i], group_kinds),
                                  outlier_counts(meta, i)))
    return lines + ([] if over else ["  none above the ceiling"])


def cmd_outliers(a):
    since = check_iso(a.desde) if a.desde else None
    q, m = load(a.dir, "queue"), load(a.dir, "meta")
    meta = m[0] if m else {}
    base, without = outlier_base(q, meta, since)
    costs = stage_kind_costs(meta, [r["issue"] for r in base])
    print(f"outliers (since {since or 'all'}): {len(base)} stages in the base, without ficha: {without}")
    for name, rows in (("product", [r for r in base if not is_process_stage(r)]),
                       ("process", [r for r in base if is_process_stage(r)])):
        print("\n".join(outlier_group(name, rows, meta, costs)))


def process_cite(cite):
    """A citation of the `toca=` that belongs to a process stage: `#section` is not part of the path."""
    base = cite.split("#", 1)[0]
    return base.startswith(PROCESS_PREFIXES) or base in PROCESS_FILES


def is_process_stage(row):
    """Decision 14: the ficha says `testador=nenhum` and every citation of the `toca=` is process; no ficha or `?`, no."""
    if row is None:
        return False
    plan = row.get("plan") or ""
    if (plan_field(plan, "testador") or "").strip().lower() != "nenhum":
        return False
    cites = toca_list(plan)
    return has_toca(plan) and all(process_cite(c) for c in cites)


def canary_members(c, meta):
    ids = set(c.get("sessoes") or [])
    return [e for e in meta.get("sessions") or [] if e.get("id") in ids]


def canary_units(c, meta):
    """What `n` counts: sessions, or in a role with context switches (`fase`, `correção`) the distinct phases (stage + label)."""
    es = canary_members(c, meta)
    if c.get("papel") in PHASE_KINDS:
        return len({(e.get("issue"), e.get("label")) for e in es})
    return len(es)


def canary_offers(c, meta, q, papel, issue, want):
    """`usar`: this canary is active, of the role, with `want` as its `de`, still short of `n` and, with a filter, the stage passes."""
    if c.get("estado") != "ativo" or c.get("papel") != papel or parse_de(c["de"]) != want:
        return False
    if (find_row(q, issue) or {}).get("kind") == "via-rapida":
        return False  # the fast track always runs at `high` and never joins canary B (decision 7 of #1791)
    if canary_units(c, meta) >= c["n"]:
        return False
    return c.get("filtro") != "processo" or is_process_stage(find_row(q, issue))


def canary_use(a):
    if BATCH is not None:
        raise Erro("`canario usar` only reads: it stays out of the batch (`apply`)")
    if len(a.args) < 2:
        raise Erro("canario usar <papel> '#n' modelo=<model> esforco=<effort>")
    papel, issue = a.args[0], norm_issue(a.args[1])
    pairs = parse_pairs(a.args[2:])
    for k in ("modelo", "esforco"):
        if k not in pairs:
            raise Erro(f"falta {k}=")
    for k in pairs:
        if k not in ("modelo", "esforco"):
            raise Erro(f"unknown field '{k}'; valid: modelo, esforco")
    want = (model_family(pairs["modelo"]), pairs["esforco"])
    validate_choice("papel", papel, RULER_KINDS)
    validate_choice("modelo", want[0], MODEL_LADDER)
    validate_choice("esforco", want[1], EFFORTS)
    q, m = load(a.dir, "queue"), load(a.dir, "meta")
    meta = m[0] if m else {}
    for c in canary_list(meta):
        if canary_offers(c, meta, q, papel, issue, want):
            print(f"canario={c['id']} modelo={c['modelo']} esforco={c['esforco']}")
            return
    print("atual")


CANARY_ACTIONS = {"add": canary_add, "end": canary_end, "base": canary_base, "usar": canary_use}


def cmd_canario(a):
    fn = CANARY_ACTIONS.get(a.action)
    if fn is None:
        raise Erro(f"unknown action '{a.action}'; valid: " + ", ".join(CANARY_ACTIONS))
    return fn(a)


def canary_to_join(meta, pairs, sid, issue):
    """The canary a `session ... canario=<id>` joins, checked before anything is written. It has to exist, be of the
    role of the session and be `ativo`; a phase of the canary also takes its successor by context (same stage and
    label) while the canary is under evaluation, and the same id again changes nothing."""
    c = find_canary(meta, pairs["canario"])
    if c is None:
        raise Erro(f"canary {pairs['canario']} does not exist")
    known = next((e for e in meta.get("sessions") or [] if e.get("id") == sid), None) or {}
    kind = pairs.get("kind") or known.get("kind")
    if not kind:
        raise Erro("canario= needs kind= (or a session already registered with its kind)")
    if c["papel"] != kind:
        raise Erro(f"canary {c['id']} is for {c['papel']}, the session is {kind}")
    label = (pairs["label"] if "label" in pairs else known.get("label")) or ""
    if known.get("canario") not in (None, c["id"]):
        raise Erro(f"session {sid} is already in canary {known['canario']}, not {c['id']}")
    return c if canary_slot(c, meta, sid, kind, issue, label) else None


def canary_slot(c, meta, sid, kind, issue, label):
    """True when the session enters the canary, False when it already has `n` (it runs outside it); an ended or
    reverted canary refuses. The count reads the sessions, not the state, which only refreshes at the flush."""
    state = c["estado"]
    if sid in c["sessoes"] and state not in CANARY_FINAL:
        return True
    successor = kind in PHASE_KINDS and any(
        e.get("issue") == issue and (e.get("label") or "") == label for e in canary_members(c, meta))
    if state in CANARY_BUSY and successor:
        return True
    if state == "ativo":
        return canary_units(c, meta) < c["n"]
    if state in CANARY_FULL:
        return False
    raise Erro(f"canary {c['id']} is {state}, not ativo")


def canary_rework(c, members, meta, ruler):
    """The ids of the canary's sessions that count as rework, one entry per occurrence (decisions 12 and 14)."""
    if c["papel"] == "reteste":
        return [e["id"] for e in members for sev in (e.get("sinais") or {}).get("falsos") or []
                if sev in ("high", "medium")]
    if c["papel"] == "fase":
        return phase_canary_rework(members, meta)
    return [e["id"] for e in members if ruler.verdict(e) is True]


def phase_canary_rework(members, meta):
    """A `correção` in the stage of a session of the canary counts once per stage; each `ciclo` of a session of the canary counts."""
    stages = {e.get("issue") for e in members}
    okey = chronology(meta)
    fixes = sorted((okey(e), e["id"], e.get("issue")) for e in meta.get("sessions") or []
                   if e.get("kind") == "correção" and e.get("issue") in stages)
    out, seen = [], set()
    for _, sid, issue in fixes:
        if issue not in seen:
            seen.add(issue)
            out.append(sid)
    for e in members:
        out += [e["id"]] * signal_count(e, "ciclo")
    return out


def canary_state(c, members, units, ruler):
    if len(c["retrabalhos"]) >= c["volta"]:
        return "revertido"
    if units < c["n"]:
        return "ativo"
    return "encerrado" if all(e.get("issue") in ruler.decided for e in members) else "em avaliação"


def pct(part, whole):
    """100 x part / whole with one decimal; None with a 0 denominator."""
    return round(100 * part / whole, 1) if whole else None


def step_figures(es):
    """`passos` (ok + falha) over the sessions that have either one written, and their US$ per step (3 decimals; None with no step)."""
    steps = [e for e in es if "ok" in (e.get("sinais") or {}) or "falha" in (e.get("sinais") or {})]
    total = sum(signal_count(e, "ok") + signal_count(e, "falha") for e in steps)
    return {"passos": total, "usdPorPasso": round(sum(usd_of(e) for e in steps) / total, 3) if total else None}


def noise_figures(es):
    """`xFalso`, `naoExec` and their rates over the sessions that have `naoExec` written (decision 8 of #2260): the false
    ❌ per ❌ and the steps not executed per step; all None without such a session, a rate None with a 0 denominator."""
    seen = [e for e in es if "naoExec" in (e.get("sinais") or {})]
    if not seen:
        return {"xFalso": None, "naoExec": None, "xFalsoPct": None, "naoExecPct": None}
    wrong, skipped = (sum(signal_count(e, n) for e in seen) for n in ("xFalso", "naoExec"))
    failed, passed = (sum(signal_count(e, n) for e in seen) for n in ("falha", "ok"))
    return {"xFalso": wrong, "naoExec": skipped, "xFalsoPct": pct(wrong, failed),
            "naoExecPct": pct(skipped, passed + failed + skipped)}


NO_FIGURES = {"passos": None, "usdPorPasso": None, "xFalso": None, "naoExec": None, "xFalsoPct": None, "naoExecPct": None}


def side_summary(es, ruler, papel):
    """One side of the comparison, over sessions with a cost: sessions, median US$ per session and per merged stage, the
    stages decided with their rework by the ruler of decision 6 and, for the tester roles, the cost per tested step and
    the false ❌ and not executed figures (decisions 6 and 8 of #2260); the other roles have them None."""
    flags = [v for v in (ruler.verdict(e) for e in es) if v is not None]
    usd = [usd_of(e) for e in es]
    out = {"sessoes": len(es), "medianaSessao": round(statistics.median(usd), 2) if usd else None,
           "medianaEtapa": stage_median(es, ruler.decided), "decididas": len(flags), "comRetrabalho": sum(flags)}
    out.update({**step_figures(es), **noise_figures(es)} if papel in STEP_KINDS else NO_FIGURES)
    return out


def canary_before(c, meta, q, ruler):
    """The panel's own "before": sessions with a cost of the same role and the `de` configuration (and the same filter)
    created before `inicio`, leaving out the members of any canary (a test, and all the `import` carries with a cost)."""
    model, effort = parse_de(c["de"])
    members = {sid for k in meta.get("canarios") or [] for sid in k.get("sessoes") or []}
    out = []
    for e in costed(meta):
        if e.get("id") in members or usage_key(e) != (c["papel"], model, effort) or ruler.okey(e)[0] >= c["inicio"]:
            continue
        if c.get("filtro") == "processo" and not is_process_stage(find_row(q, e.get("issue"))):
            continue
        out.append(e)
    return out


def canary_antes(c, meta, q, ruler):
    """The effective "before" (decision 1 of #2260): the panel's own sessions (`fonte: painel`) when it has any; otherwise
    the canary's frozen `base` (its `fonte`); with neither, the empty side (`fonte: nenhuma`)."""
    own = canary_before(c, meta, q, ruler)
    if own:
        return {**side_summary(own, ruler, c["papel"]), "fonte": "painel"}
    empty = side_summary([], ruler, c["papel"])
    base = c.get("base")
    if base:
        return {**empty, **{k: v for k, v in base.items() if k != "at"}}
    return {**empty, "fonte": NO_SOURCE}


def canary_measure(c, antes, canario):
    """`(medida, field)` of the comparison: the cost per tested step when the role has steps and both sides have it,
    otherwise the median per session (decision 6 of #2260)."""
    if c.get("papel") in STEP_KINDS and antes.get("usdPorPasso") is not None and canario.get("usdPorPasso") is not None:
        return "passo", "usdPorPasso"
    return "sessão", "medianaSessao"


def canary_verdict(c, antes, canario):
    """In this order: `revertido` when it came back; `sem base` when the effective "before" lacks the measure; `pode
    promover` with the canary `encerrado`, at most PROMOTE_MAX_REWORK rework and a lower measure than before;
    `não promover` otherwise (a canary side without the measure included)."""
    if c["estado"] == "revertido":
        return "revertido"
    _, field = canary_measure(c, antes, canario)
    before, now_ = antes.get(field), canario.get(field)
    if before is None:
        return "sem base"
    cheaper = now_ is not None and now_ < before
    ok = c["estado"] == "encerrado" and len(c["retrabalhos"]) <= PROMOTE_MAX_REWORK and cheaper
    return "pode promover" if ok else "não promover"


def canary_summary(c, meta, q, ruler):
    antes = canary_antes(c, meta, q, ruler)
    canario = side_summary([e for e in canary_members(c, meta) if e.get("cost")], ruler, c["papel"])
    return {"antes": antes, "canario": canario, "medida": canary_measure(c, antes, canario)[0],
            "veredito": canary_verdict(c, antes, canario)}


def revert_text(c):
    ids = ", ".join(dict.fromkeys(c["retrabalhos"]))
    return f"{len(c['retrabalhos'])} retrabalhos ({ids})"


def refresh_canary(c, meta, q, ruler, log):
    """Recomputes the counts, the rework, the state and the summary of a canary; True when a log line was written."""
    members, units = canary_members(c, meta), canary_units(c, meta)
    c["contadas"] = units
    c["retrabalhos"] = canary_rework(c, members, meta, ruler)
    wrote = False
    if c["estado"] not in CANARY_FINAL:
        state = canary_state(c, members, units, ruler)
        if state != c["estado"]:
            c["estado"] = state
            c["fim"] = now() if state in ("encerrado", "revertido") else None
        if state == "revertido":
            c["motivo"] = revert_text(c)
            log.append({"at": now(), "text": f"canário {c['id']} revertido: {c['motivo']}"})
            wrote = True
    c["resumo"] = canary_summary(c, meta, q, ruler)
    return wrote


def update_canaries(q, meta, log):
    """Every write refreshes `meta.canarios` (the page draws it); True when a canary just reverted and the log grew."""
    if not canary_list(meta):
        return False
    ruler = Ruler(q, meta)
    wrote = False
    for c in canary_list(meta):
        wrote = refresh_canary(c, meta, q, ruler, log) or wrote
    return wrote


def canary_entry(c):
    """One entry of `canários:`; a `sem base` canary whose base was not declared `nenhuma` asks for `canario base`."""
    verdict = (c.get("resumo") or {}).get("veredito") or "—"
    asks = verdict == "sem base" and c.get("estado") in CANARY_BUSY and (c.get("base") or {}).get("fonte") != NO_SOURCE
    hint = " — rodar canario base" if asks else ""
    return (f"{c['id']} {c['papel']} {c['de']} → {c['modelo']} {c['esforco']} {c.get('contadas', 0)}/{c['n']} "
            f"(retrabalhos {len(c.get('retrabalhos') or [])}/{c['volta']}, {c['estado']}; {verdict}{hint})")


def canary_text(meta):
    """`canários:` of `show`: one entry per canary with the count, the rework, the state and the verdict, or `nenhum`."""
    return "; ".join(canary_entry(c) for c in canary_list(meta)) or "nenhum"


def cmd_merged(a):
    s = open_session(a.dir)
    n = norm_issue(a.issue)
    m = s.get("meta")[0]
    merged = m.setdefault("merged", [])
    if n not in merged:
        merged.append(n)
    s.touch("meta")
    s.commit()
    if BATCH is None:
        print_starting(s)


def parse_key_values(text):
    """The `key=value` lines of an output."""
    values = {}
    for ln in text.splitlines():
        k, sep, v = ln.partition("=")
        if sep and k:
            values[k] = v
    return values


def measure_context(max_tokens):
    """Runs `scripts/ci/contextUsage.mjs --max <n>` and returns the keys of the output (`pct`, `contexto`, `fonte`);
    fails with `Erro`, writing nothing, with no measure or with the script broken (decision 2 of #1874)."""
    root = repo_root()
    script = os.path.join(root, "scripts", "ci", "contextUsage.mjs") if root else None
    if not script or not os.path.isfile(script):
        raise Erro(f"não achei scripts/ci/contextUsage.mjs (procurei em {script or 'nenhuma raiz de repositório'})")
    try:
        out = subprocess.run(["node", script, "--max", str(max_tokens)], capture_output=True, text=True,
                             timeout=CONTEXT_MEASURE_TIMEOUT)
    except (OSError, subprocess.SubprocessError) as e:
        raise Erro(f"não consegui rodar {script}: {e}")
    values = parse_key_values(out.stdout)
    if out.returncode == 1:
        raise Erro(f"sem medida ({values.get('motivo', 'sem motivo')}): "
                   "grave o used_tokens do get_session com context <pasta> <pct> --fonte get_session")
    if out.returncode != 0 or not re.fullmatch("[0-9]+", values.get("pct", "")):
        raise Erro(f"a medida falhou (código {out.returncode}): {(out.stderr or out.stdout).strip()}")
    return values


def context_request(a):
    """What `context` writes: `(pct, fonte, medida)`, with the measure only on `--medir` (decisions 1 to 3 of #1874)."""
    if a.medir == (a.pct is not None):
        raise Erro("use context <pasta> <pct> [--fonte get_session] ou context <pasta> --medir --max <n>")
    if not a.medir:
        if a.max is not None:
            raise Erro("--max só vale com --medir")
        if a.fonte not in (None, "get_session"):
            raise Erro(f"--fonte só aceita get_session, veio '{a.fonte}'")
        return check_pct(a.pct), a.fonte or "manual", None
    if a.fonte is not None:
        raise Erro("--fonte não vale com --medir (a fonte vem do script)")
    if a.max is None:
        raise Erro("--medir precisa de --max <max_tokens> (o do get_session sem session_id)")
    if not re.fullmatch("[0-9]+", a.max) or int(a.max) < 1:
        raise Erro(f"--max precisa ser um inteiro positivo, veio '{a.max}'")
    values = measure_context(int(a.max))
    return min(int(values["pct"]), 100), values.get("fonte", "sessao"), values


def check_pct(raw):
    try:
        pct = int(raw)
    except ValueError:
        raise Erro(f"pct precisa ser inteiro de 0 a 100, veio '{raw}'")
    if not 0 <= pct <= 100:
        raise Erro(f"pct precisa ser inteiro de 0 a 100, veio '{raw}'")
    return pct


def cmd_context(a):
    s = open_session(a.dir)
    pct, fonte, measured = context_request(a)
    m = s.get("meta")[0]
    m["context"] = pct
    m["contextAt"] = now()
    m["contextFonte"] = fonte
    s.touch("meta")
    if measured:
        print(f"medido: pct={pct} contexto={measured.get('contexto', '?')} fonte={fonte}")
    s.commit(quiet=True)  # the context alone does not make the hourly check publish


def print_no_change():
    if BATCH is None:  # inside `apply`, the end of the batch prints `alterados:`
        print("alterados: nenhum")


def cmd_role(a):
    if a.role not in ROLES:
        raise Erro(f"papel inválido '{a.role}'; válidos: {', '.join(ROLES)}")
    if not a.session.strip():
        raise Erro("o id da sessão não pode ser vazio")
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k != "link":
            raise Erro(f"campo desconhecido '{k}'; válido: link")
    s = open_session(a.dir)
    m = s.get("meta")[0]
    roles = m.setdefault("roles", {})
    prev = roles.get(a.role) or {}
    n = prev.get("n")
    if prev.get("id") == a.session:  # the id already registered: nothing changes (#1628), not even `n`, `previous`, `at` or `link`
        print(f"{a.role} {n if isinstance(n, int) else '?'}: {a.session} já é o registrado; nada mudou")
        print_no_change()
        return
    roles[a.role] = {
        "id": a.session,
        "n": (n if isinstance(n, int) else 0) + 1,
        "at": now(),
        "link": pairs.get("link", ""),
        "previous": prev.get("id", ""),
    }
    s.touch("meta")
    s.commit()


def session_verdict(meta, sid):
    """The role of this session for `roles --sessao` (decisions 3 and 4 of #1643); the first that matches wins."""
    roles = meta.get("roles") or {}
    sup = roles.get("supervisor") or {}
    coord = roles.get("coordenador") or {}
    kinds = {e.get("kind") for e in meta.get("sessions") or [] if e.get("id") == sid}
    if sup.get("id") == sid:
        return "registrada"
    if sid in (coord.get("id"), coord.get("previous")) or "coordenador" in kinds:
        return "coordenador (não supervisiona)"
    if not sup.get("id"):
        return "nova (nenhum supervisor registrado)"
    if sid == sup.get("previous") or "supervisor" in kinds:
        return f"antiga (atual: {sup['id']})"
    return f"sucessora (antecessor: {sup['id']})"


def cmd_roles(a):
    if a.sessao is not None and not a.sessao.strip():
        raise Erro("o id da sessão não pode ser vazio")
    meta = (load(a.dir, "meta") or [{}])[0]
    roles = meta.get("roles") or {}
    for name in ROLES:
        r = roles.get(name)
        if not r:
            print(f"{name} —")
            continue
        link = f" ({r['link']})" if r.get("link") else ""
        print(f"{name} {r.get('n', 0)}: {r.get('id', '')}{link}")
    if a.sessao is not None:
        print(f"esta sessão: {session_verdict(meta, a.sessao.strip())}")


def check_request_id(v):
    if not re.fullmatch(r"SUP-[1-9][0-9]*", v):
        raise Erro(f"pedido '{v}' inválido (use SUP-<n>, como SUP-3)")
    return v


def close_questions(s, issue, verbo, reason):
    """Closes the open owner questions of `issue` (all of them, or only `verbo`), one `log` line each; returns whether any closed."""
    meta = s.get("meta")[0]
    keep, closed = [], []
    for p in meta.get("perguntas") or []:
        hit = p["issue"] == issue and verbo in (None, p["verbo"])
        (closed if hit else keep).append(p)
    if not closed:
        return False
    if keep:
        meta["perguntas"] = keep
    else:
        meta.pop("perguntas")
    for p in closed:
        s.get("log").append({"at": now(), "text": f"pergunta {issue} {p['verbo']} fechada: {reason}"})
    s.touch("meta")
    s.touch("log")
    return True


def close_final_questions(s, issue, pairs):
    """A row that reaches a final status closes its open questions (decision 4 of #2070)."""
    if pairs.get("status") in FINAL_STATUS:
        close_questions(s, issue, None, f"etapa {pairs['status']}")


def open_question(s, issue, verbo, texto):
    if find_row(s.get("queue"), issue) is None:
        raise Erro(f"{issue} não está na fila")
    if find_row(s.get("queue"), issue)["status"] in FINAL_STATUS:
        raise Erro(f"{issue} is already in a final status: nothing to ask")
    if not texto.strip():
        raise Erro("falta texto=")
    meta = s.get("meta")[0]
    opened = meta.setdefault("perguntas", [])
    if any(p["issue"] == issue and p["verbo"] == verbo for p in opened):
        print_no_change()  # the same row and verb: keeps `at` and `texto`
        return
    opened.append({"issue": issue, "verbo": verbo, "texto": texto, "at": now()})
    s.touch("meta")
    s.commit()


def cmd_pergunta(a):
    validate_choice("verbo", a.verbo, PERGUNTA_VERBOS)
    issue = norm_issue(a.issue)
    closing = a.fim is not None
    if closing and a.pairs:
        raise Erro("the fields go after --fim: --fim resposta=\"…\"")
    pairs = parse_pairs(a.fim if closing else a.pairs)
    allowed = "resposta" if closing else "texto"
    for k in pairs:
        if k != allowed:
            raise Erro(f"campo desconhecido '{k}'; válidos: {allowed}")
    s = open_session(a.dir)
    if not closing:
        open_question(s, issue, a.verbo, pairs.get("texto", ""))
    elif close_questions(s, issue, a.verbo, pairs.get("resposta", "").strip() or "sem resposta"):
        s.commit()
    else:
        print_no_change()


def cmd_sup(a):
    pairs = parse_pairs(a.pairs)
    for k in pairs:
        if k not in ("tipo", "pedido", "estado", "evidencia"):
            raise Erro(f"campo desconhecido '{k}'; válidos: tipo, pedido, estado, evidencia")
    rid = check_request_id(a.request)
    if "estado" not in pairs:
        raise Erro("falta estado=")
    estado = pairs["estado"]
    validate_choice("estado", estado, REQUEST_STATES)
    if estado in REQUEST_NEEDS_EVIDENCE and not pairs.get("evidencia", "").strip():
        raise Erro(f"estado={estado} exige evidencia=")
    if "tipo" in pairs:
        validate_choice("tipo", pairs["tipo"], ["A", "B"])
    s = open_session(a.dir)
    m = s.get("meta")[0]
    reqs = m.setdefault("requests", [])
    req = next((r for r in reqs if r.get("id") == rid), None)
    if req is None:
        for k in ("tipo", "pedido"):
            if not pairs.get(k, "").strip():
                raise Erro(f"{rid} é um pedido novo: falta {k}=")
        req = {"id": rid, "tipo": pairs["tipo"], "pedido": pairs["pedido"], "history": []}
        reqs.append(req)
    else:
        for k in ("tipo", "pedido"):
            if k in pairs and pairs[k] != req.get(k):
                raise Erro(f"{rid} já existe com {k}={req.get(k)!r}: o {k} não muda")
    if req.get("estado") != estado:  # repeating the state does not restart the atrasado count
        req["estado"] = estado
        req["at"] = now()
        req.pop("evidencia", None)  # the evidence belongs to the state, not to the request
        req.setdefault("history", []).append({"estado": estado, "at": req["at"]})
    if pairs.get("evidencia"):
        req["evidencia"] = pairs["evidencia"]
    s.touch("meta")
    s.commit()


def request_late(r):
    """`enviado` or `aprovado` for more than 90 min (`atrasado` is computed, never written)."""
    return (r.get("estado") in REQUEST_LATE_STATES and bool(r.get("at"))
            and minutes_since(r["at"]) > REQUEST_LATE_MINUTES)


def request_ids(meta, fn):
    return [r.get("id", "?") for r in meta.get("requests") or [] if fn(r)]


def requests_summary(meta):
    """`pedidos do supervisor:` of `show`: open and late ones, or `nenhum`."""
    opened = request_ids(meta, lambda r: r.get("estado") in REQUEST_OPEN_STATES)
    if not opened:
        return "nenhum"
    late = request_ids(meta, request_late)
    return f"{len(opened)} abertos (atrasados: {', '.join(late) or 'nenhum'})"


def request_line(r):
    late = " (atrasado)" if request_late(r) else ""
    return (f"{r.get('id', '?')} | tipo {r.get('tipo', '?')} | {r.get('estado', '?')}{late} "
            f"| {r.get('at', '—')} | {r.get('pedido', '')}")


def cmd_requests(a):
    since = check_iso(a.desde) if a.desde is not None else None
    meta = (load(a.dir, "meta") or [{}])[0]
    reqs = meta.get("requests") or []
    if not reqs:
        print("nenhum")
        return
    # `--desde` (decision 5 of #1643): those with `at` from the requested time on and all the open ones; ISO UTC sorts as text
    shown = [r for r in reqs if since is None or r.get("estado") in REQUEST_OPEN_STATES
             or (r.get("at") or "") >= since]
    if not shown:
        print(f"nenhum desde {since}")
        return
    for r in shown:
        print(request_line(r))
    if len(shown) < len(reqs):
        print(f"{len(reqs) - len(shown)} pedidos fechados antes de {since} fora da lista")


def cmd_rule(a):
    s = open_session(a.dir)
    m = s.get("meta")[0]
    rules = m.setdefault("rules", [])
    if a.action == "add":
        if len(a.args) < 2 or not a.args[0].strip():
            raise Erro("rule add \"<texto>\" origem=<dono|SUP-n> [saida=\"…\"]")
        pairs = parse_pairs(a.args[1:])
        for k in pairs:
            if k not in ("origem", "saida"):
                raise Erro(f"campo desconhecido '{k}'; válidos: origem, saida")
        origem = pairs.get("origem", "")
        if not origem:
            raise Erro("falta origem=<dono|SUP-n>")
        if origem != "dono":
            check_request_id(origem)
        n = max([int(r["id"][1:]) for r in rules if re.fullmatch(r"R[0-9]+", str(r.get("id", "")))],
                default=0) + 1
        rule = {"id": f"R{n}", "texto": a.args[0], "origem": origem, "at": now()}
        if pairs.get("saida"):
            rule["saida"] = pairs["saida"]
        rules.append(rule)
    elif a.action == "end":
        if not a.args:
            raise Erro("rule end R<k> [motivo=\"…\"]")
        pairs = parse_pairs(a.args[1:])
        for k in pairs:
            if k != "motivo":
                raise Erro(f"campo desconhecido '{k}'; válido: motivo")
        rule = next((r for r in rules if r.get("id") == a.args[0]), None)
        if rule is None:
            raise Erro(f"{a.args[0]} não existe em meta.rules")
        if rule.get("endedAt"):
            raise Erro(f"{a.args[0]} já foi encerrada")
        rule["endedAt"] = now()
        if pairs.get("motivo"):
            rule["motivo"] = pairs["motivo"]
    else:
        raise Erro(f"ação inválida '{a.action}'; válidas: add, end")
    s.touch("meta")
    s.commit()


def active_rules(meta):
    return [r for r in meta.get("rules") or [] if not r.get("endedAt")]


def print_rules(meta):
    rs = active_rules(meta)
    if not rs:
        print("regras em vigor: nenhuma")
        return
    print("regras em vigor:")
    for r in rs:
        exit_ = f" [exit: {r['saida']}]" if r.get("saida") else ""
        print(f"  {r.get('id', '?')} ({r.get('origem', '?')}): {r.get('texto', '')}{exit_}")


def convert_hold(row):
    """The empty-queue hold becomes `exclusive=sim` (without hold). True if the row changed."""
    if row.get("hold") != HOLD_EMPTY_QUEUE:
        return False
    row["hold"] = ""
    row["exclusive"] = "sim"
    return True


def cmd_upgrade(a):
    s = open_session(a.dir)
    changed = [r["issue"] for r in s.get("queue") if convert_hold(r)]
    if not changed:
        print_no_change()
        return
    s.get("log").append({"at": now(), "text": "upgrade: " + ", ".join(
        f"{i} '{HOLD_EMPTY_QUEUE}' → exclusive=sim" for i in changed)})
    s.touch("queue")
    s.touch("log")
    s.commit()


def imported_row(old, order):
    """The new row, with only what `import` brings (the rest stays at the default empty)."""
    row = dict(QUEUE_EMPTY)
    # the phase waiting for the owner in its chat (#1602) carries the session; a requested merge carries only its `wait` and `childAt`
    running = carries_session(old)
    for k in IMPORT_FIELDS + (IMPORT_RUNNING_FIELDS if running else []):
        if k in old:
            row[k] = old[k]
    if (old.get("wait") or "").startswith(MERGE_ASK_PREFIX):  # a merge asked to the owner keeps its mark and its hours
        row["wait"] = old["wait"]
        row["childAt"] = old.get("childAt", "")
    row["order"] = order
    row["status"] = old["status"]
    row["exclusive"] = old.get("exclusive", "")
    return row


IMPORT_QUALITY_KEYS = ("escapados", "escapadosAt", "historico", "canarios")


def carry_quality(old_meta, meta):
    """Carries the quality data (escaped defects, check time, recovered-history mark, canaries) when the old panel has it."""
    for k in IMPORT_QUALITY_KEYS:
        if old_meta.get(k):
            meta[k] = old_meta[k]


SESSION_KEPT_KEYS = ("id", "issue", "kind", "label", "created", "sinais")


def freeze_bases(old_q, old_meta, meta):
    """Decision 3 of #2260: each carried canary gets the old panel's own "before" as its `base` (`fonte: import`); one
    with no such session keeps the old `base`, if it had one."""
    ruler = Ruler(old_q, old_meta)
    for c in meta.get("canarios") or []:
        es = canary_before(c, old_meta, old_q, ruler)
        if es:
            c["base"] = {**side_summary(es, ruler, c["papel"]), "fonte": "import", "at": now()}


def carry_canary_sessions(old_meta, meta):
    """Decision 4 of #2260: the sessions of the carried canaries come whole (`cost` included) and, of the same stages, the
    others without `cost` (the ruler reads them); the count of the canary's own is returned."""
    ids = {sid for c in meta.get("canarios") or [] for sid in c.get("sessoes") or []}
    sessions = old_meta.get("sessions") or []
    stages = {e.get("issue") for e in sessions if e.get("id") in ids and e.get("issue")}
    kept = [e if e.get("id") in ids else {k: e[k] for k in SESSION_KEPT_KEYS if k in e}
            for e in sessions if e.get("id") in ids or e.get("issue") in stages]
    if kept:
        meta["sessions"] = kept
    return sum(1 for e in sessions if e.get("id") in ids)


def carry_questions(old_meta, meta, rows):
    """Brings the open owner questions of the rows `import` kept; those of the others are dropped."""
    issues = {r["issue"] for r in rows}
    kept = [p for p in old_meta.get("perguntas") or [] if p["issue"] in issues]
    if kept:
        meta["perguntas"] = kept


def cmd_import(a):
    new = open_session(a.dir)
    if new.get("queue"):
        raise Erro(f"{a.dir} já tem fila ({len(new.get('queue'))} linhas): o import precisa de uma pasta nova (`init`)")
    old_q, old_m = load(a.old, "queue"), (load(a.old, "meta") or [{}])[0]
    load(a.old, "log")
    ordered = sorted(old_q, key=lambda r: r.get("order", 0))
    rows = []
    for r in ordered:
        if r.get("status") in IMPORT_STATUS:
            rows.append(imported_row(r, len(rows) + 1))
    exclusive, holds = [], []
    for row in rows:
        if row["hold"] == HOLD_PAUSED:
            row["hold"] = ""
            holds.append(f"{row['issue']} apagado")
        else:
            convert_hold(row)
            if row["hold"]:
                holds.append(f"{row['issue']} mantido")
        if row["exclusive"] == "sim":
            exclusive.append(row["issue"])
    new.get("queue").extend(rows)
    meta = new.get("meta")[0]
    merged = list(old_m.get("merged") or [])
    for r in ordered:
        if r.get("status") == "concluída" and r["issue"] not in merged:
            merged.append(r["issue"])
    if merged:
        meta["merged"] = merged
    rules = [r for r in old_m.get("rules") or [] if not r.get("endedAt")]
    if rules:
        meta["rules"] = rules
    carry_quality(old_m, meta)
    freeze_bases(old_q, old_m, meta)
    kept = carry_canary_sessions(old_m, meta)
    carry_questions(old_m, meta, rows)
    running = sum(1 for r in rows if carries_session(r))
    tail = f"; sessões de canário {kept}" if meta.get("canarios") else ""
    new.get("log").append({"at": now(), "text": (
        f"importado de {a.old}: {len(rows)} linhas ({running} em andamento); "
        f"exclusivas {' '.join(exclusive) or 'nenhuma'}; holds {', '.join(holds) or 'nenhum'}; merged {len(merged)}{tail}")})
    for n in FILES:
        new.touch(n)
    new.commit()


def cmd_touch(a):
    """The publication failed: marks the three files as not published again."""
    s = open_session(a.dir)
    mark_unpublished(s.get("meta")[0], FILES)
    s.touch("meta")
    s.commit()


def cmd_published(a):
    """Prints the real time of the publication and the files to send; clears what is left to publish."""
    d = a.dir
    m = load(d, "meta")
    if not m:
        raise Erro("meta.json está vazio")
    if a.done:
        if m[0].get("publishing"):
            m[0].pop("unpublished", None)
            m[0].pop("publishing", None)
            save(d, "meta", m)
        else:
            print("nada em voo (written after published, or there was no published): kept as unpublished")
        return
    at = now()
    files = list((m[0].get("unpublished") or {}).get("files", []))
    if "meta.json" not in files:
        files.append("meta.json")  # the meta changes on every published (publishedAt), so it always goes
    m[0]["publishedAt"] = at
    m[0]["publishing"] = {"at": at, "files": [n + ".json" for n in FILES if n + ".json" in files]}
    save(d, "meta", m)
    print(f"at: {at}")
    print("enviar: " + " ".join(n + ".json" for n in FILES if n + ".json" in files))
    print("alterados: meta.json")


BATCH_REJECTED = ("show", "apply", "init", "published", "slug", "toca", "conflito", "costs", "roles", "requests", "import",
                  "uso", "outliers")


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
    """The arguments of a batch line, with the folder placed after the subcommand."""
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
    parser = build_parser()
    try:
        for n, argv in parsed:
            try:
                sub = parser.parse_args(argv)
                sub.fn(sub)
            except Erro as e:
                raise Erro(e if str(e).startswith(f"linha {n}:") else f"linha {n}: {e}")
            except SystemExit:  # argparse's `-h`: not a command
                raise Erro(f"linha {n}: ajuda (-h) não entra no lote")
        BATCH.deferred = False
        BATCH.flush()
        print_starting(BATCH)
    finally:
        BATCH = None


# --- slots (stage #1440) ---

IGNORED_PREFIXES = ("changelog/", "docs/design-system/")
IGNORED_EXACT = ("mcp/version.ts", "docs/TESTING-NUVEM.md#blocos", "docs/TESTING-NUVEM.md#full-round-in-blocks")
# Index sections and key files that every stage appends to (decisions 1 to 3 of #2314): git merges the two additions, so they leave the
# comparison of `first_conflict`. Unlike IGNORED_*, `norm_toca`/`toca_list` keep them: `toca` still validates them and the ficha cites them.
APPEND_ONLY = (
    "docs/MCP.md#tools",
    "docs/AGENT-GUIDE.md#changing-a-project-proposals-for-review",
    ".claude/skills/spec-author/SKILL.md#method",
    "docs/ARCHITECTURE.md#where-everything-lives",
    "docs/TESTING.md#start-here",
    "docs/TESTING.md#8-test-scripts",
    "tests/tooling/roundBlocks.test.ts",
    "src/i18n/en-US.ts",
    "src/i18n/pt-BR.ts",
)
SECTION_GLOB = ".claude/skills/*/SKILL.md"  # besides every `.md` of docs/ and of the root: compared by anchor (`##` section)
TESTING_DOC = "docs/TESTING.md"  # its anchors are also scripts (`R<n>`, `RP`, `RF`, `RA`, `RB`)
STARTED_STATUS = ("em andamento", "esperando dono", "falhou", "esperando entrega")
WAITS_DELIVERY = "esperando entrega"  # a stage that finished its phases and waits for its holders' merge before its tester
STARTS_EARLY = "começa cedo"  # the early start (#2373): the same reason with the holders, `começa cedo (espera #S para testar)`
EARLY_STAGES = ("Testador", "Correção", "Fechamento")  # the stages of a started row that open the early start (decision 1)
FORMAT_FAMILIES = ("spec", "component", "proposal", "comment", "signature", "icons")  # the families of `formato=` (decision 8)
EXCLUSIVE_WAITS = "exclusiva (espera a fila esvaziar)"  # the exclusive stage that waits for the queue to empty (and drains, if at the front)
STARTS_NOW = "começa"  # the reason of the candidate that `slots_plan` makes start now (the graph puts it in wave 0)


def plan_field(plan, key):
    """Value of `key=` in the ficha (fields separated by `|` or `;`); None if missing."""
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


def group_end(s, i):
    """Index of the `)` that closes the `(` at `s[i]`, counting nested groups; -1 when it is never closed (that `(` is plain text)."""
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "(":
            depth += 1
        elif s[j] == ")":
            depth -= 1
            if depth == 0:
                return j
    return -1


def split_depth0(raw):
    """The comma-separated items of a raw `toca=`, splitting only at depth 0: a comma inside a balanced `(...)` stays in its item."""
    items, cur, i = [], [], 0
    while i < len(raw):
        end = group_end(raw, i) if raw[i] == "(" else -1
        if end >= 0:
            cur.append(raw[i:end + 1])
            i = end + 1
            continue
        if raw[i] == ",":
            items.append("".join(cur))
            cur = []
        else:
            cur.append(raw[i])
        i += 1
    items.append("".join(cur))
    return items


def scan_item(item):
    """(text, is_note) of one comma item (decision 7 of #2562): a balanced `(...)` group at depth 0 preceded by a space is a note after the
    path and leaves `text`; an item made only of such groups (`(novo (ver #12))`, `(n)(m)`) is a standalone note (`is_note`, `text` empty)."""
    kept, outside, groups, i = [], [], 0, 0
    while i < len(item):
        end = group_end(item, i) if item[i] == "(" else -1
        if end < 0:
            kept.append(item[i])
            outside.append(item[i])
            i += 1
            continue
        groups += 1
        if not (i > 0 and item[i - 1].isspace()):
            kept.append(item[i:end + 1])
        i = end + 1
    if groups and not "".join(outside).strip():
        return "", True
    return "".join(kept), False


def split_toca(raw):
    """([citation texts], [standalone notes]) of a raw `toca=`: the single reading `norm_toca` and `loose_notes` share (decision 7 of #2562)."""
    cites, notes = [], []
    for item in split_depth0(raw):
        text, is_note = scan_item(item)
        if is_note:
            notes.append(item.strip())
        else:
            cites.append(text)
    return cites, notes


def loose_notes(raw):
    """The standalone parenthesized notes of a raw `toca=` (a list; empty when there is none, also for `None`, `""` and `?`).

    Read by `redo_rows` (which lists the ficha); `norm_toca` drops them through the same `split_toca`. A note after its path
    (`x.ts (new, helper)`) is not one of them."""
    if raw is None:
        return []
    return split_toca(raw)[1]


def norm_toca(raw):
    """Citations of a `toca=` already normalized, without the ones that do not count; `?` if it says nothing.

    A non-empty `toca=` whose citations are all dropped by IGNORED_PREFIXES or IGNORED_EXACT also gives `["?"]` (decision 8 of #2562);
    one made only of standalone notes gives `[]`."""
    if raw is None or raw.strip() in ("", "?"):
        return ["?"]
    out, ignored = [], 0
    for x in (norm_path(t) for t in split_toca(raw)[0]):
        if not x:
            continue
        if x in IGNORED_EXACT or x.startswith(IGNORED_PREFIXES):
            ignored += 1
            continue
        out.append(x)
    return out if out or not ignored else ["?"]


def only_ignored(raw):
    """Is the raw `toca=` non-empty and not `?`, but normalizes to `?` because every citation is ignored (decision 8 of #2562)?"""
    if raw is None or raw.strip() in ("", "?") or norm_toca(raw) != ["?"]:
        return False
    return not any(norm_path(t) == "?" for t in split_toca(raw)[0])  # a literal `?` in the list is a `?`, not an ignored citation


def toca_list(plan):
    """Citations of the `toca=` already normalized, without the ones that do not count; `?` if the ficha does not say."""
    return norm_toca(plan_field(plan, "toca"))


def has_toca(plan):
    """Whether the ficha has a real `toca=`: not `?` (also when it has only ignored citations, decision 8 of #2562) and not only notes (`[]`)."""
    return toca_list(plan) not in (["?"], [])


@functools.lru_cache(maxsize=None)
def repo_root():
    """The repository root: the folder above `painel.py` that has `.git` (file or folder) or, when installed
    outside it (`~/.claude/skills`), the one `git rev-parse --show-toplevel` gives in the current directory. `None` if
    neither finds one: the check fails instead of assuming a root (`toca_invalid`)."""
    d = os.path.dirname(os.path.abspath(__file__))
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            return d
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    top = out.stdout.strip()
    return top if out.returncode == 0 and top else None


def is_folder(p):
    """Folder: ends in `/` or `/**`, or exists as a folder at the repository root."""
    return p.endswith(("/", "/**")) or os.path.isdir(os.path.join(repo_root() or "", p))


def bad_pattern(p):
    """Pattern outside decision 1: `*` outside the last segment, a last segment that starts with `*`,
    or a pattern in `docs/`, in `.claude/` or in a root `.md` (there the file and the section are cited)."""
    if any(c in p for c in "?[]"):
        return True  # only `*` is a pattern: `covers` and `glob_overlap` do not understand `?` or `[...]`
    if "*" not in p:
        return False
    segs = p.split("/")
    if any("*" in s for s in segs[:-1]) or segs[-1].startswith("*"):
        return True
    return p.startswith(("docs/", ".claude/")) or (len(segs) == 1 and p.endswith(".md"))


@functools.lru_cache(maxsize=None)
def doc_slugs(p):
    """Slugs of the `##` of file `p` (outside code blocks) plus `inicio`; `None` if the file does not exist."""
    path = os.path.join(repo_root() or "", p)
    if not os.path.isfile(path):
        return None
    slugs, fence = {"inicio"}, False
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("```"):
                fence = not fence
            elif not fence and line.startswith("## "):
                slugs.add(slugify(line[3:]))
    return slugs


def bad_anchor(p, anc):
    """Anchor outside decision 2: in `docs/TESTING.md`, `R<n>`, `RP`, `RF`, `RA`, `RB` (uppercase) or the slug of
    a `##`; in the others, the slug of a `##` of the file (the output of `painel.py slug`) or `inicio`. A document that
    does not exist yet accepts any slug (the phase creates it)."""
    if p == TESTING_DOC and re.fullmatch(r"R(\d+|P|F|A|B)", anc):
        return False
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", anc) or re.fullmatch(r"r(\d+|p|f|a|b)", anc):
        return True
    slugs = doc_slugs(p)
    return slugs is not None and anc not in slugs


@functools.lru_cache(maxsize=None)
def toca_invalid(x):
    """Reason why the citation is not valid (decision 2 of #1812), in the order checked; "" if valid.

    The citation arrives already normalized and past the filter of what does not count. Existing folders and documents are read at the
    repository root (`repo_root`), never in the current directory. The anchor is checked against the `##` of the existing
    file (`doc_slugs`). The result is memoized per citation: the file does not change during a command.
    """
    if x == "?":
        return "a ficha não diz"  # `?` in the middle of a list (the whole field as `?` gives just `toca`)
    if repo_root() is None:
        return "raiz do repositório não achada"  # without the root, folder and document cannot be checked: safe failure
    p, _, anc = x.partition("#")
    if is_folder(p):
        return "pasta"
    if "**" in p:
        return "**"
    if bad_pattern(p):
        return "padrão"
    if not by_section(p):
        return ""  # file (with or without anchor): counts whole, as today
    if not anc:
        return "documento inteiro" if os.path.isfile(os.path.join(repo_root(), p)) else ""
    return "âncora" if bad_anchor(p, anc) else ""


def first_invalid(cites):
    """(citation, reason) of the first invalid citation of the list; (None, "") if all are valid."""
    for x in cites:
        why = toca_invalid(x)
        if why:
            return x, why
    return None, ""


def covers(a, b):
    """Does `a` (folder `x/` or `x/**`, folder without a trailing slash, or glob `*`) cover the path `b`?"""
    if a.endswith("/**"):
        a = a[:-2]
    if a.endswith("/"):
        return b.startswith(a)
    if "*" in a:
        return fnmatch.fnmatchcase(b, a)
    return b.startswith(a + "/")


def by_section(path):
    """Is the file compared by anchor (`##` section, or script in docs/TESTING.md)? Every `.md` under `docs/`,
    every root `.md` (without `/`) and the SKILL.md files; the other files, including `.md` of other folders, count whole."""
    if not path.endswith(".md") or any(c in path for c in "*?"):
        return False  # a glob (`docs/*.md`) covers everything it matches, with or without anchor
    return path.startswith("docs/") or "/" not in path or fnmatch.fnmatchcase(path, SECTION_GLOB)


def glob_overlap(a, b):
    """Do two patterns with `*` (which matches any sequence, including `/`) match some path in common?"""
    seen = {}

    def go(i, j):
        if (i, j) in seen:
            return seen[i, j]
        if i == len(a) and j == len(b):
            r = True
        elif i < len(a) and a[i] == "*":
            r = go(i + 1, j) or (j < len(b) and go(i, j + 1))
        elif j < len(b) and b[j] == "*":
            r = go(i, j + 1) or (i < len(a) and go(i + 1, j))
        else:
            r = i < len(a) and j < len(b) and a[i] == b[j] and go(i + 1, j + 1)
        seen[i, j] = r
        return r

    return go(0, 0)


def same_target(a, b):
    """Do two citations of the `toca=` touch the same place? (section or script, folder, file)"""
    if a == "?" or b == "?":
        return True
    pa, _, anc_a = a.partition("#")
    pb, _, anc_b = b.partition("#")
    if pa != pb:
        if "*" in pa and "*" in pb and not pa.endswith(("/", "/**")) and not pb.endswith(("/", "/**")):
            return glob_overlap(pa, pb)
        return covers(pa, pb) or covers(pb, pa)
    if not by_section(pa):
        return True
    return not anc_a or not anc_b or anc_a.lower() == anc_b.lower()


def is_append_only(cite):
    """Is the citation (as `norm_toca` leaves it) an entry of APPEND_ONLY? The anchor is compared case-insensitively, as in `same_target`; `?` never."""
    if cite == "?":
        return False
    path, _, anchor = cite.partition("#")
    for entry in APPEND_ONLY:
        entry_path, _, entry_anchor = entry.partition("#")
        if path == entry_path and anchor.lower() == entry_anchor.lower():
            return True
    return False


def first_conflict(mine, other):
    """The citation of `mine` (or `?`) that touches the same place as one of `other`; the append-only ones of both sides do not count."""
    if "?" in mine or "?" in other:  # before the filter: an empty list (only notes or append-only citations) does not escape a started `?`
        return "?"
    for x in (c for c in mine if not is_append_only(c)):
        for y in (c for c in other if not is_append_only(c)):
            if same_target(x, y):
                return x
    return None


def dep_state(plan):
    """Dependencies of the ficha: ('?', []) if missing; otherwise ('ok', [(#n, state)])."""
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


def incomplete_fields(plan, exclusive=False):
    """Fields missing from the ficha: `dep` and `toca` as `?` or absent; `fases` only as `?` or empty.

    Decision 6 of #1812: the first invalid citation of the `toca=` gives `toca: <citation>`. The exclusive row does not go
    through this validation (`exclusive`): its `toca` does not count, because it waits for the queue to empty.
    """
    out = []
    if dep_state(plan) is None:
        out.append("dep")
    cites = toca_list(plan)
    if cites == ["?"]:
        out.append("toca")
    elif not exclusive:
        bad, _ = first_invalid(cites)
        if bad:
            out.append(f"toca: {bad}")
    fases = plan_field(plan, "fases")
    if fases is not None and fases.strip() in ("", "?"):
        out.append("fases")
    return out


def row_incomplete(r):
    """Fields missing from the row's ficha, respecting its `exclusive`."""
    return incomplete_fields(r.get("plan", ""), r.get("exclusive") == "sim")


def needs_redo(r):
    """Does the row's ficha have to be redone: incomplete, no `formato=` field at all, or a standalone note in `toca=`?"""
    plan = r.get("plan", "")
    return bool(row_incomplete(r) or plan_field(plan, "formato") is None or loose_notes(plan_field(plan, "toca")))


def redo_rows(q):
    """Non-final rows whose ficha is incomplete, has no `formato=` field at all or has a standalone note in `toca=` (the ficha is redone in the cycle).

    Decision 8 of #2373: the missing `formato=` does not make the ficha incomplete (`row_incomplete`), so it never holds the normal
    start, and `formato=?` is a written value that is not listed again. Decision 4 of #2428: the same for a standalone parenthesized
    note in `toca=` (`a.ts,(novo),b.ts`): `norm_toca` drops it, the row is listed here, nothing is held."""
    return [r for r in q if r["status"] not in ("concluída", "recusada") and needs_redo(r)]


def format_families(plan):
    """The format families the ficha raises (`formato=`): the set (empty for `não`), or None when unknown (absent, `?` or a family outside
    FORMAT_FAMILIES). Decision 8 of #2373."""
    v = plan_field(plan, "formato")
    if v is None:
        return None
    v = v.strip()
    if v == "não":
        return set()
    families = [f.strip() for f in v.split(",")]
    return set(families) if all(f in FORMAT_FAMILIES for f in families) else None


def format_pair_excluded(mine, other):
    """A pair is out of the early start when either side is unknown or they share a family (decision 8 of #2373)."""
    a, b = format_families(mine), format_families(other)
    return a is None or b is None or bool(a & b)


def eligible_holder(r):
    """Decision 1 of #2373: a started row that opens the early start: `em andamento` or `esperando dono` in a stage of EARLY_STAGES, not
    exclusive, not a fast track and with no `cedo` pending (so the second level of decision 9 comes from the empty `cedo`)."""
    return (r["status"] in ("em andamento", "esperando dono") and r.get("stage") in EARLY_STAGES
            and r.get("exclusive") != "sim" and r.get("kind") != "via-rapida" and not r.get("cedo"))


def holder_outcome(issue, q, merged):
    """How the holder `issue` ended (decision 5 of #2373): `mesclada` (a `concluída` row or `meta.merged`), `falhou`, `recusada`,
    `fora da fila` (no row) or None while it is still open (`em andamento`, `esperando dono`, `aguardando`, `esperando entrega`)."""
    row = find_row(q, issue)
    if issue in merged or (row and row["status"] == "concluída"):
        return "mesclada"
    if row is None:
        return "fora da fila"
    return row["status"] if row["status"] in ("falhou", "recusada") else None


def open_holders(r, q, merged):
    """The holders of `r.cedo` that are still open."""
    return [h for h in (r.get("cedo") or "").split() if holder_outcome(h, q, merged) is None]


def delivery_rows(q):
    """The `esperando entrega` rows."""
    return [r for r in q if r["status"] == WAITS_DELIVERY]


def delivery_step(r, q, merged):
    """The step of an `esperando entrega` row, rewritten on every write: `espera merge de #S, #T para testar`, with the holders still open
    (the step stays as it is when none is left: the row is in `pode sincronizar:`)."""
    holders = open_holders(r, q, merged)
    return "espera merge de " + ", ".join(holders) + " para testar" if holders else r.get("step", "")


def sync_delivery_steps(q, meta):
    """Rewrites the step of each `esperando entrega` row; True when one changed."""
    merged = set(meta.get("merged", []))
    changed = False
    for r in delivery_rows(q):
        step = delivery_step(r, q, merged)
        if step != r.get("step"):
            r["step"], changed = step, True
    return changed


def starting_text(issue, reasons):
    """An item of `começar agora:`: `#E`, or `#E (cedo: #S, #T)` for a candidate that starts early (decision 2 of #2373)."""
    early = reasons.get(issue, ("", "", []))[2]
    return f"{issue} (cedo: {', '.join(early)})" if early else issue


def print_starting(s):
    """`começar agora:` after a write (#2480): the `slots_plan` calculation `show` uses, on the state just written; silent when `nenhuma`."""
    _, agora, _, reasons, _ = slots_plan(s.get("queue"), s.get("meta")[0])
    if agora:
        print("começar agora: " + " ".join(starting_text(i, reasons) for i in agora))


def waiting_delivery_text(q, meta):
    """`#E (espera #S, #T); …` of the `esperando entrega` rows with a holder still open, or `nenhuma`."""
    merged = set(meta.get("merged", []))
    return "; ".join(f"{r['issue']} (espera {', '.join(open_holders(r, q, merged))})"
                     for r in delivery_rows(q) if open_holders(r, q, merged)) or "nenhuma"


def can_sync_text(q, meta):
    """`#E (#S mesclada; #T falhou); …` of the `esperando entrega` rows whose holders are all resolved, or `nenhuma`."""
    merged = set(meta.get("merged", []))
    out = []
    for r in delivery_rows(q):
        holders = (r.get("cedo") or "").split()
        outcomes = [holder_outcome(h, q, merged) for h in holders]
        if holders and all(outcomes):
            out.append(f"{r['issue']} (" + "; ".join(f"{h} {o}" for h, o in zip(holders, outcomes)) + ")")
    return "; ".join(out) or "nenhuma"


def changes_schema(plan):
    v = plan_field(plan, "schema")
    return v is None or v.strip() != "não"


def open_deps(r, merged, done):
    """The `dep=` of the ficha that are still open: not `:main`, not merged and not `concluída` in the queue."""
    return [d for d, st in dep_state(r.get("plan", "")) or []
            if not (st == "main" or d in merged or d in done)]


def plan_block(r, merged, done, refused=()):
    """Reason the ficha holds the stage: incomplete ficha or dependency outside `main`; "" if it does not hold.

    Decision 4 of #2204: a dependency whose row is `recusada` (`refused`) is written `#N recusada` in the reason (`dep #N recusada, #K`);
    the state stays `dep`."""
    miss = row_incomplete(r)
    if miss:
        return "ficha incompleta (" + ", ".join(miss) + ")"
    return dep_reason(r, merged, done, refused)


def dep_reason(r, merged, done, refused=()):
    """`dep #A, #B recusada` for the open dependencies of the ficha (`#N recusada` for a refused row); "" with none open."""
    miss = [d + " recusada" if d in refused else d for d in open_deps(r, merged, done)]
    return "dep " + ", ".join(miss) if miss else ""


def exclusive_block(r, taking, front=""):
    """Decision 12: the exclusive stage only starts with nothing started; with an exclusive one started, nothing starts.

    Decisions 2 and 3 of #1595: the exclusive stage holds the queue in any state, and the reason says the row's `status`
    (`falhou`, `esperando dono`, `aguardando` with `started`); `em andamento` and the one that starts in the same calculation give
    `em andamento`. Decisions 3 and 4 of #1813: with the exclusive stage at the front (`front`, the `#N`), the candidates after it
    give `segurada para a exclusiva #N`; itself, and the exclusive stage that is not at the front, give `exclusiva (espera a fila
    esvaziar)`.
    """
    for o in taking:
        if o.get("exclusive") == "sim":
            # an `aguardando` without `started` is the one that starts in the same calculation (it just entered `taking`)
            state = "em andamento" if o["status"] == "aguardando" and not o.get("started") else o["status"]
            return f"exclusiva {o['issue']} {state}"
    if front:
        return f"segurada para a exclusiva {front}"
    if r.get("exclusive") == "sim" and taking:
        return EXCLUSIVE_WAITS
    return ""


def refused_issues(q):
    """The issues of the `recusada` rows."""
    return {r["issue"] for r in q if r["status"] == "recusada"}


def file_conflicts(mine, taking):
    """`[(started row, citation)]` of every stage of `taking` that `mine` touches the same place as (decision 2 of #2373: all of them,
    not only the first)."""
    out = []
    for o in taking:
        c = first_conflict(mine, toca_list(o.get("plan", "")))
        if c:
            out.append((o, c))
    return out


def file_block(r, conflicts):
    """`(reason, holder, early holders)` of the file check. A conflict with a stage that is not an eligible holder holds the candidate
    and names that stage; a fast track holds on the first one (it has no tester to wait before); with every conflict on an eligible
    holder the candidate may start early: no reason yet, and the holders come back (decisions 1 and 2 of #2373)."""
    if not conflicts:
        return "", "", []
    stuck = [(o, c) for o, c in conflicts if not eligible_holder(o)]
    if not stuck and r.get("kind") == "via-rapida":
        stuck = conflicts[:1]  # the first code path by kind in `slots_plan`: no tester step to wait before
    if stuck:
        o, c = stuck[0]
        return f"arquivo {c} com {o['issue']}", o["issue"], []
    return "", "", [o["issue"] for o, _ in conflicts]


def format_block(plan, conflicts):
    """`(reason, holder)` of the same-format pair check of the early start (decision 8 of #2373); `("", "")` if none holds."""
    for o, c in conflicts:
        if format_pair_excluded(plan, o.get("plan", "")):
            return f"arquivo {c} com {o['issue']}", o["issue"]
    return "", ""


def schema_block(plan, taking):
    """`(reason, holder)` of the schema rule: it holds against every started stage, early or not (decision 10 of #2373)."""
    for o in taking:
        if changes_schema(plan) and changes_schema(o.get("plan", "")):
            return f"schema com {o['issue']}", o["issue"]
    return "", ""


def slots_plan(q, meta):
    """(text of meta.vagas, [issues that start now], pieces of the text, reasons, exclusive stage at the front).

    Decisions 4 and 5 of #1440. The reasons (decision 4 of #1761) are `{issue: (reason text, #N that holds, early holders)}` per
    candidate; the `#N` only comes in the reasons `arquivo <x> com #N` and `schema com #N`, otherwise it is "". The early holders
    (decision 2 of #2373) are the eligible holders of a `começa cedo` candidate (`["#S", …]`), otherwise `[]`: `row` writes them in `cedo`.

    Early start (#2373): a candidate whose only blockers are file conflicts with eligible holders (`eligible_holder`) starts with the
    reason `começa cedo (espera #S para testar)`, after the schema and the same-format checks and in a free slot; a `via-rapida`
    candidate never does.

    Decision 1 of #1813: the exclusive stage at the front is the first candidate, by `order`, without `hold`, with a complete ficha and
    merged dependencies, that does not start in this calculation, if it is exclusive and waits for the queue to empty ("" if the first
    is ordinary, or if there is none). Recalculated on every call, stateless.
    """
    n = meta.get("paralelo") or DEFAULT_PARALELO
    merged = set(meta.get("merged", []))
    done = {r["issue"] for r in q if r["status"] == "concluída"}
    refused = refused_issues(q)
    busy = sum(1 for r in q if r["status"] == "em andamento")
    started = [r for r in q if is_started(r)]
    cands = sorted((r for r in q if r["status"] == "aguardando" and not r.get("started")),
                   key=lambda r: r["order"])
    free = n - busy
    parts = [f"Vagas {busy}/{n}"]
    now_list = []
    reasons = {}
    taking = list(started)
    front, decided = "", False
    for r in cands:
        plan = r.get("plan", "")
        holder, early = "", []
        why = r.get("hold") or ""
        counts = not why
        if not why:
            why = plan_block(r, merged, done, refused)
            counts = not why
        if not why:
            why = exclusive_block(r, taking, front)
            if why == EXCLUSIVE_WAITS and not decided:
                front = r["issue"]
        conflicts = file_conflicts(toca_list(plan), taking) if not why else []
        if conflicts:
            why, holder, early = file_block(r, conflicts)
        if not why:
            why, holder = schema_block(plan, taking)
        if not why and early:
            why, holder = format_block(plan, conflicts)
        if why:
            early = []
        elif free > 0:
            why = f"{STARTS_EARLY} (espera {', '.join(early)} para testar)" if early else STARTS_NOW
            free -= 1
            now_list.append(r["issue"])
            taking.append(r)
        else:
            why, early = "vagas cheias", []
        decided = decided or (counts and not why.startswith(STARTS_NOW))
        parts.append(f"{r['issue']} {why}")
        reasons[r["issue"]] = (why, holder, early)
    if free > 0:
        parts.append("nenhuma ready elegível")
    return " · ".join(parts), now_list, parts, reasons, front


# --- queue graph (stage #1761) ---


def is_started(r):
    return r["status"] in STARTED_STATUS or (r["status"] == "aguardando" and bool(r.get("started")))


def started_state(r):
    """(estado, motivo) of a started row (decision 5 of #1761)."""
    st = r["status"]
    if st == "em andamento":
        return "rodando", r.get("step") or "em andamento"
    if st == "esperando dono":
        return "dono", r.get("wait") or "esperando o dono"
    if st == "falhou":
        return "dono", "falhou"
    if st == WAITS_DELIVERY:
        return "entrega", r.get("step") or "espera merge para testar"
    return "dep", r.get("step") or "parada"


def candidate_state(r, why):
    """State of a candidate from the reason `slots_plan` gave, in the order of decision 5 of #1761."""
    if r.get("hold"):
        return "segurada"
    if why.startswith("ficha incompleta"):
        return "ficha"
    if r.get("exclusive") == "sim" or why.startswith(("exclusiva", "segurada para a exclusiva")):
        return "exclusiva"
    if why.startswith("dep "):
        return "dep"
    if why.startswith(("arquivo ", "schema ")):
        return "arquivo"
    return "livre"


def graph_deps(r, nodes, merged):
    """Dependencies of the ficha's `dep=` that are graph nodes, without the `:main` ones or the merged ones (before the reduction)."""
    out = []
    for d, st in dep_state(r.get("plan", "")) or []:
        if d in nodes and d != r["issue"] and st != "main" and d not in merged and d not in out:
            out.append(d)
    return out


def ancestors_of(issue, deps):
    """All the dependencies, direct and indirect, of `issue`; with a cycle, it does not loop."""
    seen = set()
    todo = list(deps.get(issue, []))
    while todo:
        d = todo.pop()
        if d not in seen:
            seen.add(d)
            todo.extend(deps.get(d, []))
    return seen


def reduce_deps(issue, deps, anc):
    """Transitive reduction: drops dependency `p` that is an ancestor of another dependency `q` (outside a cycle with `p`)."""
    mine = deps[issue]
    return [p for p in mine
            if not any(q != p and p in anc[q] and q not in anc[p] for q in mine)]


def eligible_exclusive(r):
    """Exclusive stage without `hold` and with a complete ficha: the one that can stay at the front of the order (decision 6 of #1813)."""
    return (r.get("exclusive") == "sim" and not r.get("hold")
            and not row_incomplete(r))


def unplannable(r):
    """A row with `hold` or an incomplete ficha: it has no reliable `toca=`, so the wave check skips it both ways (decision 2 of #2293)."""
    return bool(r.get("hold") or row_incomplete(r))


def wave_key(r):
    """What the wave check reads from a row, computed once per round: (skips the check, `toca=` citations, changes the schema)."""
    plan = r.get("plan", "")
    return unplannable(r), toca_list(plan), changes_schema(plan)


def wave_conflict(a, b):
    """Two `wave_key`s that cannot share a wave: a file in common (`first_conflict`) or both change the schema (decision 1 of #2293)."""
    if a[0] or b[0]:
        return False
    return first_conflict(a[1], b[1]) is not None or (a[2] and b[2])


def pack_round(rows):
    """The rows of `rows` (taken in `order`) that fit in one round: each one with no conflict with those already placed."""
    placed, keys = [], []
    for r in sorted(rows, key=lambda x: x["order"]):
        key = wave_key(r)
        if not any(wave_conflict(key, k) for k in keys):
            placed.append(r)
            keys.append(key)
    return placed


def wave_round(pending, ready):
    """The rows of a round of the waves; `E` is the first eligible exclusive stage among the ready ones (decision 6 of #1813).

    Candidates are the ordinary ones that come before `E` in `order`, plus the ordinary ones with `hold` or an incomplete ficha (in any
    position); of those, `pack_round` keeps the ones with no file or schema in common (the rest wait for the next round). With none of
    them, `E` alone; without `E`, all the ordinary ones; with neither ordinary ones nor `E`, the first ready one; in a cycle,
    what is left enters together.
    """
    front = next((r for r in ready if eligible_exclusive(r)), None)
    plain = [r for r in ready if r.get("exclusive") != "sim"]
    before = [r for r in plain if front is None or r["order"] < front["order"] or unplannable(r)]
    return pack_round(before) or ([front] if front else ready[:1]) or pending


def assign_waves(rows, wave, deps):
    """Decisions 6 of #1761 and of #1813: simulation in rounds; `wave` already carries wave 0 and receives the others."""
    w = 0
    total = len({r["issue"] for r in rows})  # an issue repeated on two rows counts once
    while len(wave) < total:
        w += 1
        pending = [r for r in rows if r["issue"] not in wave]
        if not pending:
            break
        ready = [r for r in pending if all(d in wave for d in deps[r["issue"]])]
        for r in wave_round(pending, ready):
            wave[r["issue"]] = w


def file_blockers(mine, earlier):
    """`(files, schemas)` of the earlier nodes that `mine` (a `wave_key`) shares a file or the schema with (decision 4 of #2293).

    `files` is `[(#N, "arquivo <citation> com #N")]`, the citation being the one `first_conflict` returns; `schemas` is
    `[(#N, "schema com #N")]` of the nodes that share only the schema (a pair with a file in common is listed once, as in `schema_block`,
    which runs only without a file conflict). `earlier` is `[(#N, wave_key, wave)]` by wave, then `order`. A wave 0 node always counts (the
    slots read the started ones whatever their ficha); a later one counts only when plannable (decision 2 of #2293)."""
    files, schemas = [], []
    for issue, (skip, toca, schema), w in earlier:
        if skip and w:
            continue
        cite = first_conflict(mine[1], toca)
        if cite:
            files.append((issue, f"arquivo {cite} com {issue}"))
        elif mine[2] and schema:
            schemas.append((issue, f"schema com {issue}"))
    return files, schemas


def node_blockers(r, placed, wave, ctx):
    """`(reason parts, holders)` of a node of decision 4 of #2293, from the waves already assigned: the `dep` part (`dep_reason`), then the
    `arquivo` items, then the `schema` ones. `holders` are the file and schema blockers (the `arquivo` arrows). `placed` is
    `[(#N, wave_key, wave)]` of every node by wave, then `order` (computed once); `ctx` is `(merged, done, refused)`."""
    w = wave[r["issue"]]
    files, schemas = file_blockers(wave_key(r), [t for t in placed if t[2] < w])
    held = files + schemas
    parts = [dep_reason(r, *ctx)] + [text for _, text in held]
    return [p for p in parts if p], [h for h, _ in held]


def blocker_graph(r, why, placed, wave, ctx):
    """`(motivo, holders)` of a node of decision 4: the blockers joined by `; `; the `exclusiva` state keeps the `slots_plan` reason
    first (`dep` parts that it already carries are not repeated); with no blocker the `slots_plan` reason stays (`vagas cheias`)."""
    parts, holders = node_blockers(r, placed, wave, ctx)
    if candidate_state(r, why) == "exclusiva":
        parts = [why] + [p for p in parts if not (why.startswith("dep ") and p.startswith("dep "))]
    return ("; ".join(parts) if parts else why), holders


def graph_blockers(nodes, state, wave, q, meta):
    """`{issue: (motivo, holders)}` of every node of decision 4 of #2293: not started, outside wave 0, not `segurada` or `ficha`."""
    ctx = (set(meta.get("merged", [])), {r["issue"] for r in q if r["status"] == "concluída"}, refused_issues(q))
    placed = [(k, wave_key(nodes[k]), wave[k]) for k in sorted(nodes, key=lambda k: (wave[k], nodes[k]["order"]))]
    return {k: blocker_graph(r, state[k][1], placed, wave, ctx) for k, r in nodes.items()
            if not is_started(r) and wave[k] and state[k][0] not in ("segurada", "ficha")}


def first_open_phase(r):
    for item in (r.get("phases") or "").split("|"):
        code, _, st = item.partition(":")
        if item and st == "open":
            return code
    return ""


def queue_graph(q, meta, reasons):
    """(grafoNos, grafoSetas) of the queue; decisions 3 to 8 of #1761. Reads what `slots_plan` already decided.

    Early start (decisions 7 and 11 of #2373): the node has `cedo` (the holders still open, `#S, #T`, or ""), a started `esperando entrega`
    row has `estado` `entrega` with its step as `motivo`, and every open holder of a started row with `cedo` has an arrow
    `(holder, row, "entrega")`. A `começa cedo` candidate is in wave 0 like a `começa` one (the reason is read by prefix)."""
    rows = sorted((r for r in q if r["status"] not in ("concluída", "recusada")), key=lambda r: r["order"])
    nodes = {r["issue"]: r for r in rows}
    merged = set(meta.get("merged", []))
    deps = {k: graph_deps(r, nodes, merged) for k, r in nodes.items()}
    state = {}
    for r in rows:
        why = reasons.get(r["issue"], ("", ""))[0]
        state[r["issue"]] = started_state(r) if is_started(r) else (candidate_state(r, why), why)
    wave = {r["issue"]: 0 for r in rows
            if is_started(r) or reasons.get(r["issue"], ("", ""))[0].startswith(STARTS_NOW)}
    assign_waves(rows, wave, deps)
    blocked = graph_blockers(nodes, state, wave, q, meta)
    ranked = sorted((r for r in rows if not is_started(r) and state[r["issue"]][0] not in ("segurada", "ficha")),
                    key=lambda r: (wave[r["issue"]], r["order"]))
    rank = {r["issue"]: i for i, r in enumerate(ranked, 1)}
    listed = sorted(rows, key=lambda r: (wave[r["issue"]], rank.get(r["issue"], math.inf), r["order"]))
    pos = {r["issue"]: i for i, r in enumerate(listed)}
    anc = {k: ancestors_of(k, deps) for k in nodes}
    edges = []
    for k in nodes:
        edges += [(d, k, "dep") for d in reduce_deps(k, deps, anc)]
        holders = blocked[k][1] if k in blocked else [reasons.get(k, ("", ""))[1]]
        edges += [(h, k, "arquivo") for h in holders if h and h in nodes]
        if is_started(nodes[k]):
            edges += [(h, k, "entrega") for h in open_holders(nodes[k], q, merged) if h in nodes]
    edges.sort(key=lambda e: (pos[e[1]], pos[e[0]]))
    graph_nodes = [{
        "issue": r["issue"], "titulo": r.get("title", ""), "onda": wave[r["issue"]],
        "rank": rank.get(r["issue"]), "estado": state[r["issue"]][0], "motivo": blocked.get(r["issue"], (None,))[0] or state[r["issue"]][1],
        "fase": first_open_phase(r), "feitas": r.get("phasesDone", 0), "total": r.get("phasesTotal", 0),
        "cedo": ", ".join(open_holders(r, q, merged)),
    } for r in listed]
    return graph_nodes, [{"de": d, "para": k, "tipo": t} for d, k, t in edges]


def minutes_since(iso):
    t = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
    n = datetime.datetime.strptime(now(), "%Y-%m-%dT%H:%M:%SZ")
    return int((n - t).total_seconds() // 60)


def context_notes(meta):
    """The notices of the `contexto:` line of `show`, in this order: the switch alert (the action), the hand-given measure and the
    stale measure (decision 5 of #1874). Only if the `meta` has `context`."""
    notes = []
    if meta["context"] > CONTEXT_LIMIT:
        notes.append(f"acima de {CONTEXT_LIMIT}%: troque de sessão agora (\"Troca de sessão\")")
    if meta.get("contextFonte") in (None, "manual"):
        notes.append(f"medido à mão: {MEASURE_HINT}")
    at = meta.get("contextAt")
    if at and minutes_since(at) > CONTEXT_STALE_MINUTES:
        notes.append(f"medida velha (há {minutes_since(at)} min): {MEASURE_HINT}")
    return "".join(f" — {n}" for n in notes)


def late_rows(q):
    """A child with no notice for more than 30 min; one waiting for the coordinator (`wait`) does not count."""
    return [r for r in q if r.get("child") and r.get("childAt") and not r.get("wait")
            and minutes_since(r["childAt"]) > LATE_MINUTES]


def is_owner_wait(r):
    """A phase waiting for the owner in its chat: `child` and a `wait` marked with OWNER_WAIT_PREFIX (decision 7 of #1602).

    The mark is in the `wait`, not in the `status`: `esperando dono` also applies to a requested merge, a high-severity
    finding and a ruleset approval, and a fix phase's question to the coordinator can land on a stage like that.
    """
    return bool(r.get("child") and (r.get("wait") or "").startswith(OWNER_WAIT_PREFIX))


def carries_session(r):
    """A row whose phase session is still running: `em andamento` or waiting for the owner in its chat."""
    return r.get("status") == "em andamento" or is_owner_wait(r)


def owner_waiting_rows(q):
    return [r for r in q if is_owner_wait(r)]


def owner_recheck_rows(q):
    """A phase waiting for the owner for more than OWNER_RECHECK_MINUTES (the `wait` takes it out of `late_rows`); `childAt` = start."""
    return [r for r in owner_waiting_rows(q) if r.get("childAt")
            and minutes_since(r["childAt"]) > OWNER_RECHECK_MINUTES]


def owner_recheck_text(r):
    mins = minutes_since(r["childAt"])
    due = ", prazo vencido" if mins >= OWNER_DEADLINE_MINUTES else ""
    return f"{r['issue']} {r['child']} ({mins} min{due})"


def waiting_rows(q):
    """A child waiting for the coordinator: `child` and `wait`, without those waiting for the owner."""
    return [r for r in q if r.get("child") and r.get("wait") and not is_owner_wait(r)]


def merge_ask_rows(q):
    """Rows waiting for the owner to answer a merge asked by text: `esperando dono`, no `child`, `wait` with MERGE_ASK_PREFIX."""
    return [r for r in q if r.get("status") == "esperando dono" and not r.get("child")
            and (r.get("wait") or "").startswith(MERGE_ASK_PREFIX)]


def merge_ask_text(r):
    """`#n (PR #p, <hours>)`: the PR is what follows the mark in the `wait`; the hours come from `childAt`."""
    pr = r["wait"][len(MERGE_ASK_PREFIX):].strip()
    since = r.get("childAt")
    hours = f", há {minutes_since(since) // 60} h" if since else ""
    return f"{r['issue']} ({pr}{hours})"


def ci_wait_rows(q):
    return [r for r in q if r.get("ciWait")]


def ci_wait_text(r):
    since = r.get("ciWaitAt")
    mins = f" ({minutes_since(since)} min)" if since else ""
    return f"{r['issue']} {r['ciWait']}{mins}"


def age_text(at):
    return f"há {minutes_since(at) // 60} h" if at else "há ? h"  # same wording as `merge_ask_text`


def question_lines(meta, issue=None):
    """The indented lines of `perguntas ao dono:`: the row questions (`#n <verbo> (há <h> h): <texto>`) and, outside a row, the
    supervisor requests in `perguntado ao dono` (`SUP-<k> (há <h> h): <pedido>`, age from the request's `at`)."""
    lines = [f"  {p['issue']} {p['verbo']} ({age_text(p.get('at'))}): {p['texto']}"
             for p in meta.get("perguntas") or [] if issue in (None, p["issue"])]
    if issue is None:
        lines += [f"  {r.get('id', '?')} ({age_text(r.get('at'))}): {r.get('pedido', '')}"
                  for r in meta.get("requests") or [] if r.get("estado") == "perguntado ao dono"]
    return lines


def print_questions(meta, issue=None):
    lines = question_lines(meta, issue)
    if issue is None or lines:  # `show '#n'` says nothing for a row with no question
        print("perguntas ao dono: " + (str(len(lines)) if lines else "nenhuma"))
    for line in lines:
        print(line)


def refused_dependents(q, meta):
    """[(#M, [#N recusada that holds it])]: the `aguardando` rows not yet started whose open dependencies include a `recusada` row,
    in the order of the queue (decision 4 of #2204)."""
    merged = set(meta.get("merged", []))
    done = {r["issue"] for r in q if r["status"] == "concluída"}
    refused = refused_issues(q)
    out = []
    for r in sorted(q, key=lambda r: r["order"]):
        if r["status"] != "aguardando" or r.get("started"):
            continue
        held = [d for d in open_deps(r, merged, done) if d in refused]
        if held:
            out.append((r["issue"], held))
    return out


def refused_dependents_text(q, meta):
    return "; ".join(f"{i} ({', '.join(held)})" for i, held in refused_dependents(q, meta)) or "nenhum"


def show_row(r):
    print(f"{r['issue']} {r['title']}")
    for k, v in r.items():
        if k not in ("issue", "title") and v not in ("", 0):
            print(f"  {k}: {v}")


def slugify(title):
    """Slug of a `##`: lowercase, without accents (NFKD, without the marks), `-` per sequence outside [a-z0-9], no `-` at the ends."""
    text = unicodedata.normalize("NFKD", title)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def cmd_slug(a):
    print(slugify(a.title))


def invalid_lines(cites):
    """The `inválida: <citation> — <reason>` lines of the citations that are not valid (the empty list if all are valid)."""
    out = []
    for x in cites:
        why = toca_invalid(x)
        if why:
            out.append(f"inválida: {x} — {why}")
    return out


ONLY_IGNORED_REASON = "only ignored citations"


def cmd_toca(a):
    """Checks a list of citations of the `toca=` (decision 7 of #1812): `ok` (0) or `inválida: … — <reason>` (1)."""
    if only_ignored(a.cites):
        print(f"inválida: {a.cites} — {ONLY_IGNORED_REASON}")
        return 1
    bad = invalid_lines(norm_toca(a.cites))
    if bad:
        print("\n".join(bad))
        return 1
    print("ok")
    return 0


def conflict_others(d):
    """[(#N, status, citations)] of the folder that a new `toca` must respect, as `slots_plan` reads them: the started ones
    (`is_started`) and the ones it makes start now. Read-only."""
    q, m = load(d, "queue"), load(d, "meta")
    starting = slots_plan(q, m[0] if m else {})[1]
    out = []
    for r in q:
        if is_started(r):
            out.append((r["issue"], r["status"], toca_list(r.get("plan", ""))))
        elif r["issue"] in starting:
            out.append((r["issue"], "começa agora", toca_list(r.get("plan", ""))))
    return out


def parse_com(items):
    """`--com "#N=<toca>"` → [(#N, citations)]; without the `=` or with the number outside `#N` it is a usage error."""
    out = []
    for item in items or []:
        num, sep, cites = item.partition("=")
        if not sep:
            raise Erro(f"--com '{item}' invalid (use \"#N=<toca>\")")
        out.append((norm_issue(num), norm_toca(cites)))
    return out


def conflict_lines(mine, others):
    """One `conflito: <citation> com #N (<status>)` line per stage of `others` that touches the same place."""
    out = []
    for n, status, cites in others:
        cite = first_conflict(mine, cites)
        if cite:
            out.append(f"conflito: {cite} com {n} ({status})")
    return out


def cmd_conflito(a):
    """Checks a `toca` against the queue (decision 9 of #1864): `livre` (0), `conflito: …` (1) or `inválida: …` (2)."""
    extra = parse_com(a.com)
    mine = norm_toca(a.toca)
    bad = [f"inválida: {a.toca} — {ONLY_IGNORED_REASON}"] if only_ignored(a.toca) else invalid_lines(mine)
    if bad:
        print("\n".join(bad))
        return 2
    others = conflict_others(a.pasta) if a.pasta else []
    others += [(n, "fora do painel", cites) for n, cites in extra]
    found = conflict_lines(mine, others)
    print("\n".join(found) if found else "livre")
    return 1 if found else 0


def cmd_show(a):
    q, m, lg = (load(a.dir, n) for n in FILES)
    if a.issue:
        row = find_row(q, norm_issue(a.issue))
        if row is None:
            raise Erro(f"{a.issue} não está na fila")
        show_row(row)
        print_questions((m or [{}])[0], row["issue"])
        return
    print(f"fila: {len(q)} linhas")
    for st in STATUS:
        print(f"  {st}: {sum(1 for r in q if r['status'] == st)}")
    meta = m[0] if m else {}
    print(f"atual: {meta.get('current') or '—'}")
    vagas, agora, _, reasons, drena = slots_plan(q, meta)
    print(f"vagas: {vagas}")
    print("começar agora: " + (" ".join(starting_text(i, reasons) for i in agora) or "nenhuma"))
    print(f"drenando para a exclusiva: {drena or 'nenhuma'}")
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
    print(f"testador acima do teto: {tester_over_limit_text(q, meta)}")
    print(f"escapados: {escaped_text(meta)}")
    print(f"histórico: {history_text(meta)}")
    print(f"candidatos a teste: {candidates_text(compute_uso(q, meta))}")
    print(f"canários: {canary_text(meta)}")
    print(f"pedidos do supervisor: {requests_summary(meta)}")
    print_questions(meta)
    print(f"dependem de recusada: {refused_dependents_text(q, meta)}")
    print_rules(meta)
    ctx = meta.get("context")
    if ctx is None:
        print("contexto: —")
    else:
        print(f"contexto: {ctx}% ({meta.get('contextAt', '—')}, {meta.get('contextFonte') or '—'})"
              f"{context_notes(meta)}")
    for r in q:
        if r["status"] == "em andamento":
            early = f" · cedo: {', '.join(r['cedo'].split())}" if r.get("cedo") else ""
            print(f"  {r['issue']} {r['stage']} · {r['step']} · filhas: {r.get('child') or '—'}{early}")
    late = late_rows(q)
    print("atrasadas: " + ("; ".join(
        f"{r['issue']} {r['child']} ({minutes_since(r['childAt'])} min)" for r in late) or "nenhuma"))
    print("esperando o dono no chat da fase: " + ("; ".join(
        f"{r['issue']} ({r['wait']})" for r in owner_waiting_rows(q)) or "nenhuma"))
    print(f"esperando o dono há mais de {OWNER_RECHECK_MINUTES // 60} h: " + ("; ".join(
        owner_recheck_text(r) for r in owner_recheck_rows(q)) or "nenhuma"))
    print("esperando o coordenador: " + ("; ".join(
        f"{r['issue']} ({r['wait']})" for r in waiting_rows(q)) or "nenhuma"))
    print("CI esperando o coordenador: " + ("; ".join(
        ci_wait_text(r) for r in ci_wait_rows(q)) or "nenhuma"))
    print("merge pedido ao dono: " + ("; ".join(merge_ask_text(r) for r in merge_ask_rows(q)) or "nenhum"))
    print("esperando merge para testar: " + waiting_delivery_text(q, meta))
    print("pode sincronizar: " + can_sync_text(q, meta))
    print("últimas do log:")
    for e in lg[-5:]:
        print(f"  {e['at']}  {e['text']}")


class Parser(argparse.ArgumentParser):
    """Inside an `apply`, an invalid argument becomes an Erro (the batch cites the line) instead of exiting."""

    def error(self, message):
        if BATCH is not None:
            raise Erro(message)
        super().error(message)


def build_parser():
    p = Parser(description=__doc__)
    p.add_argument("--now", help="overrides the clock (ISO UTC, for tests)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_):
        sp = sub.add_parser(name, help=help_)
        sp.add_argument("dir", help="folder of the JSON files")
        sp.set_defaults(fn=fn)
        return sp

    sp = add("init", cmd_init, "creates the 3 empty files")
    sp.add_argument("--force", action="store_true")
    sp = add("start", cmd_start, "marks the start of the run (and the slots with --paralelo N)")
    sp.add_argument("--paralelo", type=int, help="number of slots (default 2)")
    add("end", cmd_end, "marks the end of the run (meta.runEnd = now; `start` clears it)")
    sp = add("row", cmd_row, "inserts or updates a queue row")
    sp.add_argument("issue")
    sp.add_argument("pairs", nargs="*")
    sp = add("reentra", cmd_reentra, "a `recusada` row comes back as a fresh `aguardando` one: '#n' kind=<via-rapida|etapa|bug> plan=\"<ficha>\" (clears started, ended, pr, child, wait, ciWait, hold and phases; keeps order and sessions)")
    sp.add_argument("issue")
    sp.add_argument("pairs", nargs="*")
    sp = add("phase", cmd_phase, "changes the state of the phases of a row (<code>=ok|open; the `todo` comes from the ficha, on every write)")
    sp.add_argument("issue")
    sp.add_argument("pairs", nargs="+")
    sp = add("reorder", cmd_reorder, "renumbers the aguardando rows")
    sp.add_argument("issues", nargs="+")
    sp = add("log", cmd_log, "appends to the log")
    sp.add_argument("text")
    sp = add("current", cmd_current, "changes the panel's 'current' line")
    sp.add_argument("text")
    sp = add("reserve", cmd_reserve, "stores the id of the session's fallback check")
    sp.add_argument("trigger")
    sp = add("session", cmd_session, "records a session created for the stage (without repeating; kind= [label=] also puts it in meta.sessions)")
    sp.add_argument("issue")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="*")
    sp = add("cost", cmd_cost, "writes the cost of a session (usd= ctx= [model= effort= served= issue= kind=])")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="+")
    sp = add("sinal", cmd_sinal, "records quality signals of a session: ci= cr= crFix= ciclo= dono= sub= (fase, correção) or ok= falha= alta= media= baixa= falso=<high|medium|low> xFalso= naoExec= sub= (testador, reteste); a number replaces, +k adds")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="+")
    sp = add("escapado", cmd_escapado, "records an escaped defect: '#<bug>' etapa='#<n>' sev=<high|medium|low> (the same bug replaces); --conferido marks the check")
    sp.add_argument("bug", nargs="?")
    sp.add_argument("pairs", nargs="*")
    sp.add_argument("--conferido", action="store_true", help="the escaped defects were checked now (meta.escapadosAt)")
    sp = add("historico", cmd_historico, "marks the history as recovered: --feito desde=<ISO> ate=<ISO> [linhas=<k>] (the lines without a session)")
    sp.add_argument("pairs", nargs="*", help="only to report a missing --feito")
    sp.add_argument("--feito", nargs="*", default=None, metavar="campo=valor",
                    help="the recovery is done: desde=<ISO> ate=<ISO> [linhas=<k>] (it takes the pairs itself: the positionals of an older argparse come out empty)")
    sp = add("canario", cmd_canario, CANARIO_HELP)
    sp.description = CANARIO_HELP
    sp.add_argument("action", help="add, end, base or usar")
    sp.add_argument("args", nargs="*", help="the id and campo=valor pairs (add, end), the id, the old folder and fonte= (base) or the role, '#n' and pairs (usar)")
    sp.add_argument("--nenhuma", action="store_true", help="base: there is no baseline (the verdict stays `sem base` without asking again)")
    sp = add("merged", cmd_merged, "records a stage merged into main (without repeating)")
    sp.add_argument("issue")
    sp = add("context", cmd_context, "records the coordinator's context: <pct> [--fonte get_session] (by hand, source manual) or --medir --max <max_tokens> (measures with scripts/ci/contextUsage.mjs and writes the source)")
    sp.add_argument("pct", nargs="?")
    sp.add_argument("--medir", action="store_true", help="measures the session's own context with contextUsage.mjs")
    sp.add_argument("--max", help="max_tokens of get_session without session_id (only with --medir)")
    sp.add_argument("--fonte", help="get_session: the pct comes from the used_tokens of get_session (only with <pct>)")
    sp = add("role", cmd_role, "records the current session of a role (coordenador|supervisor) [link=<url>]; n adds 1; an id already registered changes nothing")
    sp.add_argument("role")
    sp.add_argument("session")
    sp.add_argument("pairs", nargs="*")
    sp = add("sup", cmd_sup, "writes a supervisor request (SUP-n tipo= pedido= estado= [evidencia=]) to meta.requests")
    sp.add_argument("request")
    sp.add_argument("pairs", nargs="+")
    sp = add("pergunta", cmd_pergunta, "owner question of a row: '#n' <segurar|reabrir|refazer|ampliar|soltar> texto=\"…\" opens it; --fim [resposta=\"…\"] closes it (meta.perguntas)")
    sp.add_argument("issue")
    sp.add_argument("verbo")
    sp.add_argument("pairs", nargs="*", help="texto=\"…\" (to open)")
    sp.add_argument("--fim", nargs="*", default=None, metavar="resposta=\"…\"", help="closes the question; the optional pair is resposta=\"…\" (it takes the pairs itself: the positionals of an older argparse come out empty)")
    sp = add("requests", cmd_requests, "prints the supervisor requests, with the atrasado (reads only the meta; --desde <ISO> shows only those after that time and the open ones)")
    sp.add_argument("--desde", help="only the requests with at from this time on (ISO UTC) and all the open ones")
    sp = add("rule", cmd_rule, "rules in force: add \"<text>\" origem=<dono|SUP-n> [saida=] | end R<k> [motivo=]")
    sp.add_argument("action")
    sp.add_argument("args", nargs="*")
    add("upgrade", cmd_upgrade, "hot switch: the empty-queue hold becomes exclusive=sim (idempotent; records in the log)")
    sp = add("import", cmd_import, "brings from an old panel the order, the holds, the fichas and the running ones (new, empty folder)")
    sp.add_argument("old", metavar="pasta-antiga", help="folder of the old panel (read-only)")
    sp = add("roles", cmd_roles, "prints the current session of each role (reads only the meta; --sessao <id> adds the `esta sessão: …` line)")
    sp.add_argument("--sessao", help="the id of this session: adds registrada, coordenador, antiga, sucessora or nova")
    sp = add("apply", cmd_apply, "writes several subcommands at once (one per line; '-' reads from stdin)")
    sp.add_argument("file", metavar="arquivo", help="file with the commands, or - for stdin")
    sp = add("published", cmd_published, "prints the publication time (at:) and the files to send; --done, after the batch, clears what is left to publish")
    sp.add_argument("--done", action="store_true", help="the batch succeeded: clears what is left to publish")
    add("touch", cmd_touch, "the publication failed: marks the 3 files as not published again")
    sp = sub.add_parser("slug", help="prints the slug of a `##` title (section anchor)")
    sp.add_argument("title", metavar="title")
    sp.set_defaults(fn=cmd_slug)
    sp = sub.add_parser("toca", help="checks citations of the toca= (files and sections): ok, or `inválida: … — <reason>` and code 1")
    sp.add_argument("cites", metavar="citations", help="separated by commas, as in the ficha's toca=")
    sp.set_defaults(fn=cmd_toca)
    sp = sub.add_parser("conflito", help="checks a toca against the queue (read-only): livre (0), `conflito: … com #N (…)` (1) or `inválida: …` (2)")
    sp.add_argument("toca", metavar="toca", help="citations separated by commas, as in the ficha's toca=")
    sp.add_argument("--pasta", help="panel folder: the started and not merged ones and those of `começar agora:` count")
    sp.add_argument("--com", action="append", metavar="#N=<toca>", help="a stage outside the panel and its toca (repeatable)")
    sp.set_defaults(fn=cmd_conflito)
    sp = sub.add_parser("costs", help="total, by kind and by stage (reads only the meta; --desde <ISO> filters by created)")
    sp.add_argument("--desde", help="only the sessions with created from this date on (ISO UTC)")
    sp.add_argument("dir", help="folder of the JSON files")
    sp.set_defaults(fn=cmd_costs)
    sp = sub.add_parser("uso", help="usage and quality per role x model x effort (reads queue and meta; --desde <ISO> filters by created)")
    sp.add_argument("--desde", help="only the sessions with created from this date on (ISO UTC)")
    sp.add_argument("dir", help="folder of the JSON files")
    sp.set_defaults(fn=cmd_uso)
    sp = sub.add_parser("outliers", help="stages above 2x the median cost per planned phase of their group, with the cause (reads queue and meta; --desde <ISO> filters by started)")
    sp.add_argument("--desde", help="only the stages with started from this date on (ISO UTC)")
    sp.add_argument("dir", help="folder of the JSON files")
    sp.set_defaults(fn=cmd_outliers)
    sp = add("show", cmd_show, "readable summary; with '#n', the whole row (with the ficha)")
    sp.add_argument("issue", nargs="?")
    return p


def main(argv=None):
    global NOW_OVERRIDE
    a = build_parser().parse_args(argv)
    try:
        if a.now:
            NOW_OVERRIDE = check_iso(a.now)
        if getattr(a, "nenhuma", False) and not (a.fn is cmd_canario and a.action == "base"):
            raise Erro("--nenhuma only goes with `canario base`")
        return a.fn(a) or 0
    except Erro as e:
        print(f"erro: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
