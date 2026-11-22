# Cloud tester guide and helpers — [Não lançado] (épico `epic/tester-guide-gaps`, PR #2450, MCP unchanged, schema v23)

Schema unchanged.

## Alterado

- The report template (`docs/TESTING.md`, section 10) gives each finding a `- Cause: `produto`|`roteiro`` line, and the Summary counts `roteiro` apart. The batch subagent's `relato-<batch>.md` and its return line (`findings: <code severity cause short title…>`) carry the cause too, so the main session counts `roteiro` without opening the file (#2264).
- `docs/TESTING-NUVEM-CONSULTA.md` states the batch subagent's model: the `Agent` tool with `model: "sonnet"` and medium effort, whatever the session's model (#2364).
- Group and batch numbers no longer mix: a batch's `Mode:` line is copied verbatim from the message, the `Batch:` line carries the `batch k of n` of `--faixas`, and the `k` of `grupo k de n` comes only from the message (#2450).
- `cloud.mjs passo` brings, after the rows of a step or range, the labeled Setup blocks of its steps (`The batch of R<n>.<k>` / `The calls of R<n>.<k>` followed by a code fence), so `passo R17.41-R17.48` prints the R17.48 batch without `--preparo`. The R17.4 batch paragraph in `docs/TESTING.md` now starts with `The batch of R17.4 (` and a test requires a labeled block for every "batch above" or "calls above" step (#2450).
- `scripts/testing/slots.mjs` gives the R17.55 batch (`propose`) and the R17.57 and R17.58 calls (`render`, `a11y`, from the `list_markings` output of **Slots**) and the file names of each step (`names 57 | 58a | 58b`), so the tester builds nothing from the step text. R17.55 states that each offset is (x, y) from the parent's top-left corner and lists the three `component-overflow` notices that its empty values produce (#2450).
- `cloud.mjs run` and `exec` fail loudly on an un-awaited async `check`: `check(...)` returns a thenable, and an async condition (a promise, an async function or a function returning a promise) that nobody awaited prints `❌ <label> — not awaited: write await check(...)` and the `run` exits 1, even when the condition is true; sync checks work without `await`. `docs/TESTING-NUVEM.md` and `docs/TESTING-NUVEM-CONSULTA.md` say `await check(...)`, always, and a `not awaited` ❌ is not a finding (#2450, decision 8).
