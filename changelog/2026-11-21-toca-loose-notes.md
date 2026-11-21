# Standalone notes in a ficha's toca — 2026-11-21 (épico `epic/toca-loose-notes`, PR #2438, MCP unchanged, schema v22 unchanged)

## Corrigido

- For whoever runs the queue: a parenthesized note written as an item of its own in a ficha's `toca=` (`a.ts,(novo),b.ts`) no longer counts as a file, so it no longer holds two stages apart (`arquivo (novo) com #N`, `começar agora: nenhuma` with free slots). `painel.py` drops it in `norm_toca`, so `toca`, `conflito`, `vagas:`, `começar agora:` and the graph stop seeing it, also on a started stage; `show` lists the row in `fichas a refazer:` (waiting and started rows, never a `concluída` or `recusada` one) without holding it. A note after its path (`x.ts (new, helper)`) is handled as before.
