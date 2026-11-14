# Content edges outside the image — 2026-11-10 (epic `epic/arestas-fora-da-imagem`, PR #1417, MCP 0.30.0, schema v18)

## Adicionado

- MCP: `add_container` accepts `beside` (reference, id or `$alias` of a container): the new one is born to its right (right edge + gap), with the top aligned and the **same `scale`**; an occupied spot goes to the nearest free space, keeping the scale. Exclusive with `center` (`invalid-arguments`). Works with `file` and with a background; the guide's batch ("Conteúdo fora da imagem") now uses it.

## Alterado

- MCP: `backlinks` of `get_marking`/`get_annotation` now groups by source: one entry per source annotation, `{ from, fromLabel, fromMarking, fields: [{ field, row, column, to }] }`. Breaks whoever read `field` or `to` directly on the entry.
- MCP: `refs` and `backlinks` carry `row` (0-based row index, as in `get_code_hints`) and `column` of a table cell, or `null` in both when the `ref` is a field. The `field` text stays as read in the app (1-based).

## Corrigido

- At 900×720 the value of a reference shows the whole target name; what does not fit appears in the tooltip.
- In the table, the Clear ✕ of the `ref` cell no longer covers the target label and "(broken reference)" appears whole (what does not fit goes to the tooltip); the `ref` column splits the table like the others, with no horizontal scroll (CL2), and the broken reference breaks between words. At 900×720 the target name in the `ref` field no longer loses a fraction of a pixel to the layer.
