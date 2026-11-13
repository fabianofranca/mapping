# Teto do dist/index.html que sempre sobe — [Não lançado] (épico `epic/teto-sempre-sobe`, PR #0, MCP sem mudança, schema v19)

## Alterado

- **Subida do teto do `dist/index.html` (para quem conduz o fluxo, #1802):** o `node scripts/ci/distBudget.mjs raise` sempre sobe o teto, em passos de 16 KiB (`k = ceil((excesso + 2 KiB) / 16 KiB)`, margem de pelo menos 2 KiB), e nunca responde "chama o dono". Quando a subida passa de um limite (excesso acima de 14 KiB, crescimento acima de 32 KiB sobre a `main` ou subidas desde a revisão do dono acima de 64 KiB), o script diz o motivo numa segunda linha, `bug: …`, e com `--write` a frase do `history` ganha ` Acima dos limites: …`, para a fase abrir um `bug` de revisão do dono e seguir sem esperar. Os números dos limites não mudam.
