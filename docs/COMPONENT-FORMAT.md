# Formato do componente (`mapping-component`, `formatVersion` 1)

O formato do arquivo que desenha um tipo de anotação: um **componente**. É para quem escreve um à mão ou gera um (a skill `spec-author` e os agentes). O componente vive dentro do pacote de uma biblioteca (ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Biblioteca: o pacote"); este documento descreve só o arquivo dele.

Arquivos de apoio:

- `docs/component.schema.json`: JSON Schema (draft 2020-12) da estrutura. É documentação: a fonte da verdade é o código (`src/model/components/parseComponent.ts`), e um teste confere o schema contra os componentes do Material 3 e contra o parser.
- `examples/libraries/material3/components/*.json`: quinze componentes reais (os exemplos deste documento saem deles, encurtados).
- O motor que lê o formato: `src/model/components/` (`componentFormat.ts`, `parseComponent.ts`, `expressions.ts`, `instantiate.ts`, `layout.ts`, `arrange.ts`, `origin.ts`). Puro, sem DOM: roda no navegador e no Node.

## O que é um componente

Um componente é o **desenho genérico** de um tipo de anotação: uma árvore de primitivas neutras (quadro, retângulo, elipse, texto, caminho e slot) cujos atributos podem ser **ligados aos campos** do tipo por expressões. Trocar o valor de um campo redesenha o componente.

- **Um arquivo por componente.** O tipo da especialização só o referencia, com a chave `component` (`"component": "components/m3-button.json"`).
- O caminho é **relativo ao arquivo da especialização**, com `/`, sem `..`, sem `/` no começo e sem unidade de disco, e termina em `.json`.
- O `id` do componente **não** precisa ser igual ao `id` do tipo que o referencia. Um mesmo arquivo citado por dois tipos gera um aviso do validador da biblioteca.
- O componente **não declara campos**: eles vêm do tipo. O arquivo só diz como os valores aparecem no desenho (`preview` traz valores de exemplo).
- Um tipo sem `component` continua valendo, só não tem desenho.

## A raiz do arquivo

```json
{
  "format": "mapping-component",
  "formatVersion": 1,
  "id": "m3-button",
  "name": "Button",
  "description": "Botão com rótulo; hug na largura, 40 de altura.",
  "size": { "width": 120, "height": 40 },
  "minSize": { "width": 48, "height": 40 },
  "sizing": { "width": "hug", "height": 40 },
  "preview": { "label": "Label", "variant": "filled" },
  "template": {
    "type": "frame",
    "name": "button",
    "layout": {
      "type": "row",
      "padding": [0, 24],
      "align": "center",
      "justify": "center"
    },
    "cornerRadius": 20,
    "fill": {
      "$switch": "variant",
      "cases": { "filled": "#6750A4", "tonal": "#E8DEF8" },
      "default": "rgba(0, 0, 0, 0)"
    },
    "children": [
      {
        "type": "text",
        "name": "rótulo",
        "text": { "$field": "label", "default": "Label" },
        "font": { "family": "Roboto", "size": 14, "weight": 500, "lineHeight": 20 },
        "color": {
          "$if": { "$eq": ["variant", "filled"] },
          "then": "#FFFFFF",
          "else": "#6750A4"
        }
      }
    ]
  }
}
```

| Propriedade     | Obrigatória | Descrição                                                                                                                                                 |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | sim         | Sempre `"mapping-component"`.                                                                                                                             |
| `formatVersion` | sim         | Sempre `1`. É a única versão do formato de componente.                                                                                                    |
| `id`            | sim         | Texto no padrão `^[a-z0-9][a-z0-9-_]*$`.                                                                                                                  |
| `name`          | sim         | Nome exibido, não vazio.                                                                                                                                  |
| `description`   | não         | Texto de ajuda.                                                                                                                                           |
| `size`          | sim         | `{ width, height }`, números positivos (px). Tamanho **inicial** da instância e, sem `sizing`, o tamanho dos dois eixos na arrumação por tamanhos.        |
| `minSize`       | não         | `{ width, height }`, positivos e **não maiores** que `size`. Piso do redimensionamento e de todo tamanho calculado.                                       |
| `sizing`        | não         | `{ width?, height? }`: dimensionamento de uma instância **sem retângulo** (ver "Dimensionamento").                                                        |
| `preview`       | não         | Valores de exemplo dos campos (`chave` → texto, número ou `null`), usados ao criar uma instância e na prova de desenho. Os campos vêm do tipo, não daqui. |
| `template`      | sim         | A raiz do desenho. Precisa ser um nó `frame`; ocupa o retângulo inteiro da instância.                                                                     |

Qualquer outra chave na raiz é problema (o formato é estrito).

## Nós do template

Cada nó tem `type` (`frame`, `rect`, `ellipse`, `text`, `path` ou `slot`) e as chaves comuns abaixo. As chaves de cada tipo vêm depois. **Chave desconhecida é problema**, para que erro de digitação apareça.

| Chave             | Descrição                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | Nome do nó (aparece nos avisos e na árvore). Opcional.                                                                                                                                                                                                                          |
| `visible`         | Expressão booleana (ver "Expressões e condições"). Nó invisível não ocupa lugar nem entra na arrumação. Padrão: visível.                                                                                                                                                        |
| `opacity`         | Número de 0 a 1 (aceita expressão). Padrão 1.                                                                                                                                                                                                                                   |
| `width`, `height` | Tamanho do nó (ver "Dimensionamento"): px, `"fill"`, `"hug"` ou `"NN%"`.                                                                                                                                                                                                        |
| `anchors`         | `{ left?, right?, top?, bottom?, centerX?, centerY? }`. Só tem efeito quando o pai é um quadro com `layout: none`.                                                                                                                                                              |
| `fill`            | Cor CSS (`#rrggbb`, `#rrggbbaa`, `rgba(...)`), `"none"` ou gradiente `{ "type": "linear", "angle": 90, "stops": [{ "offset": 0, "color": "#fff" }, …] }` (ao menos 2 paradas, `offset` de 0 a 1; 0° vai da esquerda para a direita e 90° de cima para baixo). Aceita expressão. |
| `stroke`          | `{ color, width?, align?, dash? }`. `color` é obrigatório e aceita expressão; `width` padrão 1; `align` `inside` (padrão; `center` no `path`), `center` ou `outside`; `dash` é a lista de comprimentos. Cor `"none"` desliga.                                                   |
| `shadow`          | `{ color, x?, y?, blur? }`. `color` é obrigatório (`"none"` desliga); `x` e `y` em px; `blur` maior ou igual a 0.                                                                                                                                                               |
| `cornerRadius`    | Número maior ou igual a 0 ou lista de 4 (superior-esquerdo, superior-direito, inferior-direito, inferior-esquerdo). Aceita expressão. Vale em `frame` e `rect`.                                                                                                                 |

### `frame`

O nó que agrupa. Os filhos ficam em `children` e se distribuem conforme o `layout`.

| Chave      | Descrição                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `layout`   | `{ "type": "none" }` (padrão), `row` ou `column` (ver "Dimensionamento").                             |
| `children` | Lista de nós.                                                                                         |
| `clip`     | Recorta os filhos na caixa do quadro. Padrão `true` na raiz do template e `false` nos demais quadros. |

### `rect` e `ellipse`

Só as chaves comuns. `rect` aceita `cornerRadius`.

### `text`

| Chave   | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`  | Obrigatório. Texto ou número, ou expressão (`$field`, `$concat`…). Número vira texto; vazio vira texto vazio.                                                                                                                                                                                                                                                                                                                           |
| `color` | Cor do texto (aceita expressão). Padrão `#000000`; `"none"` esconde.                                                                                                                                                                                                                                                                                                                                                                    |
| `font`  | `{ family?, size?, weight?, italic?, lineHeight?, letterSpacing?, align?, verticalAlign?, decoration? }`, todos aceitando expressão. Padrões: `size` 14, `weight` 400 (de 100 a 900), `italic` falso, `lineHeight` 1,2, `letterSpacing` 0, `align` `left`, `verticalAlign` `top`, `decoration` `none` (`underline` ou `line-through`). `lineHeight` até 3 é múltiplo do tamanho; acima disso é px. Sem `family`, o desenho usa `Inter`. |

O texto **quebra linha** quando o nó tem largura definida (px, `fill` ou `%`) e **não quebra** quando a largura é `hug`. Sem `width` e `height`, o texto é `hug` nos dois eixos (todos os outros nós são `fill`).

### `path`

| Chave      | Descrição                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `d`        | Obrigatório. Dados de caminho SVG, ou expressão (um `$switch` troca o ícone).                                          |
| `viewBox`  | Obrigatório. `[largura, altura]` positivos: a caixa em que `d` foi desenhado; o caminho é escalado para a caixa do nó. |
| `fillRule` | `nonzero` (padrão) ou `evenodd`.                                                                                       |

Escala diferente nos dois eixos (caixa do nó com outra proporção que o `viewBox`) estica o ícone e gera um aviso.

### `slot`

O espaço reservado para outras instâncias: a **marcação filha** de uma marcação com este tipo é desenhada dentro do slot. Um componente com slot é um **container**.

| Chave    | Descrição                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`  | Texto do rótulo do slot (aceita expressão). Padrão: o `name` do nó.                                                                                                             |
| `layout` | Como as filhas se organizam: `row` ou `column` (com `gap`, `padding`, `align`, `justify`) ou `none`/ausente (cada filha fica onde está). `gap` e `padding` podem vir de campos. |

O slot é o espaço; quem é desenhado dentro dele são as filhas. `width`, `height` e `anchors` dele funcionam como em qualquer nó. Um slot invisível (`visible` falso) ignora as filhas.

## Dimensionamento

Há três perguntas diferentes: **quanto mede a instância** (a raiz), **quanto mede cada nó dentro do template** e **como as filhas de um container se arrumam**.

### A instância: `size`, `minSize` e `sizing`

- `size` é o tamanho **inicial** da instância, em px, e vale quando a instância **tem retângulo** (uma marcação no editor, um `*.screen.json`): o retângulo da marcação manda e o template se adapta a ele.
- `minSize` é o piso. Nenhum tamanho calculado fica abaixo dele (nem o `fill` dividido, nem o `hug`).
- `sizing` só vale quando a instância chega **sem retângulo**, isto é, numa tela vinda de um JSON externo (origem, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Origens") ou arrumada por `layoutScreen`. Cada eixo é:
  - **px**: tamanho fixo;
  - **`"fill"`**: ocupa o espaço que o pai dá naquele eixo;
  - **`"hug"`**: o tamanho do conteúdo (o template medido e, num container, os filhos já arrumados);
  - **eixo ausente** (ou `sizing` ausente): os px de `size` naquele eixo.

```json
"size": { "width": 360, "height": 200 },
"minSize": { "width": 160, "height": 96 },
"sizing": { "width": "fill", "height": "hug" }
```

O cartão do Material 3 ocupa a largura da coluna em que está e tem a altura do que carrega. Um botão `{ "width": "hug", "height": 40 }` tem a largura do rótulo e 40 de altura.

### Um nó do template: `width` e `height`

| Valor    | Significado                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| número   | px fixos.                                                                                                                                                                                         |
| `"fill"` | Ocupa o que sobra no pai. Em `row`/`column`, no eixo principal, divide o que sobra com os outros `fill`; no eixo cruzado e em `layout: none`, ocupa a área de conteúdo do pai (menos as âncoras). |
| `"hug"`  | O tamanho do conteúdo: texto medido, quadro que abraça os filhos, caminho = `viewBox`, retângulo, elipse e slot = 0.                                                                              |
| `"NN%"`  | Fração da **área de conteúdo** do pai (sem o padding).                                                                                                                                            |
| ausente  | `hug` para texto e `fill` para todo o resto, nos dois eixos. Num pai `none`, um filho sem tamanho e sem âncoras ocupa o pai inteiro.                                                              |

### Layout de um quadro

`layout.type` é `none` (padrão), `row` (filhos lado a lado) ou `column` (filhos empilhados).

| Chave     | Valores                                                                                   | Descrição                                                             |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `gap`     | número maior ou igual a 0 (aceita expressão)                                              | Espaço entre filhos, no eixo principal.                               |
| `padding` | número, `[vertical, horizontal]` ou `[cima, direita, baixo, esquerda]` (aceita expressão) | Margem interna. Entra no tamanho `hug` do quadro.                     |
| `align`   | `start` (padrão), `center`, `end`, `stretch`                                              | Posição no eixo **cruzado**.                                          |
| `justify` | `start` (padrão), `center`, `end`, `space-between`                                        | Posição no eixo **principal** (largura em `row`, altura em `column`). |

Dentro de um template:

- **`hug` num quadro**: o conteúdo é medido primeiro (com `fill` e `%` valendo 0) e o resultado vira o tamanho do quadro; depois `fill` e `%` são resolvidos contra ele. Só o `fill` no eixo **principal** de um quadro `hug` avisa (`fill dentro de hug vira 0`), porque ali o resultado é mesmo 0.
- **`fill` no eixo principal** divide o que sobra (conteúdo menos tamanhos fixos menos `gap`s) por igual entre os filhos `fill`; o que sobra nunca é negativo.
- **`align: stretch`** estica o filho no eixo cruzado até a área de conteúdo (um `hug` com `stretch` vira `fill`); a posição `center` e `end` usa o tamanho do filho.
- **`justify: space-between`** reparte a folga entre os filhos (com um filho só, não faz nada).

### Âncoras (`layout: none`)

Num quadro `none` os filhos não se empilham: cada um parte do canto de cima à esquerda, a menos que tenha `anchors`, uma distância fixa da borda, como as constraints do Figma.

```json
{
  "type": "ellipse",
  "name": "alça ligada",
  "width": 24,
  "height": 24,
  "anchors": { "right": 4, "centerY": true },
  "fill": "#FFFFFF"
}
```

- `left`/`right` (e `top`/`bottom`) são distâncias em px da borda. **Com os dois lados**, o filho se estica entre eles, mesmo que tenha tamanho fixo (`left` + `right` e `top` + `bottom` fazem o filho ocupar o pai inteiro menos as distâncias).
- `centerX` e `centerY` centralizam no eixo e ignoram `left`/`right` ou `top`/`bottom`.
- Âncoras fora de um pai `none` não têm efeito.

### Arrumação por tamanhos de uma tela

Quando a tela chega **sem geometria** (um JSON de backend, por exemplo), `layoutScreen` calcula **tamanhos e posições** a partir do `sizing` de cada componente. A entrada é uma árvore de nós (tipo, valores, filhos) mais as raízes da tela; a saída é a tela com o retângulo de cada instância.

A tela é o **container raiz**, em coluna, sem padding nem gap. As regras:

- **Spec por eixo**: `sizing[eixo]`, ou `size[eixo]` se ausente. Todo tamanho final respeita `minSize`.
- **`hug` é arredondado para cima** (o inteiro seguinte), para o texto não quebrar por arredondamento. O resto fica exato.
- **Container** é um componente com `slot`; o layout do slot (`row`, `column` ou `none`, com `gap`, `padding`, `align` e `justify`) arruma os filhos. O `hug` de um container mede os **filhos já arrumados**, então a altura do cartão cresce com o texto que ele carrega.
- **`fill` no eixo principal dentro de pai `hug`** não tem de onde tirar tamanho: o filho **cai em `hug`**. Numa `column` `hug` isso gera o aviso `<id>: fill dentro de hug: usando hug`; numa `row` `hug`, a largura `fill` também cai em `hug`, **sem aviso**. No eixo cruzado de uma `row` `hug`, os filhos `fill` recebem a maior altura dos outros filhos.
- **`stretch` só afeta filhos `hug`** (um filho de tamanho fixo mantém o seu). Um filho `hug` numa `column` é limitado à largura do conteúdo.
- **Slot invisível** (`visible` falso) **ignora os filhos**, com o aviso `<id>: slot invisível: filhos ignorados`.
- **Slot vazio** conta só o **padding** do slot. (Um cartão sem ações fica com o `gap` do quadro a mais embaixo: ponto conhecido.)
- **`none`** num slot põe cada filho no canto do conteúdo, sem empilhar.
- Conteúdo maior que a tela **avisa** (`tela: conteúdo maior que a altura da tela`) e **não recorta nem recusa**.

### Âncoras da tela

Uma raiz da tela pode ficar **fora do fluxo**, ancorada na tela (a barra de baixo, o botão flutuante, uma folha modal). A raiz sem âncora entra na coluna; a com âncora é posicionada pela âncora e pela `margin`.

| Âncora                                 | Posição                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `top-start`, `top`, `top-end`          | Em cima, à esquerda, no centro, à direita.           |
| `start`, `center`, `end`               | No meio da altura, à esquerda, no centro, à direita. |
| `bottom-start`, `bottom`, `bottom-end` | Embaixo, à esquerda, no centro, à direita.           |

- `margin` (px, padrão 0) é a distância das bordas tocadas pela âncora.
- Na raiz ancorada, `fill` ocupa a tela **menos a margem nos dois lados**; `hug` usa o conteúdo; px é px.
- Uma raiz pode ter uma **película** (`scrim`): o tipo de um componente (`m3-scrim`) desenhado por baixo da raiz, cobrindo a tela inteira. A instância dele entra logo antes da raiz, com o id `<id da raiz>#scrim`, com os valores padrão dos campos.
- Quem declara as raízes, as âncoras e a película é a **origem** da especialização (`origins`, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md)).

