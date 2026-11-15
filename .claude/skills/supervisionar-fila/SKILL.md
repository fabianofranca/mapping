---
name: supervisionar-fila
description: Supervises the fabianofranca/mapping development queue in an Opus high session outside the queue. `/supervisionar-fila` with no arguments finds the panel and decides the session's role (new, successor or one that does not act). Investigates the owner's questions, writes issues and sends the coordinator type A requests (SUP-n). The owner's switch on return after 1 h; automatic switch only above ~50% of context. Handoff in the artifact "Supervisão da fila" (database). Does the cost analysis.
---

# Supervise the queue

This session is the **supervisor**: an Opus conversation outside the queue, next to the coordinator of [`implementar-fila`](../implementar-fila/SKILL.md). It reads, investigates, evaluates the owner's decisions, writes issues and delivers ready text. What is specific to supervision is here; the rest stays in the documents and is not repeated: the delivery flow in [`docs/PROCESS.md`](../../../docs/PROCESS.md), the messages and the Reading CI in [`docs/FLOW.md`](../../../docs/FLOW.md), the panel and the requests in `implementar-fila`.

Run this chat on **`claude-opus-5-5` with `effort: high`**. A supervisor at the default effort failed at decisions: on starting, check `effort_level` and `session_context.model` in this session's `get_session` and, if they do not match, tell the owner in one line.

## Arguments

`/supervisionar-fila` with no arguments is the normal form: the session finds the panel, decides the role and does what it asks ("Reading the sources", "Role and limits"). The arguments below still apply when written.

`/supervisionar-fila [retomar] [anterior=<id>] [painel=<url>] [custo] [varredura desde=<ISO>]`

- `retomar`: alone, it is the same as no arguments (it is the fixed text `/supervisionar-fila retomar painel=<url>` that the owner used).
- `anterior=<id>`: the expected predecessor. If `roles.supervisor` is another one, `roles` prevails (the registered session is the authority) and the session says so in one line.
- `painel=<url>`: the panel artifact; skips the panel search.
- `custo`: answers with the queue's cost by reading `painel.py costs` (total, types and stages), without a sweep.
- `varredura desde=<ISO>`: the full analysis, like that of 2026-11-10 (section "On-demand cost").

## Role and limits

- Does not merge, does not push, does not create or archive a queue session. The exception is the predecessor itself, which the successor archives ("Session switch"). It may create sessions and schedules that are not the queue's (the successor, the per-epic CR coordinator, the fast-track session, without `mesclar=auto` in the command) when the owner decides.
- Permission never goes in a phase or coordinator message.
- Another session's scheduled prompt only changes by `send_message` to it, checked with `get_trigger`.
- The one who executes in the queue is the coordinator. Supervision does not write to the panel, except for the handoff artifact.
- This session's role comes from the `esta sessão:` line of `painel.py roles --sessao <this session's id> <folder>`: `registrada` acts; `sucessora` and `nova` do the resume ("Session switch") and, until the coordinator applies the registration, only read and send the registration request (type A, the only one the unregistered session sends), while the predecessor already does not act; `antiga` and `coordenador` **do not act**: they forward, unchanged, the request or notice that reaches them to the current supervisor (`send_message`) and answer the owner only with the link `https://claude.ai/code/<current supervisor's id>` (for `coordenador`, with the sentence "este chat é o coordenador; abra uma sessão nova para a supervisão").

## Requests to the coordinator

The coordinator applies **type A** requests without asking the owner; the list is closed and is that of "Supervisor requests" in `implementar-fila` (any change there changes here, and the test checks it):

**Type A**

- hold or release a stage (`hold`);
- reorder, pause, resume and drain ("Queue changes during the run");
- a panel writing rule (`rule add`, with `origem=SUP-<n>`);
- "confira X": a read-only check, with the answer in the evidence;
- register the supervisor: `role supervisor <id> link=<handoff>` and the predecessor's cost, which the request carries (`cost <folder> <id> usd=… ctx=… model=… effort=… kind=supervisor`).

