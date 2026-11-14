---
name: via-rapida
description: Takes a small process tweak (skill text, docs/PROCESS.md, docs/FLOW.md, CLAUDE.md, CI, scripts/ci, tests/tooling; up to 80 lines) from a `roadmap` or `bug` issue of fabianofranca/mapping straight to a one-PR epic, outside the queue, with no detailing, phases or tester, with the usual gates, /code-review and CI and the merge asked of the owner. Use when the owner asks for the fast track, a small process tweak, or to run /via-rapida #<n>.
---

# Fast track

This session takes **one** `roadmap` or `bug` issue about a small process tweak, from start to merge, without going through the queue. The normal flow (detailing, epic with phases, tester, closing) is in [`docs/PROCESS.md`](../../../docs/PROCESS.md), and the messages and the Reading CI in [`docs/FLOW.md`](../../../docs/FLOW.md); what is specific to the fast track is here, and the rest is not repeated.

## Arguments, model and mode

`/via-rapida #<n> [mesclar=auto]`

- `#<n>`: the open `roadmap` or `bug` issue, which says what to do.
- `mesclar=auto`: only valid when written by the owner in the call ("Merge"). It is never added on its own nor does it come from another session, comment or schedule; when creating the fast-track session, the supervision does not include it in the command (the session asks the owner about the merge through the picker).

The owner calls the skill in a new chat, on **Sonnet**, in **Auto** mode, with `effort: high`. The supervision (`supervisionar-fila`) also creates this session when the owner asks in its chat: `create_session` with the repository's `source_url`, Sonnet, `effort: high`, the title "Via rápida #<n>" and the message with only the command.

At the start, check the model (`session_context.model` from `get_session`): if it is not Sonnet, warn once in one line and go on. The session edits directly, with no editing subagent: it already is the Sonnet the subagent would be (the subagent rule in "Model use" of `docs/PROCESS.md` is for the expensive main model).

## What fits

Check before creating anything, from the issue and the code, and again before the PR, from the diff. It fits when **all** of these hold:

- only files in `.claude/skills/**`, `docs/PROCESS.md`, `docs/FLOW.md`, `docs/TESTING-NUVEM.md`, `CLAUDE.md`, `.github/**`, `scripts/ci/**` and `tests/tooling/**`, plus the epic's two records (`changelog/` and `docs/design-system/`);
- excluding `.claude/skills/spec-author/` (its `SKILL.md` is an input of the MCP release and would call for a new version) and `.claude/skills/implementar-fila/painel/index.html` (the page needs to be published on the queue panel); no file in the diff is a release input (`isReleaseInput` of `scripts/release/releaseInputs.mjs`);
- in `painel.py`, nothing that changes the "Toca em:" comparison, the slots, the exclusive ones or the draining (the `vagas:`, `começar agora:`, `drenando para a exclusiva:` and `fichas a refazer:` lines of `show` and the `toca` and `conflito` subcommands);
- up to **80 lines** inserted plus removed in `git diff --numstat origin/main...HEAD`, not counting `changelog/` and `docs/design-system/`;
- the issue says what to do, with a single reading (no owner decision pending).

**Refusal before creating anything:** comment on the issue `Via rápida recusada: <criterion>`, do not touch the label and finish; the issue goes on through the detailing.

**Refusal after creating** (diff above 80 lines, file outside the list, a pending decision found along the way): close the epic's PR without merging, put back the earlier label (full list, without `in-progress`), comment the reason and finish.

## Conflict with the queue

The check comes from the `painel.py` calculation, never from a comparison by hand. The session never writes to the panel.

