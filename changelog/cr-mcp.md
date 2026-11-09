# CR do MCP — [Não lançado] (épico `epic/cr-mcp`, PR #1295, MCP 0.28.13, schema v18)

## Corrigido

- `render_marking`, `render_container` e `get_marking_image`: o traço de um caminho fechado cujo último ponto repete o primeiro tem a junção do canto inicial, como o mesmo caminho sem o ponto repetido.
- Caminho SVG com flags de arco coladas, sem separador (`a5 5 0 1110 0`), é lido como no SVG (cada flag é um dígito `0` ou `1`); antes o caminho sumia em silêncio.
- `stroke.scale: false` dá no desenho do servidor a mesma largura da app (em pixels da saída, em qualquer zoom).
- Desenho com mais de 200 mil pontos num mesmo nó não estoura mais a pilha.
- `get_container_file`: imagem JPEG com orientação EXIF não volta mais com os bytes originais (a tag de orientação contradizia as dimensões já giradas do JSON); a imagem é recodificada já girada (`recoded: true`).
- `render_marking` e `render_container` avisam (`warning`) quando o arquivo da imagem tem dimensões diferentes das do projeto, como o `get_marking_image`, e o fundo da região fracionária fica alinhado com o desenho (antes desalinhava até 1 px).

- `update_arrow` numa proposta em revisão (`revise_proposal`) não avisa mais que a mudança "não entra na proposta" quando a seta foi criada pela própria proposta; o aviso vale só para seta que já está no projeto.
- O `as` (ou `annotationAs`) de uma operação igual a um `_as` de linha da mesma operação dá `duplicate-alias`, em vez de sobrescrever o apelido em silêncio.
- `import_measured`: um erro interno (que não é da tool nem do modelo) sobe como erro, em vez de virar aviso "não criada" do nó; os erros da tool e do modelo continuam virando aviso.
- `plan_changes` e `propose_changes` leem o `mapping.json` uma vez só por chamada: uma gravação entre as duas leituras de antes não dá mais `revision-conflict` espúrio.

- `create_project` não sobrescreve mais um `mapping.json` que apareceu na pasta entre a conferência e a gravação: a gravação é exclusiva e o erro é o `already-exists` de sempre.
- Com várias raízes, um projeto citado por caminho (`apps/cadastro`) que só existe na segunda raiz é achado, mesmo que a pasta de mesmo caminho exista (sem projeto) na primeira.
- O bundle `mapping-mcp.js` volta a levar os avisos de licença (Apache-2.0, MIT) das dependências embutidas, no fim do arquivo (`legalComments: 'eof'` e os `LICENSE` dos pacotes); a lista de arquivos da release não muda.
- A descrição de `get_project` diz `repos` (como o código devolve), no lugar de `repo`.

- `wait_for_comment`: uma mensagem de pessoa gravada logo depois de a espera começar é devolvida na mesma espera (antes só aparecia com outra mudança); a espera cancelada pelo cliente sai com o código `cancelled`, e não `not-open`.
- `post_message` e o `thread` de `propose_changes`: se o projeto não puder ser relido depois de a mensagem ser gravada, a resposta é um sucesso com o aviso `reply-incomplete` (antes era um erro, que levava o agente a repetir a mensagem, e a proposta dizia que a mensagem não foi gravada).
- Proposta com `proposal.json` ilegível dá `invalid-proposal` (como o guia diz), e não `proposal-not-found`.

- `validate_library`, `plan_library_update` e o lote que aplica ou atualiza uma biblioteca avisam (`ignored-paths`) quais pastas do pacote a leitura pulou (subpastas além de 8 níveis, ocultas e `node_modules`); antes ficavam de fora sem aviso.
- `plan_library_update` lê o pacote como `validate_library` (sem ler os binários e sem o limite de 500 arquivos da app): um pacote que `validate_library` aceita não é mais recusado pela prévia com `package-too-large`.

## Alterado

- `list_threads` com `text` ou `anchor` e sem `status`/`awaiting` lista as conversas abertas de qualquer `awaiting`, e não mais só as que aguardam o agente (antes omitia conversas sem avisar); sem filtro nenhum continua a caixa de entrada.
- Conversas e propostas: menos trabalho repetido (`list_threads` e `wait_for_comment` leem projeto, conversas e propostas em paralelo e a lista de conversas uma vez só).

- `find_by_code`: cada match traz também `path` (o caminho da pasta do projeto relativo à raiz, como em `list_projects`), para distinguir pastas homônimas.
- Menos trabalho repetido ao ler projetos: `loadProject` interpreta o `mapping.json` uma vez; o catálogo de componentes e as fontes das bibliotecas ficam em cache do processo (por caminho, tamanho e `mtime`: um arquivo trocado no disco invalida); `list_projects` não interpreta fontes; o `realpath` das raízes e a descoberta de projetos são feitos uma vez por chamada de tool.

- `render_*` e `get_marking_image`: menos trabalho repetido (cache de fontes por família, peso e itálico; leitura da imagem confere o tamanho antes de ler e não copia os bytes; a prova do `component-overflow` reaproveita o cache de desenhos).
- `plan_changes` e o lote: menos trabalho repetido (os valores de uma anotação resolvem o tipo uma vez por chamada, os tipos com componente são indexados uma vez e as mudanças são calculadas uma vez por `plan_changes`).
- `list_markings`, `get_marking`, `list_components` e a leitura do pacote: a posição entre as irmãs vem de um índice montado uma vez por chamada, `get_marking` monta a lista de filhas uma só vez e o pacote lido não copia os buffers (saída idêntica).
