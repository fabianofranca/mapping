# CR do MCP — [Não lançado] (épico `epic/cr-mcp`, PR #0, MCP 0.28.13, schema v18)

## Corrigido

- `render_marking`, `render_container` e `get_marking_image`: o traço de um caminho fechado cujo último ponto repete o primeiro tem a junção do canto inicial, como o mesmo caminho sem o ponto repetido.
- Caminho SVG com flags de arco coladas, sem separador (`a5 5 0 1110 0`), é lido como no SVG (cada flag é um dígito `0` ou `1`); antes o caminho sumia em silêncio.
- `stroke.scale: false` dá no desenho do servidor a mesma largura da app (em pixels da saída, em qualquer zoom).
- Desenho com mais de 200 mil pontos num mesmo nó não estoura mais a pilha.
- `get_container_file`: imagem JPEG com orientação EXIF não volta mais com os bytes originais (a tag de orientação contradizia as dimensões já giradas do JSON); a imagem é recodificada já girada (`recoded: true`).
- `render_marking` e `render_container` avisam (`warning`) quando o arquivo da imagem tem dimensões diferentes das do projeto, como o `get_marking_image`, e o fundo da região fracionária fica alinhado com o desenho (antes desalinhava até 1 px).

## Alterado

- `render_*` e `get_marking_image`: menos trabalho repetido (cache de fontes por família, peso e itálico; leitura da imagem confere o tamanho antes de ler e não copia os bytes; a prova do `component-overflow` reaproveita o cache de desenhos).