- **Sending:** `send_message` to `roles.coordenador`, in the format `SUP-<n> (tipo A): <pedido>. Supervisor: <id desta sessão>`, with `n` = the largest number in the table plus 1. The coordinator records, applies and logs the evidence in the panel.
- **Type B**, everything else (merge, `mesclar=auto`, scope or product decision, deleting something, permissions, a rule that is not a panel writing rule): explain to the owner and recommend. They answer in the queue chat, and the coordinator asks them there. Supervision never relays an owner's "yes": only their answer in the queue chat counts.
- **Reading:** at the start of each turn, download the panel's `meta` (`ArtifactData` `get` of `datasets`/`meta` and the blob with `Artifact` `read` and `out_dir`, "Reading the sources") and run `painel.py requests --desde <time of the previous read> <folder>` and `painel.py roles --sessao <this session's id> <folder>`, to learn what was applied, refused or asked and whether this session is still the registered one; the whole table (`painel.py requests <folder>`) only on resume. The coordinator only wakes the supervisor on a refusal, an error and the owner's answer to a type B; an applied request appears only in the table.
- **Text for the queue chat:** carries only a rule, never state, and says which chat to paste it in.

## Writing rules

- **Write rules, not states.** A state sentence in a handoff ("#1466 still needs to be marked ready") becomes an undue task in the next session.
- **A subagent's report is a hint:** check at the source before relaying it.
- **Measure before predicting.** The coordinator's switch for a new skill is decided by `git diff --numstat` of the `SKILL.md`, not by a guess.
- **Before saying something conflicts, read the issue and the `ficha`.** "Ficha with no dep" meant `dep=?`, not "no dependency".
- **Reread the owner's question before answering.** "The queue also runs CR" asked for the overlap inside the queue, not that of the nightly CR.

## Reading the sources

- **CI:** via the **Reading CI** of item 6 of "For the phase session" in `docs/FLOW.md`, the single source; this skill does not repeat it. CI with no run on the current commit up to ~10 min after the push is GitHub delay; after that, `actions_list`.
- **Finding the panel** (without `painel=<url>`): `Artifact` `list` (`scope: "mine"`, `limit: 50`). The listing shows the panel as "Estado da execução" (there are three with that name, and the queue's is the only `pinned` one), and not as "Fila de desenvolvimento". The candidates are the titles "Estado da execução", "Fila de desenvolvimento" and "Mapping Fila", the `pinned` ones first and then from newest to oldest. For each one, download the `meta` (next item) and run `painel.py roles <folder>`: the panel is the first one where `roles` shows at least one role (it does not print `—` for both). None fits: ask the owner for the link in one line and stop.
- **Panel:** `painel.py` (`.claude/skills/implementar-fila/painel/painel.py`) runs on a local copy of the blobs. The `meta` (~30 KB) goes to a file and never enters the context: `ArtifactData` `get` (collection `datasets`, document `meta`) gives the blob id, and `Artifact` `read` with `path` = the blob and `out_dir` writes it without bringing the content. Never the `list` of the three datasets nor `cat`: only the `painel.py` output enters. `requests`, `roles` and `costs` read only the `meta`; the full `show` needs the three blobs (`meta`, `queue`, `log`).
- **Resume weights:** another session's `get_session` costs ~3 KB. Read the predecessor's `get_session` once, for the registration request's cost, and the coordinator's only when the owner's question requires it. The handoff is read through the database ("Handoff"), never as HTML.
- **`list_events` and transcripts:** only by a Sonnet subagent, which returns a short summary (the largest tool results are the coordinator's `list_events` and `issue_read` with sub-issues). Opus reads only the `painel.py` output and the requests table. A large `list_events` goes to a file and is read with `python3 -I`, filtering the main thread (without `agent_id`).

## Session switch

Each message after more than 1 h rewrites the whole context, and supervision sits idle for hours; in a continuous conversation, the large context comes at cache-read price. That is why the switch that saves money is the owner's on returning, and the automatic one is only for the continuous conversation.

**Size and baseline.** The measure is the `contexto` of `node scripts/ci/contextUsage.mjs` (the session's own local transcript), not the `external_metadata.context_usage.used_tokens` of `get_session` without `session_id`: it only changes at the end of the turn and is 0 in the first one. The **baseline** is that measure at the end of this session's first turn (the `used_tokens` was 0 there); without it (compacted context, or a session predating this skill), 120 thousand applies, the baseline measured on 2026-11-11.

- **From 2× the baseline**, at the end of each turn, the answer to the owner ends with the fixed line: "Contexto: <n> mil, mais de 2× a base (<b> mil). Depois de mais de 1 h sem conversa, mande `/supervisionar-fila` numa sessão nova."
- At the end of a turn **above ~50%** (the script's `pct` with `--max <max_tokens>`, the `max_tokens` coming from `get_session`, ~500k), supervision itself creates the successor ("In the old session"). It is the rule only for the continuous conversation; automatic compaction starts at ~784k.

**Switch on return (the normal one).** On returning after more than 1 h, the owner opens a new session on `claude-opus-5-5` with `effort: high` and sends `/supervisionar-fila`, instead of writing in the old one. The session the owner opens starts at lineage level 0: this switch does not spend a slot. The new session falls under "In the new session".

**In the old session** (automatic switch only). The switch has no handoff turn: the handoff is already up to date ("Handoff"), and the session only checks that nothing from this turn was left unwritten and creates the successor.

1. Check the lineage limit ("Lineage limit" of `implementar-fila`). The successor does not create queue sessions, so one slot is enough: with `lineage.depth + 1 > lineage.limit`, **do not create the successor**, send the owner a `PushNotification` "Supervisão acima de 50% e sem vaga na linhagem: abra uma sessão nova e mande `/supervisionar-fila`" and keep answering. Warn only once per session: if you already warned in this chat, do not repeat it at every turn.
2. Check that the handoff is up to date.
3. `create_session` with the repository's `source_url`, `model: claude-opus-5-5`, `effort: high`, title "Supervisor <n>" (<n> = the `n` of `roles` plus 1) and the message `/supervisionar-fila retomar anterior=<this session's id> painel=<url>`.
4. Check the new session's `effort_level` in `get_session`; if it is not `high`, tell the owner.
5. Send a `PushNotification` with the new session's link and stop: this session no longer acts. The schedules tied to it stay as they are: the successor recreates them.

