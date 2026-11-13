# Via rápida para ajuste pequeno de processo — [Não lançado] (épico `epic/via-rapida`, PR #0, MCP sem mudança, schema v19)

## Adicionado

- **`painel.py conflito` confere um "Toca em:" contra a fila, só leitura (para quem conduz o fluxo, #1864, VR1):** `python3 .claude/skills/implementar-fila/painel/painel.py conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]…` normaliza e valida as citações como o `toca` e as compara, com o mesmo cálculo da fila, com as etapas começadas e não mescladas da pasta, as que o `show` lista em `começar agora:` e cada `--com` (etapa de fora do painel). Imprime `livre` (código 0, também sem `--pasta` e sem `--com`), uma linha `conflito: <citação> com #N (<status>)` (com `começa agora` ou `fora do painel` no lugar do status, conforme a origem) por etapa em conflito (código 1) ou `inválida: <citação> — <motivo>` (código 2). Nada se grava, o `apply` o recusa como `toca` e `show`, e nenhuma outra saída do `painel.py` muda.
