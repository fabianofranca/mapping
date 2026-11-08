# Pacote do visualizador e CI na troca de base — 2026-11-08 (épico `epic/viewer-pacote-ci`, PR #1067, MCP sem mudança, schema v18, sem mudança)

## Corrigido

- `mapping-viewer` (0.4.1): as declarações de tipo não importam mais pacotes não declarados. `konva` passa a `peerDependencies` (só pelos tipos; o bundle continua com a cópia embutida) e `@preact/signals` saiu do grafo de declarações. O hospedeiro compila com `skipLibCheck: false`.
- `loadLibraryFromUrl` baixa também o arquivo de ícones da especialização (`icons`), com ou sem `fonts: false`. Antes, a biblioteca carregada por URL ficava sem ícones e `problems` citava "arquivo de ícones não encontrado".
- O CI do PR roda de novo quando a base do PR muda (por exemplo, de `epic/*` para a `main`), de modo que o check `epic` deixa de ficar verde sem conferir a nova base. Edição só de título ou corpo não dispara o CI.
