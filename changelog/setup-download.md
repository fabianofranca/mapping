# Download do setup.sh — [Não lançado] (épico `epic/setup-download`, PR #0, MCP 0.28.2 sem mudança, schema v18)

## Corrigido

- O `setup.sh` do workspace mostra o motivo quando não consegue baixar (código HTTP), tenta de novo em falhas passageiras e, se o download direto da release falhar, usa a API de assets do GitHub antes de desistir. Quem já tem um `setup.sh` antigo continua com a falha até conseguir um download: o conserto só chega com o script novo (pela autoatualização ou pela linha de transição do `README.md` do workspace) e depois de uma release que o traga; para o 504 do GitHub, o contorno com `gh release download` está em "Se o GitHub não responder", no `README.md` do workspace.
