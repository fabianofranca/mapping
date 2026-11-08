# Watcher no workspace — [Não lançado] (épico `epic/watcher-no-workspace`, PR #0, MCP 0.28.2, schema v18)

## Adicionado

- Cada release do MCP traz também o `watch-comments.mjs` (o watcher que acorda o agente quando uma conversa passa a aguardá-lo), e o `setup.sh` o instala e atualiza na raiz do workspace, conferindo o `sha256` como os demais arquivos. O resumo do `setup.sh` ganha a linha `Watcher:` (`instalado`, `atualizado`, `sem mudança` ou `não atualizado (release sem o watcher)`).
- Os workspaces existentes recebem o arquivo rodando `./setup.sh` de novo; quem ainda tem o `setup.sh` de antes da etapa "Workspace atualizado" usa a linha da transição do `README.md` do `examples/workspace/`. Releases anteriores à 0.28.2 não têm o arquivo: o `setup.sh` avisa e mantém a cópia local.
