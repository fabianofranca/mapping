# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`, PR #786, MCP 0.28.0, schema v18)

## Adicionado

- Formato 4 do componente, com `stroke.cap` (ponta do traço), `stroke.join` (canto) e `stroke.sides` (traço só em alguns lados de um quadro ou retângulo).
- `repeat.distribute` (formato 4): com `"fill"`, a lista ocupa o espaço do pai e as linhas dividem a altura (ou a largura) por igual, menos os `gap`s.
- Expressão em `layout.type`, `layout.align`, `layout.justify`, `width` e `height` (formato 4), em quadro e em slot; um valor fora do conjunto vale o padrão e o desenho avisa `valor inválido em <chave>: <valor>`.
- `minWidth`, `maxWidth`, `minHeight` e `maxHeight` em qualquer nó (formato 4): o `fill` que bate no limite congela e a sobra vai para os outros `fill`, como no flexbox; `min` maior que `max` é erro de validação.
- `font.wrap` (`"word"` ou `"none"`, uma linha só), `font.ellipsis` (`…` no texto que não cabe) e `font.maxLines` (formato 4); o raster do MCP e a medida aproximada respeitam as três.
- Texto rico (formato 4): o nó `text` aceita `runs` no lugar de `text`, uma lista de trechos com peso, itálico, cor, decoração, família e tamanho próprios, que quebram linha juntos como um texto só. Um trecho com `background`, `radius` e `padding` vira uma caixa em linha (o chip): inquebrável, vai inteira para a linha de baixo quando não cabe e acompanha o texto. A app desenha o texto rico; o MCP (`get_marking_image`) mostra por enquanto barras por pedaço e o fundo do chip.
- Aviso `texto maior que a caixa: <nó>` (as linhas quebradas passam da altura do nó e nada as corta), que entra na pendência "o componente não cabe".
- Aviso `texto medido com largura 0: <nó>` na prova de desenho do `validate_library` e no desenho do componente.
- `tokens` na especialização (`formatVersion` 15): valores de design nomeados (cor, número, família de fonte), simples ou por modo (`light`/`dark`), e `{ "$token": "nome" }` no componente (formato 4), onde se aceita cor, número ou família de fonte, inclusive como resultado de `$switch` e `$if`. O `validate_library` recusa token inexistente ou de tipo errado, com o caminho do nó. O modo do desenho escolhe o modo (ver abaixo); sem escolha, vale o primeiro.
- Tokens embutidos `font-sans` e `font-mono` (famílias), que valem a fonte do tema do hospedeiro e podem ser redefinidos nos `tokens` da especialização.
- Modo do desenho do projeto e do container (schema v18): o controle **Modo do desenho** em **Configurações** escolhe o modo dos `tokens` (`light`, `dark`…) com que os componentes são desenhados, e o campo **Modo do desenho** nos Detalhes do container fixa outro modo para ele (ou segue o projeto). Sem modo, vale o primeiro de cada especialização. O Diagnóstico avisa o modo gravado que nenhuma especialização declara.
- MCP: a op `update_project` do lote troca o modo do desenho do projeto; `add_container` e `update_container` aceitam `drawingMode`.
- Visualizador embutido: a opção `drawingMode` (e a prop do `<MappingViewer/>`) escolhe o modo dos tokens; mudá-la em tempo de execução (`update({ drawingMode })`) redesenha sem recarregar a biblioteca nem a tela.
- Conjunto de ícones da biblioteca (`formatVersion` 15 da especialização): `icons` na raiz aponta para um arquivo `.json` do pacote (`mapping-icons`: `viewBox` e ícones por nome, cada um com seus caminhos, traço, cor e ponta) e o nó `icon` do componente (formato 4) o lê por `name` (literal ou campo), com `color` e `strokeWidth`; `hug` mede o `viewBox`. Um nome que não está no conjunto desenha o reservado tracejado com o aviso `ícone desconhecido: <nome>`. O `validate_library` confere o arquivo, recusa nome literal fora do conjunto e avisa a opção de `enum` fora dele, na app e no MCP.
- Desenho em tamanho de tela (formato 4): `screen: { anchor }` na raiz do componente (nove âncoras) desenha o template no `size` em pixels de tela, em qualquer zoom, ancorado no retângulo da marcação, e `stroke.scale: false` mantém a largura do traço em pixels de tela.
- Tipo estrutural (`formatVersion` 15 da especialização): `"structural": true` no tipo de anotação agrupa sem desenhar; a marcação não mostra o nome no canvas, não conta como "sem componente" e `structural` junto de `component` é erro de validação.
- MCP: as tools `render_marking` e `render_container` devolvem um PNG do desenho dos componentes (da marcação com a subárvore, ou do container inteiro) com `zoom`, `drawingMode` e `background`. A imagem do desenho no MCP passou a ter texto de verdade (fonte livre embutida, Mapping Sans e Mono, ou a `fonts` da biblioteca), com quebra, `…` e trechos, sombra desfocada, tracejado, `align` do traço, `cap`/`join`, `sides` e ícones.
- Marcações de tipo com componente a partir de 1 px, no app, no `create_marking`/`update_marking` do MCP e ao abrir o projeto (o `minSize` do componente continua valendo).
- MCP: prova de desenho por instância em `plan_changes` e `propose_changes`: o componente de cada marcação que o lote cria ou altera é desenhado no retângulo e com os valores reais, no modo efetivo do container, e o "não cabe" volta em `issues.new` como `component-overflow` (`kind`, o nó, quanto falta em px, `(aproximado)` quando a biblioteca não declara `fonts`). É aviso: não bloqueia o lote nem a proposta.
- MCP: `operationsFile` em `plan_changes` e `propose_changes`: o lote vem de um `.json` dentro das raízes, no lugar de `operations` (para telas medidas com centenas de operações). Os dois juntos, ou nenhum, é `invalid-arguments`; fora das raízes, `outside-roots`; JSON inválido, `invalid-arguments` com a posição.
- Origem medida (`formatVersion` 15 da especialização): `origins[].kind` (`tree`, o padrão, ou `measured`). A `measured` declara só `system`, `kind`, `name` e `booleans`, e as `sources` dos tipos e dos campos do sistema dizem como casar cada nó da árvore medida (o `id` e as classes ou o `type` do nó contra o `id` e o `name` do tipo; o `path` do campo nas `props`, com `values` nos `enum`).
- MCP: a op `import_measured` do lote (`container`, `system`, `tree` inline ou `file` de um `.json` dentro das raízes, `offset`, `scale`) traduz uma árvore de retângulos medidos (`{ type, id?, classes?, rect, props?, children? }`) em marcações com anotação tipada. O pertencimento sai da geometria; nó sem tipo e retângulo vazio são ignorados com aviso (os filhos seguem); a prova de desenho avisa o que não cabe (`component-overflow`).
- Guia do agente: exemplo de captura com o Playwright (mede o DOM de uma página aberta e grava a árvore num `.json`) e a biblioteca de exemplo `examples/libraries/medido/`.