### Caso de prova: o texto de apoio `hug` dentro de coluna `hug`

Um cartão (`fill` × `hug`) com um texto de apoio (`hug` na altura, `fill` na largura) dentro de uma coluna (`fill` × `hug`), seguido de outro cartão. Com um texto de apoio mais longo, o cartão, a coluna que o contém e o irmão seguinte **crescem o mesmo tanto** (a altura das linhas a mais; no teste, com a medida aproximada do Node, 80 px), e a largura não muda. Ninguém precisa dizer ao cartão quanto ele vale.

O teste que prova é `tests/model/components/layout.test.ts` (grupo "cartão do Material 3 dentro de uma coluna", `a altura do cartão e da coluna crescem com o body, e o irmão desce na mesma medida`). Ele confere ainda que o botão do slot de ações fica no canto inferior direito do cartão (`justify: end`), com 16 px de padding.

### Dois jeitos de arrumar

- **`layoutScreen`** (acima): tela sem retângulos; calcula tamanhos e posições. Alimenta as telas vindas de uma origem externa.
- **`arrange`** (`arrange.ts`): instâncias que **já têm retângulo**; o `layout` do slot só **posiciona** os filhos (ordem entre irmãos, `gap`, `padding`, `align`, `justify`), arredondando para px inteiros, e grava os retângulos. O retângulo continua sendo a fonte da verdade; o layout é uma ferramenta de edição. Slot sem layout (ou `none`) deixa os filhos onde estão. A ação "Arrumar" na app é da fase B3.

