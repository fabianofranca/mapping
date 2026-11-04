# Guia do testador e auxiliares da nuvem — [Não lançado] (épico `epic/guia-testador`, PR #0, MCP 0.14.0, schema v13)

## Adicionado

- `connectGuide()` (`scripts/testing/cloud.mjs`): conecta no Chrome como o `connect()`, mas na aba do guia (`/guia/`), com os mesmos 5 s nas ações, 15 s nas navegações e o mesmo registro de console.

## Corrigido

- `selectFolder` abre o seletor de leitura ("Selecione uma pasta que este site pode ver", de **Aplicar pasta…**, **Atualizar de pasta…** e **Abrir biblioteca**) e lida com pastas irmãs de nome parecido (`migracao` com `migracao10`): a lista de autocompletar do GTK passa a ser reconhecida com qualquer número de sugestões, o campo do caminho é limpo antes de digitar e o clique no **Open** muda de ponto se a lista não fechar. Se ainda assim o seletor ficar aberto, o erro diz "lista de autocompletar aberta (pastas irmãs com o mesmo começo)".
