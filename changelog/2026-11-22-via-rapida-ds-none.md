# Step 6 of the fast-track skill writes `None.` in the DS record — 2026-11-22 (épico `epic/via-rapida-ds-none`, PR #2584, MCP unchanged, schema v23)

## Corrigido

- Step 6 of the `via-rapida` skill now tells the session to write `None.` in `## Ficou sem gravar` of the DS record, in English like the sibling records; the Portuguese `Nada.` is gone. `Sem impacto…` stays in `## Sincronização`, which the DS log test requires, and a text test checks both.