## Expressões e condições

Quase todo atributo aceita, no lugar de um literal, uma **expressão** sobre os campos da anotação.

| Expressão                                                             | Resultado                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `{ "$field": "label", "default": "Botão" }`                           | O valor do campo. Se o campo está vazio (`null`, ausente ou só espaços), vale o `default`; sem `default`, vale o padrão do atributo. |
| `{ "$if": <condição>, "then": …, "else": … }`                         | `then` se a condição vale; senão `else` (opcional; sem ele vale o padrão do atributo). `then` e `else` são expressões.               |
| `{ "$switch": "variant", "cases": { "a": …, "b": … }, "default": … }` | O caso cujo nome é o valor do campo; `default` (opcional) se não há caso ou o campo está vazio.                                      |
| `{ "$concat": ["R$ ", { "$field": "preco" }] }`                       | Só em texto: junta as partes (números viram texto).                                                                                  |

```json
{
  "text": { "$concat": [{ "$field": "label" }, " (", { "$field": "count" }, ")"] },
  "visible": { "$has": "label" },
  "fill": { "$switch": "variant", "cases": { "filled": "#6750A4" }, "default": "none" }
}
```

**Condições** (`$if`, `visible`, `italic`): um objeto com **um** operador.

| Condição                          | Verdadeira quando                                                           |
| --------------------------------- | --------------------------------------------------------------------------- |
| `{ "$field": "selected" }`        | O campo é "verdadeiro" (veracidade, abaixo).                                |
| `{ "$eq": ["variant", "ghost"] }` | O campo é igual ao valor (comparado como texto; campo vazio nunca é igual). |
| `{ "$has": "label" }`             | O campo não está vazio.                                                     |
| `{ "$not": <condição> }`          | A condição é falsa.                                                         |
| `{ "$and": [<condição>, …] }`     | Todas valem.                                                                |
| `{ "$or": [<condição>, …] }`      | Alguma vale.                                                                |

