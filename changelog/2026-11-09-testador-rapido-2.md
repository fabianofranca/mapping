# Faster cloud tester, part 2 — 2026-11-09 (épico `epic/testador-rapido-2`, PR #1245, MCP 0.28.11, schema v18)

## Adicionado

- Cloud tester: `node scripts/testing/cloud.mjs run [<project-folder>] [--prazo=<s>]` runs the body of the step script read from standard input (`<<'JS'` heredoc), already connected and with `page`, `browser`, `apoioDir`, `projectDir` and the helpers in scope; it prints the state at the end and exits with 0 (success), 1 (error) or 124 (deadline of 90 s exhausted, adjustable). The "Como agir" section of `docs/TESTING-NUVEM.md` sends every step script through it.
- Cloud tester: `node scripts/testing/cloud.mjs help` lists the commands and the signature of each helper, from a single table checked by a test.
- Cloud tester: `cloud-up.sh` writes the output of `npm ci`, `npm run build` and `npm run build:mcp` to `apoio/build.log` and, if any fails, shows the last 40 lines.
- Cloud tester: `settle(page)` waits for the app to settle (no "Saving…", two frames and 200 ms with no mutation) in place of `waitForTimeout`, now forbidden in step scripts; `state()` calls it before reading.
- Cloud tester: `openWindow(page, id)` and `closeWindow(page, id)` open and close tool windows without toggling; `drag(page, de, para)` drags and warns near a selection handle; `setViewport(page, largura, altura)` adjusts the Chrome window to the requested inner size.
- Cloud tester: `cloud.mjs find <text>` and `find(page, text)` list the candidates for a name; in `run`, a locator timeout or strict-mode error is followed by the list. Appendix A of the guide brings the list of repeated names (Review, Show all, Conversations, Tree, composer, two dialogs) with the locator for each.
- Cloud tester: `node scripts/testing/round-guide.mjs --grupos <scripts>` counts the steps of each item (without R0) and, above 40, proposes up to 5 parallel groups without splitting a script or a dependency chain, with a `grupo k de n: <scripts>` line per group (up to 40, "one session"). `docs/TESTING-NUVEM.md` gains the "Rodada dirigida em grupos" section (chain table, "directed, group k of n" mode, report and `k.n` findings) and `docs/FLOW.md` the per-group message, the 60 min check with the n notices and the summary.

## Alterado

- Cloud tester: the round's environment file is now called `apoio/env.sh` (`source env` ran `/usr/bin/env`); no compatibility with the old name.
- Cloud tester: the setup blocks of the scripts that create a project's folder or write `mapping.json` (R3.8e, R22 and R23) no longer overwrite: an existing folder prints "já existe: o preparo já rodou; não rode de novo" and nothing is erased.
- Cloud tester: the messages in `docs/FLOW.md` now say "R0 inteiro primeiro" in the directed round and "R0 só o R0.1 e os passos de que os achados dependem" in the retest, and the message wins when it diverges from the guide; every directed and block message carries the `Tag da release: <mcp-v…-rc.n, ou "sem R21">` gap.
- Delivery flow: a stage's retest is a single session, with the findings of all groups or blocks and the steps that the fixes affect; a fix merged before the retest starts goes into it. `CLAUDE.md` ("Fluxo automatizado") and the `implementar-fila` skill say this and cite the round in groups.
