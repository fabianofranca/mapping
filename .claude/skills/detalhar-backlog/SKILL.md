---
name: detalhar-backlog
description: Coordinates Opus subagents (the `Agent` tool, at high or medium effort by the skill's criteria) that detail, as `ready` stages, every open `roadmap` and `bug` issue of fabianofranca/mapping that is not yet `ready` or `in-progress`. Before detailing, a grouping subagent proposes merging issues into a single epic (fewer small MCP versions, one tester round for several) and the owner decides. The subagents' questions always reach the owner through the question picker, with a recommended option. Use when the owner asks to detail the backlog, the roadmap issues, the pending bugs or "everything that is not ready", or runs /detalhar-backlog.
---

# Detail the backlog

This session is the **coordinator**. It details nothing on its own: it creates the Opus subagents (the `Agent` tool), takes their questions to the owner, hands the answers back and checks the result. Whoever details follows `docs/PROCESS.md` ("Detailing a stage", "Impact", "Bugs and visual evidence", "Model use" and "Automated flow", item 2).

Run this chat in **Auto** mode: a subagent that asks for permission stays stuck, because nobody is watching (`docs/PROCESS.md`, "Limitations"). The coordinator may run on Sonnet; the judgment stays with the subagents, which run on Opus.

The `Agent` tool accepts `model` and `effort`. **This skill is the explicit effort request:** every subagent is born with `subagent_type: general-purpose`, `model: opus`, `run_in_background: true` and an explicit `effort`, `medium` for the grouping and `high` or `medium` per unit, by the criteria in "Detailing effort". Each subagent does the whole unit (reads, drafts, checks, asks through the coordinator and writes the issues), so all the judgment runs at the requested effort. No manual prompt for the owner to open a session.

## Arguments

`/detalhar-backlog [#n ...] [paralelo=N] [sem-agrupar] [alto=#a,#b|nenhum]`

- `#n ...`: details only these issues. Without the list, it details all the candidates.
- `paralelo=N`: how many detailing subagents run at the same time. The default is **3**.
- `sem-agrupar`: skips the grouping, and each issue becomes its own stage.
- `alto=#a,#b`: these issues (or the groups that contain them) call for high effort, on top of those the criteria point to. `alto=nenhum`: no unit is treated as high, and all of them run at `effort: medium`.

## Rule for questions to the owner

Every question to the owner goes through the questions tool (`AskUserQuestion`), **never** through loose text in the chat:

- each question stands on its own, because the owner may see only the dialog: it starts with `#<n> — ` and cites what it needs from the issue;
- it has 2 to 4 options, and the **recommended** one comes first, with " (Recomendado)" at the end of the label;
- the header has at most 12 characters;
- at most 4 questions go in each call. If there are more, make another call, one issue (or group) per call whenever possible;
- the answer in "Other" and the owner's notes go to the subagent **without changing a single word**.

Before each call, send a short `PushNotification`, for example "Detalhamento: 2 perguntas da #896". The owner uses a phone and may not be looking at the chat. Load `PushNotification` with `ToolSearch` if it is not loaded yet; `AskUserQuestion` only if it appears in the list of deferred tools.

## Detailing effort

The detailing of a unit runs at `effort: high` when the plan depends on fine judgment, and a mistake in it is costly in the implementation. A unit calls for high when it:

- touches a schema, a format (`docs/FORMAT.md`, `docs/SPEC-FORMAT.md`, `docs/COMMENT-FORMAT.md`) or a migration;
- touches the saving or the integrity of `mapping.json` (`src/store/session.ts`, revision, conflict), data loss or security (CSP, Trusted Types);
- touches a cross-cutting architecture rule: the hierarchy settling (`src/model/hierarchySettle.ts`), the store and undo, the `projectIndex`, the `CanvasController`, the contract of the MCP tools;
- should go past about 5 phases, or merges 4 or more issues;
- includes a `ready` whose plan changes (replanning), or is a `code-review` round with many findings to plan.

As for the **phases** of the models and effort table (decision 11 of #1324): a phase that touches the flow infrastructure or something critical gets a **high** coordinator **with `/code-review high`**, whatever its size. Risk triggers:

- the skills `implementar-fila`, `detalhar-backlog`, `supervisionar-fila` and `via-rapida`, the `painel.py`, or a rule (not just the text) of `docs/FLOW.md` or `docs/PROCESS.md`;
- `.github/workflows/`, `scripts/release/`, `scripts/ci/distBudget.mjs` (the ceiling guards; `scripts/ci/dist-budget.json`, which the raise writes, does not count) or `mcp/version.ts`;
- the schema or format version (`formatVersion`);
- the saving of `mapping.json` (`src/store/session.ts`) or the CSP (`pwa/csp.ts`).

At the epic closing, `scripts/ci/riskTriggers.mjs` checks the same triggers on the diff; whoever changes this list changes the script in the same PR.

The phase line says which trigger made it high (for example, "Sonnet high, with `/code-review high` (trigger: skill implementar-fila)"). Whoever adds a decision to a stage in progress **reclassifies** the effort of the phases that are not finished yet; if one becomes high, the phase is told that `/code-review high` now applies.

Everything else runs at `effort: medium`. When in doubt, recommend high (`docs/PROCESS.md`: when in doubt, the higher one wins), with the reason. The `alto=` argument adds units or turns the rule off.

## 1. Candidates

1. `list_issues` (`state: OPEN`, `fields: [number, title, labels]`, no `body`, because the body of all of them exceeds the limit) once with `labels: [roadmap]` and once with `labels: [bug]`.
2. Keep only those that have **neither** `ready`, `in-progress`, `via-rapida` nor `step`, and leave out the issues whose title starts with "Teto do dist/index.html acima dos limites" (the `bug` of the ceiling raise, stage #1802: it is a review request for the owner, not a defect to plan, and stays with their review in the supervisor's chat; say so when listing what was left out). With the `#n ...` list, use its intersection with the candidates and say which numbers were left out and why.
3. Order: `severity: high` and `impact: high` first, then `medium`, then `low`; on a tie, the lower number comes first. The order of the Project "Mapping - Backlog" is the owner's, and the tools cannot reach the Project.
4. With no candidates, say so and finish.

**Code reviewer issues** (label `code-review`, `docs/PROCESS.md` "Code review"): the round's issue (`roadmap`, title "CR base …" or "CR épico …") lists many findings, and each high or medium defect in it already has its own `bug` issue, cited in the body. The detailing of the round covers only the findings that do **not** point to a `bug`. Pass this on to the grouping subagent, so it merges each `bug` with the round or with other candidates of the same area, or splits the round by area, without detailing the same finding twice.

## 2. Grouping (one Opus subagent)

Skip this step with `sem-agrupar` or with a single candidate.

Create **one** grouping subagent with the `Agent` tool:

- `subagent_type`: `general-purpose`, `model`: `opus`, `effort`: `medium`, `run_in_background`: `true`;
- `description`: "Agrupamento do backlog".

Message:

<!-- portuguese-guard:begin frozen report format that the coordinator parses -->

```text
You are a subagent of the coordinator: do not ask the owner anything, and your final report is the message to the coordinator. You are the backlog grouping agent of `fabianofranca/mapping`. Do not edit any issue, do not create a branch or a PR.

1. Read `CLAUDE.md`, `docs/PROCESS.md`, the candidates <list #n — title — labels> (body and comments) and the open `ready` issues (body; the `step` sub-issues only when you need them). Do not propose touching the `in-progress` ones.
2. Propose groups: candidates that are worth more in a single epic than in separate epics. In the `code-review` issues, a finding of the round that points to a `bug` belongs to that `bug`; the round, which is a long list, may be split by area among several groups (say which items go to each). Weigh:
   - MCP version: several stages that would each raise the MCP (minor or patch) become a single version;
   - tester round: equal or close scripts run in a single round (`docs/TESTING-NUVEM.md`);
   - same area, same files or same proposed order: fewer conflicts and fewer merges of `main` into the epic;
   - same format or schema: a single version raise and a single migration;
   - the cost of merging: the big epic takes longer to reach `main` and one failure holds everyone back. Recommend at most about 8 phases per epic and do not merge anything with an unmet entry condition.
   - group with any `bug`: the main one is the `bug` of the highest severity (on a tie, the lowest number), because the stage becomes a `bug` with the group's highest severity.
3. Also say which `ready` issues (not `in-progress`) would fit well in a group. Merging a `ready` changes an already closed plan, and that is the owner's call: propose, do not decide.
4. Mark as blocked the candidate with an unmet entry condition (external dependency, earlier pending decision), with the reason.
5. For each group and each standalone one, say whether the detailing calls for high effort, by the criteria in "Detailing effort" of the skill `.claude/skills/detalhar-backlog/SKILL.md`, with the reason in one line. Evaluate the group as it would be if the owner approved it.
6. End with the proposal as the final report, exactly in this format:

AGRUPAMENTO
G1. <short name> — #a, #b, #c<, + ready #d>
  Por quê: <versions and round it saves, common area, risks>
  Principal: #a (the one that becomes the stage; the others close as duplicates of it; in a group with a `bug`, the `bug` of the highest severity and, on a tie, the lowest number)
  Pergunta: #a, #b, #c — <self-contained question> | Cabeçalho: <up to 12 characters>
    - <recommended option> (Recomendado): <consequence>
    - <other option>: <consequence>
SOZINHAS: #e, #f (each becomes its own stage)
BLOQUEADAS: #g — <reason>
ESFORÇO HIGH: G1 — <reason>; #e — <reason>   (or "ESFORÇO HIGH: nenhuma")
ORDEM: <suggested implementation order of the groups and standalone ones, with the why in one line each>
```

<!-- portuguese-guard:end -->

With the `AGRUPAMENTO`:

- one question per group, with the options the subagent gave, and at the end a question for the blocked ones, with the options "Pular (Recomendado)" and "Detalhar mesmo assim";
- the owner's answer closes the groups. An "Other" option that changes a group stands as it was written. If it is ambiguous, ask one more question;
- keep the `ORDEM` for the final summary and the `ESFORÇO HIGH` for step 3. If the owner undid or changed a group, reassess the effort of the resulting units, by the criteria.

Without grouping (`sem-agrupar` or a single candidate), read the body of each candidate (`issue_read`) and apply the criteria of "Detailing effort" yourself.

The subagent finishing wakes the coordinator, which reads the report in the notification. The fallback check of "4. During" applies. If the grouping goes 3 h without news, ask the owner whether to continue without grouping ("Seguir sem agrupar (Recomendado)" / "Recriar o subagente").

## 3. Detailing (Opus subagents, `paralelo` at a time)

Each **unit** is an approved group or a standalone issue. All of them run in subagents; the effort of each (`high` or `medium`) comes from the grouping's `ESFORÇO HIGH`, the criteria and `alto=` (if the owner undid or changed a group, reassess).

### Subagents

Follow the `ORDEM`. Dependency does not hold back the detailing: the `Depende de` orders the implementation, and two units that depend on each other may be detailed at the same time. Only wait for the other one to be ready when the plan of one needs the plan of the other (for example, to use a helper that the other creates). Create up to `paralelo` subagents with the `Agent` tool (`subagent_type: general-purpose`, `model: opus`, `run_in_background: true`, `effort: high` or `medium` of the unit, `description` "Detalhamento — #<main> <short title>"). When one finishes, the next one starts. Keep the id of each subagent: the `RESPOSTAS` go back through it.

Message:

<!-- portuguese-guard:begin frozen report format that the coordinator parses -->

```text
You are a subagent of the coordinator: do not ask the owner anything, and your final report is the message to the coordinator. You are the detailing agent <of issue #n | of group #a (main), #b, #c> of `fabianofranca/mapping` (docs/PROCESS.md, "Detailing a stage" and "Automated flow", item 2). Do not use the questions tool. Do not create a branch, a commit or a PR: the detailing only touches issues ("No PR exists just to touch a plan").

1. Read `CLAUDE.md`, `docs/PROCESS.md`, the unit's issues with their comments, the ones they cite and the titles of the open `ready` and `in-progress` issues, to find overlap. Read the code and docs that the plan will touch: the "Toca em:" of each phase cites files that exist.
<Group only: 2. The group was approved by the owner: <decision, in the owner's words if they wrote it>. #a becomes the stage. The content of each other goes into the body as a numbered item, with the origin, the label and the severity or impact. The others close as duplicates of #a (`state_reason: duplicate`, `duplicate_of`), each with a comment that says where it went. Group with any `bug`: the stage is a `bug`, with the group's highest severity and without `impact:`; if an absorbed one has a higher severity than the main one's, change its `severity:` and say why in the comment; the impact of each absorbed `roadmap` stays in "Absorvidas". Group without a `bug`: the stage keeps the type and label of #a. In "Absorvidas", the body lists the severity or impact of each. An absorbed `bug` keeps the steps to reproduce and the evidence. <If the group brings a `ready`: its plan changes; say so in a comment on it, with the why and the owner's decision. Open `step` sub-issues: (a) of an absorbed `ready`, the phase that continues in the new plan moves to the main one (`sub_issue_write` `add` with `replace_parent: true`) and has its body updated, and the one that drops out closes `not_planned` with a comment that points to the main one; (b) of a main `ready` whose plan changes, the phase that continues has its body updated, the one that drops out closes `not_planned` with the comment, and the new ones are created and put in order (`sub_issue_write` `reprioritize`). In the end, no open `step` is left hanging on a closed issue.>>
3. Draft the whole plan before creating anything: goal, what stays out, numbered decisions, epic (`epic/<name>`), versions (schema, formats and MCP: **one** MCP version for the whole stage, written as the type of the raise — `MCP: minor`, `MCP: patch` or `MCP: sem mudança` — and never as a number, because other stages detailed in parallel would pick the same one; the number is chosen at the epic closing, at the next free version of `origin/main`), records (changelog and DS), the `Impacto:` line (or the severity) and the models and effort table (an **Orquestrador** row, one row per phase and a Tester column). For each phase: the table row, the "Toca em:" (files, or a pattern with a prefix such as `tests/storage/folder*.test.ts`, and sections, **never a folder or a whole document with sections**; name every new file the phase creates, with "(novo)" after it, such as `src/model/direction.ts (novo)`; cite `docs/TESTING.md` by script, `docs/TESTING.md#R12`, and the rest of it by the `##`, such as `docs/TESTING.md#7-how-to-report-a-problem`; every `docs/*.md`, the root `.md` files and the `.claude/skills/*/SKILL.md` by `##` section, `docs/ARCHITECTURE.md#performance`, `CLAUDE.md#architecture-rules` and `.claude/skills/implementar-fila/SKILL.md#<slug>` (slug: title in lowercase, without accents, `-` between the sequences, such as `for-the-owner-in-the-three-chats`; a `###` counts as the `##` that contains it; the text before the first `##` is `#inicio`); and the blocks table as `docs/TESTING-NUVEM.md#full-round-in-blocks`; the other files, including the `.md` files of other folders, without an anchor), the checkboxes and the acceptance. Before writing, run `python3 .claude/skills/implementar-fila/painel/painel.py toca "<the Toca em: of each phase, comma-separated>"`: it only counts with `ok`, and the citation it calls invalid (`inválida: <citation> — <reason>`) gets fixed. The last phase carries the **Tester** section (`Testador`), with the scripts and the line "Passada visual: <list>" (or "nenhuma"). With several issues, merge the scripts into a single round.
   Before moving on, check the draft against the `main` code (Grep and Read), item by item, and fix whatever does not match:
   - every file, function, test, `docs/TESTING.md` step and version cited exists and says what the plan claims (the current values of schema, `formatVersion`, MCP and the libraries' `version`, read in the code);
   - no decision admits two different reasonable implementations; whatever admits them becomes a numbered decision or a question to the owner;
   - each phase fits in one session (one reviewable PR) and none depends on a later one;
   - a new script is "the next free number", goes into a block of the full round (`docs/TESTING-NUVEM.md`) and the cloud tester can run it on its own;
   - the "Sobreposição" cites the `ready` and `in-progress` issues that touch the same files, scripts or versions, with their current state (not the state from when they were cited).
4. Add to the body the line `**Depende de:** #x, #y` (or `**Depende de:** nenhuma`): the stage or what must be on `main` before it starts. The skill that implements the stages in sequence reads this line. It is **mandatory** for every open `ready` or `in-progress` whose "Toca em:" has a file in common with the new plan's: the new stage depends on the one that already exists. "File in common" follows the `painel.py` comparison (decisions 4 to 6 of #1440): `docs/TESTING.md` is compared by script (`docs/TESTING.md#R12` does not conflict with `docs/TESTING.md#R6`; without an anchor it conflicts with any citation of the file, and the old citation of the other `ready` issues (folder, whole document) counts as it does today: it covers what is under it and conflicts with every section), and every `docs/*.md`, the root `.md` files (`CLAUDE.md`, `README.md`) and the `.claude/skills/*/SKILL.md`, by `##` section in the same way (`docs/ARCHITECTURE.md#performance` does not conflict with `docs/ARCHITECTURE.md#session-and-saving`, nor `CLAUDE.md#architecture-rules` with `CLAUDE.md#workflow-summary`; the other files, including the `.md` files of other folders, count whole), and do not count `docs/TESTING-NUVEM.md#full-round-in-blocks`, each epic's records (`changelog/<name>.md`, `docs/design-system/<name>.md`), `mcp/version.ts` or the append-only index citations that every stage appends to (`docs/MCP.md#tools`, `docs/AGENT-GUIDE.md#changing-a-project-proposals-for-review`, `.claude/skills/spec-author/SKILL.md#method`, `docs/ARCHITECTURE.md#where-everything-lives`, `docs/TESTING.md#start-here`, `docs/TESTING.md#8-test-scripts`, `tests/tooling/roundBlocks.test.ts`, `src/i18n/en-US.ts` and `src/i18n/pt-BR.ts`; the list is `APPEND_ONLY` in `painel.py`, and the stage skill's "Parallel" prints the same one). Those citations stay in the phase's "Toca em:" (the phase's scope and the ficha use them): only the comparison and this mandatory line leave them out. If the owner's order is different, ask the owner (step 5); do not edit the other issue.
   Every issue you create (what you split off into `roadmap` or `bug`) carries in its body the line `Origem: etapa #<n>` (the stage you are detailing).
5. Product decision (docs/PROCESS.md: the expected behavior is not in an issue, doc or spec; there is more than one reasonable reading; it changes a decision already made; it touches a schema or format): do not decide alone. Gather the questions in a final report, in this format, and finish. The answer arrives later, as a message "RESPOSTAS #<main>", and you resume from there, with the context you already have.

PERGUNTAS #<main>
P1. #<main> — <self-contained question, with the context the owner needs> | Cabeçalho: <up to 12 characters>
  - <recommended option> (Recomendado): <consequence>
  - <other option>: <consequence>
(2 to 4 options, the recommended one first; up to 4 questions per message; with more, send them in rounds)

   A small decision you make yourself, move on and record as a numbered decision. Create nothing on GitHub before the answers.
6. Before creating, check whether a previous attempt already created `step` sub-issues or swapped labels on this unit; complete what is missing, without duplicating. With the answers: edit the main issue's body with the plan, create each phase as a `step` sub-issue (`issue_write` and then `sub_issue_write` with the main one as parent), in order, swap `roadmap` for `ready` (`issue_write` with `labels` replaces all the issue's labels: read the current ones and send the full list, without `roadmap` and with `ready`, and then check that `bug`, `severity:`, `impact:`, `code-review` and `observador-da-fila` are still there; `bug` and `severity:` stay; `impact:` stays on a `roadmap` without a `bug` in the group, and the stage that is a `bug` does not carry it; a `ready` that is not a `bug` carries the `impact:`) and record the owner's decisions in a comment, with the date and the why.
7. Every text you write on GitHub ends with the attribution footer. Never write the number of a PR or an issue that does not exist yet (the epic's PR, for example): say "the epic's PR", and whoever opens it puts the number.
8. When done, end with one of these messages as the final report:

PRONTA #<main> — <link>
  Épico: epic/<name> · Fases: <n> · MCP: <minor, patch or "sem mudança"> · Schema: <v or "sem mudança">
  Modelos: Orchestrator <model>; <phase: model/effort>; Tester <model/effort>
  Depende de: <#x or nenhuma>
  Absorvidas: <#b, #c or nenhuma>
  Decisões do dono aplicadas: <short list or nenhuma>
  Sobreposição: <files or scripts in common with other ready issues, or nenhuma>
  Conferência: <what the check of step 3 fixed, or "nada a corrigir">
  Issues novas: <what you split off into roadmap or bug, or nenhuma>

BLOQUEADA #<main> — <reason>   (entry condition not met; do not comment on the issue)
FALHOU #<main> — <what got stuck and what was done>

<In parallel with you: #x, #y. If your plan touches the same things as theirs, say so in "Sobreposição"; do not coordinate with them on your own.>
```

<!-- portuguese-guard:end -->

## 4. During

A subagent finishing wakes the coordinator, which reads the report in the notification. For each report:

- **`PERGUNTAS #n`**: notification, then `AskUserQuestion` with the questions as they came. Answer the **same** subagent through `SendMessage` (`to` = its id) with `RESPOSTAS #n` and, for each `Pk`, the chosen label and the owner's notes, or their text in "Other". If questions from two subagents arrive together, make one call per issue.
- **`PRONTA #n`**: check with `issue_read` that the issue has `ready` and does not have `roadmap` (and that `bug`, `severity:`, `impact:`, `code-review` and `observador-da-fila` from before are still there; `issue_write` with `labels` replaces all the labels, so the swap carries the full list), that the `step` sub-issues exist (`issue_read` of the sub-issues) and, in a group, that the absorbed ones closed as duplicates and have no open `step` (not even those of an absorbed `ready`), and that the report carries the `Conferência:` line. If anything is missing, send the subagent what is missing through `SendMessage` and wait again. With everything right, compare the "Sobreposição" with the ready reports already received in the round (which the subagent does not see): with a file in common (same rule as step 4 of the message) and no dependency between them, add `Depende de` to the one that comes later in the `ORDEM`, as long as the dependency (direct or transitive, reading the `Depende de` of both and of the ones they cite) does not close a cycle; if it does, do not edit and ask the owner (edited body and a comment with the why, ending with the attribution footer). Then **archive the detailing subagent's session** (`archive_session`, with the id the tool returned, if it is a session; a background `Agent` subagent has nothing to archive) and note this for the final summary. Then start the next unit.
- **`PERGUNTAS #n` answered and decision recorded:** the same goes for the grouping: after the owner decides the groups, archive the grouping subagent's session (`archive_session`) and note it in the final summary.
- **`BLOQUEADA #n`** or **`FALHOU #n`**: note it and start the next one. A failure goes into the final summary; do not try again without asking the owner.

**If `SendMessage` does not reach the subagent** (session restarted, subagent lost), create a new subagent with the same unit message and, at the end of it, the `RESPOSTAS` already given. It is safe: step 5 of the message forbids creating anything on GitHub before the answers, and step 6 says to complete what a previous attempt left behind.

**Fallback check:** a single one, of 60 min (`send_later`), while there is a subagent running without a report. When it fires:

- subagent with no news: schedule again. On the third time without news from the same subagent (3 h), ask the owner: "Seguir sem a #n (Recomendado)" / "Recriar o subagente" (the recreate follows the paragraph above);
- a subagent waiting for `RESPOSTAS` that the owner has not given yet is not a failure: `PushNotification` ("N unidades esperando suas respostas: #a, #b") and schedule again.

Cancel (`delete_trigger`) the check when there is no subagent left without a report.

## 5. Final summary

When all the subagents have finished:

1. Answer in the chat with a table: unit, issue with link, result (ready, blocked or failed), effort (`medium` or `high`), epic, phases, MCP version and "Depende de". Then, the overlaps among the ready stages, the new issues the subagents created (they were **not** detailed in this round), the units still waiting for the owner's answer and the suggested implementation order (the grouping's `ORDEM`, adjusted by the "Depende de" lines).
2. In the summary, also say which detailing and grouping sessions were archived.
3. Send a `PushNotification` with the total ("Backlog detalhado: 5 prontas, 1 bloqueada").