**`$field` numa condição lê o campo por veracidade**, nunca como texto: o campo é verdadeiro quando não está vazio e o valor, sem diferença de maiúsculas, não é `""`, `"não"`, `"nao"`, `"no"`, `"false"`, `"0"` nem `"off"`; um número é verdadeiro quando diferente de 0. É assim que os booleanos funcionam: **um booleano é um campo `enum` com `["sim", "não"]`**, e `{ "$field": "selected" }` vale `sim`. O mesmo vale em `visible: { "$field": "x" }`. Os operadores `$eq`, `$has`, `$not`, `$and` e `$or` podem aparecer direto em `visible` e `italic`; `$field` fica como expressão.

Uma expressão que cita um campo que o **tipo não declara** é erro do validador da biblioteca (o desenho não acha o valor); campo do tipo que o desenho não usa é aviso.

## Avisos do motor

O motor **avisa**, não recorta nem recusa: conteúdo maior que o slot ou que a tela sai desenhado como pedido e o aviso acompanha. Os avisos são textos (em português) e vêm de três lugares.

**Ao desenhar um componente** (`instantiate`):

| Aviso                                             | Quando                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `campo não informado: <chave>`                    | O template cita um campo que não está nos valores recebidos (o campo existe no tipo e o valor não veio).                                   |
| `fill dentro de hug vira 0`                       | Um filho `fill` no eixo principal de um quadro `hug` (dentro de um template o `fill` vale 0).                                              |
| `conteúdo maior que a caixa: <quadro>`            | Os filhos (tamanhos fixos mais `gap`s) passam do conteúdo do quadro no eixo principal, ou um filho fixo passa do conteúdo no eixo cruzado. |
| `ícone esticado: escala diferente nos dois eixos` | A caixa de um `path` tem outra proporção que o `viewBox`.                                                                                  |