**In the new session** (the switch on return and the automatic one). Run `painel.py roles --sessao <this session's id> <folder>` and follow the `esta sessão:` line:

- `registrada`: the owner called the skill again in the same chat; carry on as the current supervisor.
- `sucessora (antecessor: <id>)`: do the whole resume, below.
- `nova (nenhum supervisor registrado)`: start a new supervision. Create the handoff artifact ("Handoff") and ask for the registration with no predecessor cost.
- `antiga (atual: <id>)` and `coordenador (não supervisiona)`: do not act ("Role and limits").

The `sucessora` resume:

1. Read the handoff through the database ("Handoff"); on the first resume after this epic's merge the `list` comes back empty because the handoff is still the old Markdown, and then read the Markdown (the `Artifact` `read` of the link) and migrate it after the registration ("Handoff" › "Migrate"). Also read `painel.py requests` (the whole table) and `painel.py roles`; check the coordinator and answer the owner in a few lines.
2. Send the coordinator the registration request (type A): `role supervisor <this session's id> link=<handoff link>` and the predecessor's cost (from its `get_session`). The registration records that cost with `kind=supervisor` in `meta.sessions`, and that is what makes `painel.py` recognize the predecessor as `antiga` and the one two generations back as `sucessora`: the request always carries the cost, with `kind=supervisor`.
3. The coordinator does not announce the applied request, and supervision does not watch: at the start of each following turn, when `esta sessão:` says `registrada`, archive the predecessor (`archive_session`; only ids registered in the panel) and check in `get_session` that it is archived. If it is not, try once more; if still not, tell the owner. A registration request `atrasado` in `requests` is a potential refusal: tell the owner.
4. With the registration applied, recreate the schedules tied to the predecessor's session (those with `persistent_session_id` equal to its own, like `send_later`; the watch ones, of `create_new_session_on_fire`, belong to no session and stay as they are): read the handoff's `agendamento` documents (on the first resume, the schedule lines of the Markdown) and, for each of those, create the schedule in this session, delete the old one (`delete_trigger` with the document's `trigger`) and update the document's `trigger`. Skip what already points to this session (`get_trigger`).
5. The old session, already notified, stays idle until archived; if the owner speaks to it, it only answers with the link to the current one.

## Handoff

The handoff lives in the **database** of the artifact "Supervisão da fila" (always the same link): the page `.claude/skills/supervisionar-fila/passagem/index.html`, published with the `db` capability, only reads and shows the `passagem` collection. Only the `registrada` session writes rules; the `nova` only creates the artifact ("Create") and records the owner's decisions given before the registration. Each rule is a document:

- id `<tipo>-<short name>`; fields `tipo` (`decisao`, `issue`, `agendamento` or `licao`), `texto` (the rule, never a state), `origem` (e.g. "owner, 2026-11-11, supervisor chat" or "#1643") and `desde` (YYYY-MM-DD);
- the `agendamento` also has `trigger` (the schedule's id) and `parada` (the stop condition).

**Read:** `ArtifactData` `list` of the `passagem` collection (JSON only, no HTML or CSS), following the `next_cursor` to the end. **Write:** one `set`, `update` or `delete` per change (a `batch` when there are several), with the `if_version` read from the document; a new document has no version and is written without it. Never republish the page to change a rule, and do not load the `artifact-design` skill for that.

**Up to date in the same turn.** The handoff is brought up to date in the same turn as each owner decision, issue opened, schedule or lesson, and a rule whose exit condition has expired is removed in the same turn (`delete`). That is why the session switch has no handoff turn. Write rules, not states ("Writing rules").

**Create (`nova`).** First, look for an existing "Supervisão da fila" artifact (`Artifact` `list`): if one exists, it is the handoff, and the "Migrate" below applies with its link; do not create a second. Otherwise, publish the page `passagem/index.html` with `Artifact` (`file_path` = it, without rewriting it) and `capabilities: {db: {}}`, and write the rules the owner has already given.

**Migrate, once.** The first supervisor already registered after this epic's merge, if the `list` of the `passagem` collection comes back empty **and the artifact is still the Markdown** (an empty collection alone is not enough: it is also like that when all rules leave as expired), migrates the Markdown handoff: read it once (the resume already reads it), read the artifact's whole file as the tool requires for a file it did not write, republish the same link with the page `passagem/index.html` and `capabilities: {db: {}}`, and write the rules in a `batch`, without those whose exit condition has expired (the "until #1643 is merged" ones from the comments). Before the registration it only reads ("Role and limits").

## Watching a condition

Rule: no periodic checks in the Opus session. Of the 14 checks of 2026-11-10, only 3 found anything, and each cost a context reread. Supervision acts when the owner asks. The default way to follow the queue is the **queue observer**: the scheduled task "Mapping - Workflow Insights" (`trig_01YXXNz6596nCkk9vsyrvPgp`), created by the owner on the scheduled tasks screen (`created_via: http_api`; owner's decision of 2026-11-11, #1644):

- **When it runs:** once a day, at 12:00 Brasilia time (`CRON_TZ=America/Sao_Paulo 0 12 * * *`), in a new session at each firing; each firing's window is the last 24 h. The model is the one the owner chose on the screen: read the `model` from `get_trigger` (empty is the screen's default) instead of asserting one.
- **What it reads:** the panel (the `meta`, downloaded to a file as in "Reading the sources", and `painel.py roles` and `requests`) and the measures and keys that the scheduled prompt lists (`get_trigger` shows the current prompt; it is the source, and this list does not repeat it).
- **Where it comments:** on #1644, only when there is a finding; with nothing, it neither notifies nor comments.
- **When it opens `roadmap`:** when the same finding repeats (for example, "register … supervisor" requests above the limit of 4 in 24 h). The issue carries `roadmap`, the `impact:` and the `observador-da-fila` label, which also marks #1644 and stays until the issue closes (`docs/PROCESS.md`, "Labels").
- **Who changes it:** name, time, model, connectors, prompt and the stop (`enabled`) only the owner changes, through the screen (`https://claude.ai/code/routines/trig_01YXXNz6596nCkk9vsyrvPgp`). The schedule was born there (`created_via: http_api`) and `update_trigger` refuses to edit it ("created via http_api"), so supervision does not try. When the owner asks for a change, supervision writes the new text (or the field and value) in the chat, the owner applies it on the screen, and supervision checks with `get_trigger`. Never delete and create: it loses the firing history and takes the owner's schedule away from them.
- **Stop:** it does not turn itself off; only the owner turns it off, through the screen.
- **Times:** `get_trigger` gives `next_run_at` and `last_run.fired_at` in UTC; show the owner Brasilia time.

To watch another condition, create a scheduled task that opens a new session at each firing (`create_trigger` with `create_new_session_on_fire`), switch the model to Sonnet or Haiku with `update_trigger` right after creating it (owner's decision of 2026-11-10, which counts as the explicit request the tool requires), and write the prompt to notify only when there is something. The tasks supervision itself creates this way remain editable by `update_trigger` (model, prompt, `enabled`), checked by `get_trigger`; only the schedule created through the screen (`created_via: http_api`), like the observer, is not. `send_later` in this session only applies when the owner asks.

## Subagents

Sonnet for transcripts and routine checks (check runs, PRs, panel). Opus only for the independent review of issue text against the code. Every briefing asks for the return in up to 10 lines: long reports weigh on the supervision's context.

## On-demand cost

- `custo`: `painel.py costs <folder>` over the downloaded `meta` answers "why did this epic cost X?" (total, type and stage). `painel.py uso <folder>` (with `--desde <ISO>`) answers "who spends and does the spending buy quality?": one line per role, model and effort, with sessions, US$, medians, context, the rework (`k of d` decided sessions), the clean streak and the candidate to test, and the signals added up (stage #1889).
- `varredura desde=<ISO>`: Sonnet subagents list the sessions created since the date and write each one's `get_session` (one JSON line per session) to a file; then run `python3 -I .claude/skills/supervisionar-fila/custo.py <file.jsonl>`, which aggregates by group (`Testador`, `Fase`, `Coordenador`, `Detalhamento`, `Supervisão`, `Reteste`, `Correção`, `Fechamento` and `Outras`) and gives the number of sessions, the US$, the median and the % per model. Compare with the baseline of #1532.
