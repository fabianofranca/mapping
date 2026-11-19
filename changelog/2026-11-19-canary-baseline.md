# Canary baseline — 2026-11-19 (épico `epic/canary-baseline`, PR #0, MCP unchanged, schema v21)

## Adicionado

- `painel.py canario <folder> base <id> <old folder> [fonte=<text>]`: freezes a canary's baseline from an old panel (read-only), summarized with the old panel's own ruler, and prints `base: <k> sessões`; `--nenhuma` declares that there is none. The `import` freezes the baseline by itself (`fonte: import`).
- The tester and the retest are compared by the cost per tested step (`passos`, `usdPorPasso`; `resumo.medida` says `passo` or `sessão`), so a smaller block no longer looks like a saving.
- The signals `xFalso` (false ❌) and `naoExec` (steps not executed) in `sinal` and `uso`, and their rates (`xFalsoPct`, `naoExecPct`) in the tester sides of the canary summary. They are recorded and shown, never part of the rework ruler or of the verdict.
- `show` ends each canary entry with its verdict and, for `sem base`, asks to run `canario base`.

## Alterado

- The coordinator (skill `implementar-fila`) gives a canary that `show` marks `sem base — rodar canario base` its baseline in that cycle: it takes the most recent previous panel (up to 3 tried, then `canario base <id> --nenhuma`) and runs `canario base`; the canary C of the live panel is covered on the first cycle after the merge. Step 3 of "Import" says what the `import` carries.
- Every tester notice carries `<k> not executed`, in every mode (it was only the block mode), and the coordinator records it as `naoExec`.
- The fix notice carries `Achados falsos: <k.n>:<sev> (<roteiro|esperado>), …` (a finding is false when the fix changes only `docs/TESTING.md` or nothing), and the coordinator records one `xFalso=+1` per false finding on the tester session it came from.
- The "Canaries" block of the queue panel page shows the cost per tested step on both sides, the false ❌ and not executed rates of the tester roles (a missing figure is "—") and the source of the "before" (`sem base` stays neutral).

## Corrigido

- A canary on a panel with no "before" session (a queue opened with `painel=novo`, or an imported panel) said `não promover` whatever it did; with an empty baseline it now says `sem base`.
- The `import` dropped the sessions a canary had counted, so `k/n` went back to 0 and both sides of the summary came out empty; the canary's sessions now come over (the other sessions of the same stages without `cost`), and so does its side.