**Ao arrumar uma tela sem geometria** (`layoutScreen`; o texto leva o id da instância na frente):

| Aviso                                          | Quando                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `<id>: tipo sem componente: <tipo>`            | O tipo da instância não tem componente (ou o arquivo faltou ou era inválido); a instância e a subárvore ficam de fora. |
| `<id>: filhos ignorados (componente sem slot)` | A instância tem filhos mas o componente dela não tem slot.                                                             |
| `<id>: fill dentro de hug: usando hug`         | Um filho `fill` na altura de uma `column` `hug`.                                                                       |
| `<id>: slot invisível: filhos ignorados`       | O slot está com `visible` falso.                                                                                       |
| `<id>#scrim: tipo sem componente: <tipo>`      | A película pedida não tem componente.                                                                                  |
| `tela: conteúdo maior que a altura da tela`    | As raízes do fluxo passam da altura da tela.                                                                           |

**Ao traduzir um JSON externo** (origem): tipo externo sem tipo de anotação (o nó e a subárvore ficam de fora), propriedade desconhecida (que não é caminho de um campo nem está em `ignore`), valor fora das `options` de um `enum`, objeto onde se esperava um valor simples, âncora inválida (usa `top-start`) e margem inválida. Os avisos levam o caminho do nó (`content.children[1].props.foo`). Ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Origens".

