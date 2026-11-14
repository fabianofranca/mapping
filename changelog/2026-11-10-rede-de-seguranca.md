# Queue safety net — 2026-11-10 (épico `epic/rede-de-seguranca`, PR #1434, MCP 0.30.0 unchanged, schema v18)

## Adicionado

- `scripts/ci/riskTriggers.mjs --base <ref>`: decides the triggers of `/code-review high` in the epic's Closing. It prints `gatilho: <id>: <arquivos>` for each trigger hit, or `nenhum gatilho`; a usage error exits with 2. It covers the risk paths (skills `implementar-fila` and `detalhar-backlog`, `painel.py`, `docs/FLOW.md` and `docs/PROCESS.md` for any change, workflows, release, `mcp/version.ts`, `src/store/session.ts`, `pwa/csp.ts`) and the change of a schema or format version constant in `src/model/` (`git diff -G`, with a suffix such as `COMPONENT_FORMAT_VERSION_REPEAT`); the `formatVersion` of the JSON files in `libraries/` and the arrays of accepted versions do not count. A renamed trigger file still counts (`--no-renames`).
- `painel.py`: `wait` field in the queue row for the child waiting for the coordinator. `show` does not list it as overdue and prints `esperando o coordenador: …` (or `nenhuma`). Changing or clearing `child` also clears the `wait`.
- `tests/support/textSlice.ts` (`section` and `between`): text slices that throw an error when an anchor is missing.

## Alterado

- `implementar-fila`, "Fechamento": the "safety net" item runs `riskTriggers.mjs` and decides by the `gatilho:` line, with no list of paths of its own. `detalhar-backlog` gains the sentence that the script and the "Esforço do detalhamento" list change together.
- `implementar-fila`, "Conferências de reserva": the `review_ready` or `idle` child with a `send_later` still to fire (or fired less than 5 min ago) only gets `childAt=now`, without a message; the worst case of detection (~60 min, ~90 min right after being created or nudged) is written down. "Por etapa" › 2 says when the `wait` is written and cleared.
- `implementar-fila`, "Troca de sessão": rereading the small skill is done with `Read` without `offset` or `limit`, with the proof "skill <commit>: relido inteiro, <n> linhas", and it is neither delegated nor summarized (new item in "Economia de contexto").
- `dist/index.html` ceiling: the automatic raise (of 16 KiB) only applies with an excess of up to 14 KiB (14,336 bytes), so that at least 2 KiB of margin is left; above that `distBudget.mjs` calls the owner.
- `tests/tooling/queuePanel.test.ts` and `queueNoWait.test.ts`: no slicing by `indexOf`, no fragile counts and no `const process` shadowing the global.

## Corrigido

- `docs/FLOW.md`: the paragraph "Para implementar em sequência" still said "more than 30 lines or rule sections" for the large new skill; it becomes "more than 60 changed lines or a change in "Regras desta fila"", with the reread by `Read` and the proof in the `log`.
