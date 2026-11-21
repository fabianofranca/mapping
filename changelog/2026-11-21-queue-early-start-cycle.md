# Early start in the same cycle, and the `toca=` note rule — 2026-11-21 (épico `epic/queue-early-start-cycle`, PR #2429, MCP unchanged, schema v22 unchanged)

## Corrigido

- `implementar-fila` runs `painel.py show` and starts each stage of `começar agora:` in the same cycle that writes `stage: Testador`, `stage: Correção`, `stage: Fechamento` or `status="esperando entrega"`, instead of waiting for the hourly check or a supervisor request (#2427).
- "Stage ficha" says a note in parentheses stays right after its path (`x.ts (novo)`) and is never a comma-separated item of its own, which `painel.py` read as a citation and held two stages on (#2427).