Os avisos não se repetem. A mesma regra vale na prova de desenho do validador da biblioteca (nível 3), onde cada aviso do motor vira um aviso do pacote.

## Medida do texto

`hug`, quebra de linha e a altura de um texto dependem da **medida do texto**, que o motor recebe de fora (uma função `TextMeasurer`). Há duas:

- **Real**, no navegador: o Konva mede o texto com a fonte carregada. No laboratório é o `konvaMeasurer`; a app desenha com ela a partir da fase B3.
- **Aproximada**, no Node (e nos testes): `approximateMeasurer`, sem canvas. Largura ≈ 0,55 × o tamanho da fonte por caractere (0,6 se o peso é 600 ou mais) mais o espaçamento entre letras; altura = número de linhas × altura de linha; com largura máxima, quebra por palavras.

Quem lê um aviso terminado em **`(aproximado)`** (a prova de desenho do validador da biblioteca, no servidor MCP ou na skill) deve entender que o texto foi medido pela aproximação: um aviso de "conteúdo maior que a caixa" pode sumir, ou aparecer só em outro tamanho, quando o navegador medir com a fonte de verdade. O aviso é um sinal para olhar, não uma sentença. E o contrário também vale: sem o aviso, o navegador pode medir um pouco mais largo.

## Validação