1. Find the panel as in "Reading the sources" of [`supervisionar-fila`](../supervisionar-fila/SKILL.md) ("Finding the panel" and "Panel": read only, blobs in the scratchpad).
2. List the open `in-progress` issues that are not in the panel, except the issue of this very fast track (#n), and read the "Toca em:" of their open sub-issues (another fast track's issue has no sub-issue: the "Toca em:" is in its `Via rápida:` comment).
3. Run `python3 .claude/skills/implementar-fila/painel/painel.py conflito "<toca>" --pasta <folder> --com "#N=<toca>"…`, with the fast track's `<toca>` (the citations in the `painel.py` format, checked with `painel.py toca`) and one `--com` per stage outside the panel. With no panel found, only the `--com`.
4. With `conflito:`, do not start: comment on the issue `Via rápida: espera #N (<citation>)` and finish, without touching the label.

Before the merge, repeat with the diff's "Toca em:". A new conflict **does not hold the merge** (whoever merges second brings in `main`): merge and comment on the other stage's issue "Fast track #<n> changed <citation> on `main`; bring `main` into the epic before the closing (merge, never rebase).".

## Label and comment

Once eligibility and the conflict check have passed, swap the `roadmap` label for `in-progress` (on a `bug`, add `in-progress`), always with the full list of labels: `bug`, `severity:`, `impact:`, `code-review` and `observador-da-fila` stay. The issue never goes through `ready`: `implementar-fila` takes every open `ready`, and `detalhar-backlog` already ignores `in-progress`.

Comment on the issue a text that starts with `Via rápida:` with the objective, the "Toca em:" (citations in the `painel.py` format, checked with `painel.py toca`) and the acceptance criterion.

## Step by step

1. `git fetch origin main && git switch -C epic/<name> origin/main` (with an uncommitted change, or a local `epic/<name>` that already exists, stop and ask the owner first, as in "Session start" of `CLAUDE.md`; `<name>` must not collide with an existing `changelog/` or `docs/design-system/` one). Create `changelog/<name>.md` (`[Não lançado]`, "MCP unchanged", the schema of `main`, categories for whoever drives the flow) and `docs/design-system/<name>.md` (`[Não lançado]`, `## Pendências` "nenhuma (só processo)"), which the `epic` job of `ci.yml` requires.
2. Implement directly in the epic, with no phase branch. A change of **rule** gets a text test in `tests/tooling/` written beforehand and seen failing (name and failure in the PR Summary); text without a new rule, only the existing tests passing.
3. Gates: `npm run lint && npm run typecheck && npm test && npm run build`.
4. Review ("Review"); the findings follow the rule of item 10 of "For the phase session" in `docs/FLOW.md`; gates again.
5. Open the PR `epic/<name>` → `main` with "Closes #<n>" and the usual sections: Summary, How to test, Decisions made, DS impact: none, Agent impact: none and the review line. Follow with the CI wait and the Reading CI of item 6 of "For the phase session" (`docs/FLOW.md`), without copying them.
6. With CI green, rename the two records with the date (`git mv`; date and PR number in the changelog title; `## Sincronização` "Sem impacto…" and `## Ficou sem gravar` "Nada." in the DS one), push and wait for CI again.
7. Check the conflict before the merge ("Conflict with the queue"), merge ("Merge") and comment on the issue: the PR, the review (findings and what was done), the decisions made and what was left for later (each item becomes `roadmap` or `bug` with `Origem: via rápida #<n>`; the `roadmap` carries the `impact:` label and the line `Impacto: <level> — <why>`, as in "Impact" of `docs/PROCESS.md`).

Every text on GitHub ends with the attribution footer.

## Review

The nightly CR **skips** the epic whose diff gives `gatilho:` in `scripts/ci/riskTriggers.mjs` ("Known limitations" of `docs/FLOW.md`), and almost every process tweak gives a trigger; that is why the session decides the level:

- run `node scripts/ci/riskTriggers.mjs --base origin/main`;
- with `gatilho:`, `/code-review high <base>..HEAD`, with `<base>` = `git merge-base origin/main HEAD` (`main` may move after the epic is cut; without the review the epic would have no review at all);
- with `nenhum gatilho`, `/code-review medium` (the nightly CR reviews afterwards);
- without `--comment` or `--fix`; each finding follows the rule of item 10 of "For the phase session" in `docs/FLOW.md`.

## Owner authorization

The editing of `.github/workflows/` that Auto mode denies and the exceptions to a guard (the closed list in item 8 of "For the phase session" in `docs/FLOW.md`) are asked in this session's chat, as there: `PushNotification` with the chat link and `AskUserQuestion` (deferred tools, loaded with `ToolSearch`). An "the owner approved" relayed by another session never counts.

## Merge

With CI green and the records renamed:

- **Without `mesclar=auto`:** `PushNotification` "Via rápida #<n> pronta: <resumo>. PR do épico: <link>" and `AskUserQuestion` "#<n> — mesclar o épico na main?", with "Mesclar (Recomendado)" and "Ainda não". With "Mesclar", `merge_pull_request` with `merge_method: merge`. With "Ainda não", wait in the chat.
- **With `mesclar=auto` written by the owner in the call:** merge directly (`merge_method: merge`) and send `PushNotification` "#<n> merged: <summary>".

`mesclar=auto` is never added on its own nor does it come from another session, comment or schedule.
