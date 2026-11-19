# Canary baseline — [Não lançado] (épico `epic/canary-baseline`, PR #0, MCP unchanged, schema v21)

## Adicionado

- `painel.py canario <folder> base <id> <old folder> [fonte=<text>]`: freezes a canary's baseline from an old panel (read-only), summarized with the old panel's own ruler, and prints `base: <k> sessões`; `--nenhuma` declares that there is none. The `import` freezes the baseline by itself (`fonte: import`).
- The tester and the retest are compared by the cost per tested step (`passos`, `usdPorPasso`; `resumo.medida` says `passo` or `sessão`), so a smaller block no longer looks like a saving.
- The signals `xFalso` (false ❌) and `naoExec` (steps not executed) in `sinal` and `uso`, and their rates (`xFalsoPct`, `naoExecPct`) in the tester sides of the canary summary. They are recorded and shown, never part of the rework ruler or of the verdict.
- `show` ends each canary entry with its verdict and, for `sem base`, asks to run `canario base`.

## Corrigido

- A canary on a panel with no "before" session (a queue opened with `painel=novo`, or an imported panel) said `não promover` whatever it did; with an empty baseline it now says `sem base`.
- The `import` dropped the sessions a canary had counted, so `k/n` went back to 0 and both sides of the summary came out empty; the canary's sessions now come over (the other sessions of the same stages without `cost`), and so does its side.