`parseComponent(json)` (em `src/model/components/parseComponent.ts`) devolve o mesmo contrato do `parseSpec`:

```ts
{ ok: true; component: ComponentFile }
| { ok: false; issues: { path: string; message: string }[]; errors: string[] }
```

- `errors[i]` é `"caminho: mensagem"` (ou só a mensagem quando o caminho é vazio), com o caminho JSON do problema: `template.children[1].text: esperava texto ou número`.
- O formato é **estrito**: chave desconhecida em qualquer nó, expressão, estilo ou na raiz é problema (`chave desconhecida: <chave>`). Outros problemas: `format`/`formatVersion` errados, `id` fora do padrão, `size`/`minSize` inválidos, `minSize` maior que `size`, raiz do template que não é `frame`, `children` ou `layout` num nó que não é quadro (o `slot` aceita `layout`), tamanho de nó fora de `número`/`fill`/`hug`/`NN%`, expressão com mais de um operador, condição sem operador, peso de fonte fora de 100 a 900, cor vazia.
- `parseComponentText(texto)` lê o texto JSON (JSON inválido vira um problema de caminho vazio) e `validateComponent(json)` devolve só a lista `string[]`.
- `docs/component.schema.json` espelha a estrutura (para editores e geradores); ele **não** substitui o parser, e o código é a fonte da verdade.
- O **validador da biblioteca** (`src/model/library.ts`, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Validação da biblioteca") roda o `parseComponent` em cada componente do pacote e confere o que depende de mais de um arquivo (o campo citado pelo desenho existe no tipo, o `slot` declarado existe no template).

## Limites conhecidos

- **Um slot por componente.** Os filhos de uma instância vão sempre para o primeiro slot do template (busca em profundidade). Vários slots ficam para depois.
- **Imagem não é primitiva.** O desenho é feito de quadro, retângulo, elipse, texto e caminho; fotos e bitmaps não entram.
- **`formatVersion` 1 é a única.** Mudar o formato do componente pede uma versão nova e a decisão de aceitar as antigas.
- Gradiente só `linear`; sombra só uma por nó; borda uma por nó.
- Listas que viram campos numerados (`label1`, `label2`…) são frágeis; o desenho de uma barra de navegação ou de uma folha com N itens ainda usa esses campos (campo de tabela no desenho é uma evolução).
- A medida do texto no Node é aproximada (ver acima).