## Alterado

- Schema v18: `drawingMode` opcional na raiz e em cada container. A migração v17 → v18 só sobe o número; um app anterior abre o arquivo v18 somente para leitura.
- O recorte da raiz do componente passa a incluir o traço `outside`/`center` e a sombra (em todas as versões do formato).
- O raster do MCP (`get_marking_image`) passa a respeitar a ponta, o canto e os lados do traço.
- `get_marking_image` de um container sem arquivo usa o mesmo desenho do `render_container` (`drawing: "rendered"`, no lugar do `simplified` com o texto em barras).
- `mapping-mcp.js` cresce 447.684 bytes (de 4.773.135 para 5.220.819, o `opentype.js` minificado e as fontes embutidas).
- A fonte padrão do texto sem `font.family` passa a ser a do tema (`font-sans`, e `font-mono` para código) em vez da `Inter` fixa. Bibliotecas cujos textos não declaram `family` mudam de largura de texto (o `hug`, a quebra de linha e o aviso `texto maior que a caixa` seguem a fonte do tema).
- No modo Editar, as bolinhas de camada e o "+N" somem em marcações pequenas que desenham componente (menores que 24 px de tela em largura ou altura); selecionada ou sob o mouse mostra tudo e o alerta ⚠ continua sempre. Marcação sem componente não muda.
- A colocação de uma marcação sem `rect` e o `near` do lote do MCP medem o texto com o medidor do servidor (a fonte embutida e as `fonts` da biblioteca), no lugar da aproximação.

## Corrigido

- O anel `outside` (e o `inside`) do traço no PNG do MCP: o raster desenhava o traço sempre centrado no contorno, ignorando o `align`.
- A verificação "o componente não cabe" ganha tolerância de 1 px por nó de texto: um excesso de fração de pixel entre o DOM e o canvas já não vira pendência.
- Altura de linha do canvas igual à do DOM (conferida no Chromium): `lineHeight` em px não arredonda e o múltiplo não arredonda antes de multiplicar pelas linhas.
- O anel `outside` do traço na raiz do componente, que não aparecia.
- Um texto `fill` numa coluna `hug` quebrava palavra por palavra (letra a letra, com largura 0). Agora o conteúdo é medido em duas passagens, como o flexbox (em todas as versões do formato): o texto quebra em linhas de palavras e o quadro tem a altura delas.
- A janela **Especializações** mostra, na biblioteca, os modos do desenho, os tokens (com o valor de cada modo) e o arquivo do conjunto de ícones.
- O diálogo **Especializações** não mostra mais crases soltas em volta de `formatVersion` (e de `repo` no aviso da migração do schema 11): a interface não interpreta markdown.
- O campo de referência dos **Detalhes** na janela estreita (900 px) deixa de cortar o nome do alvo ("P C…"): o nome da camada do alvo encolhe primeiro e, sem espaço, os botões ir ao alvo e limpar quebram para a linha de baixo.
- Uma biblioteca com origem `kind: "measured"` (como a `medido`) agora abre na app e no MCP: a especialização lida deixava na origem as chaves internas `node` e `screen`, que a própria leitura recusava, e a cópia gravada em `specs/` e a proposta com `apply_specialization` não se relíam (o `import_measured` respondia "origem não declarada como measured").
