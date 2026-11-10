# Formato do componente (`mapping-component`, `formatVersion` 1, 2, 3 e 4)

O formato do arquivo que desenha um tipo de anotação: um **componente**. É para quem escreve um à mão ou gera um (a skill `spec-author` e os agentes). O componente vive dentro do pacote de uma biblioteca (ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Biblioteca: o pacote"); este documento descreve só o arquivo dele.

Arquivos de apoio:

- `docs/component.schema.json`: JSON Schema (draft 2020-12) da estrutura. É documentação: a fonte da verdade é o código (`src/model/components/parseComponent.ts`), e um teste confere o schema contra os componentes do Material 3 e contra o parser.
- `libraries/material3-compose/components/*.json`: componentes reais (50 tipos do Material 3); os exemplos deste documento saem de componentes assim, encurtados. A origem executável está em `examples/libraries/sdui-backend/`.
- O motor que lê o formato: `src/model/components/` (`componentFormat.ts`, `parseComponent.ts`, `expressions.ts`, `instantiate.ts`, `layout.ts`, `arrange.ts`, `origin.ts`). Puro, sem DOM: roda no navegador e no Node.

## O que é um componente

Um componente é o **desenho genérico** de um tipo de anotação: uma árvore de primitivas neutras (quadro, retângulo, elipse, texto, caminho, slot, na `formatVersion` 2, `repeat`, na 3, `image` e, na 4, o traço com ponta, canto e lados, o layout com expressão, os limites `min`/`max` de tamanho, o `distribute` do `repeat` e o texto rico em `runs`) cujos atributos podem ser **ligados aos campos** do tipo por expressões. Trocar o valor de um campo redesenha o componente.

- **Um arquivo por componente.** O tipo da especialização só o referencia, com a chave `component` (`"component": "components/button.json"`).
- O caminho é **relativo ao arquivo da especialização**, com `/`, sem `..`, sem `/` no começo e sem unidade de disco, e termina em `.json`.
- O `id` do componente **não** precisa ser igual ao `id` do tipo que o referencia. Um mesmo arquivo citado por dois tipos gera um aviso do validador da biblioteca.
- O componente **não declara campos**: eles vêm do tipo. O arquivo só diz como os valores aparecem no desenho (`preview` traz valores de exemplo).
- Um tipo sem `component` continua valendo, só não tem desenho.
- **Movimento × aparência de estado.** O desenho é um quadro parado: sem animação, ripple animado nem troca de estado pelo mouse. A **aparência** de um estado de interação (hover, foco, pressionado, arrastado) é desenhável e, quando a origem a define (tokens de estado do design system), entra como um campo `enum` opcional do tipo, fora do `code`, como o desabilitado e o selecionado. Ao listar o que fica fora num plano ou na Fidelidade, separe movimento (fora) de aparência de estado (campo). Exemplo da biblioteca `material3-compose`: o campo `interaction` do `button` (`none`, `hovered`, `focused`, `pressed`) escolhe uma camada `rect` com o token de opacidade do estado, e um `$switch` sobre ele muda a elevação; com o desabilitado ligado a camada não desenha.

## A raiz do arquivo

```json
{
  "format": "mapping-component",
  "formatVersion": 1,
  "id": "button",
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

| Propriedade     | Obrigatória | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | sim         | Sempre `"mapping-component"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `formatVersion` | sim         | `1`, `2`, `3` ou `4`. A `2` é a `1` mais o nó `repeat` (a tabela desenhada); a `3` é a `2` mais o nó `image`; a `4` é a `3` mais `stroke.cap`, `stroke.join`, `stroke.sides` e `stroke.offset`, `stroke.dash` por expressão, `$token` em `shadow` e nos itens de `cornerRadius` e de `stroke.dash`, `alpha` no `$token` de cor, `layout.justify` `space-around` e `space-evenly`, `layout.reverse`, expressão em `layout.type`, `layout.align`, `layout.justify`, `width` e `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` e `repeat.distribute`. `repeat` numa `1`, `image` numa `1` ou `2` e as chaves da `4` numa menor são erro. A medição em duas passagens ("Dimensionamento") vale em todas as versões. As quatro são aceitas. |
| `id`            | sim         | Texto no padrão `^[a-z0-9][a-z0-9-_]*$`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `name`          | sim         | Nome exibido, não vazio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `description`   | não         | Texto de ajuda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `size`          | sim         | `{ width, height }`, números positivos (px). Tamanho **inicial** da instância e, sem `sizing`, o tamanho dos dois eixos na arrumação por tamanhos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `minSize`       | não         | `{ width, height }`, positivos e **não maiores** que `size`. Piso do redimensionamento e de todo tamanho calculado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `sizing`        | não         | `{ width?, height? }`: dimensionamento de uma instância **sem retângulo** (ver "Dimensionamento").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `screen`        | não         | Só na `formatVersion` 4: desenha o componente em pixels de tela (ver "Pixels de tela: `screen` e `stroke.scale`").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preview`       | não         | Valores de exemplo dos campos (`chave` → texto, número ou `null`; num campo `table`, a lista das linhas), usados ao criar uma instância, no Catálogo e na prova de desenho. Os campos vêm do tipo, não daqui.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `template`      | sim         | A raiz do desenho. Precisa ser um nó `frame`; ocupa o retângulo inteiro da instância.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Qualquer outra chave na raiz é problema (o formato é estrito).

## Nós do template

Cada nó tem `type` (`frame`, `rect`, `ellipse`, `text`, `path`, `slot`, na `formatVersion` 2, `repeat`, na 3, `image` ou, na 4, `icon`) e as chaves comuns abaixo. As chaves de cada tipo vêm depois. **Chave desconhecida é problema**, para que erro de digitação apareça.

| Chave                                            | Descrição                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                           | Nome do nó (aparece nos avisos e na árvore). Opcional.                                                                                                                                                                                                                                                                                                                                                        |
| `visible`                                        | Expressão booleana (ver "Expressões e condições"). Nó invisível não ocupa lugar nem entra na arrumação. Padrão: visível.                                                                                                                                                                                                                                                                                      |
| `opacity`                                        | Número de 0 a 1 (aceita expressão). Padrão 1.                                                                                                                                                                                                                                                                                                                                                                 |
| `rotation`                                       | `formatVersion` 4. Gira o nó em graus, no sentido horário, em volta do centro da caixa (aceita expressão); só desenho. Vale em todo nó, menos na raiz (ver "Rotação: `rotation`"). Padrão 0.                                                                                                                                                                                                                  |
| `width`, `height`                                | Tamanho do nó (ver "Dimensionamento"): px, `"fill"`, `"hug"` ou `"NN%"`. Na `formatVersion` 4 aceitam expressão (ver "Dimensionamento").                                                                                                                                                                                                                                                                      |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `formatVersion` 4. Limites do tamanho do nó, em px (número maior ou igual a 0; aceitam expressão). Valem em qualquer nó, depois de resolvido `fill`/`hug`/`%` (ver "Limites de tamanho").                                                                                                                                                                                                                     |
| `anchors`                                        | `{ left?, right?, top?, bottom?, centerX?, centerY? }`. Só tem efeito quando o pai é um quadro com `layout: none`.                                                                                                                                                                                                                                                                                            |
| `fill`                                           | Cor CSS (`#rrggbb`, `#rrggbbaa`, `rgba(...)`), `"none"` ou gradiente `{ "type": "linear", "angle": 90, "stops": [{ "offset": 0, "color": "#fff" }, …] }` (ao menos 2 paradas, `offset` de 0 a 1; 0° vai da esquerda para a direita e 90° de cima para baixo). Aceita expressão.                                                                                                                               |
| `stroke`                                         | `{ color, width?, align?, dash? }`. `color` é obrigatório e aceita expressão; `width` padrão 1; `align` `inside` (padrão; `center` no `path`), `center` ou `outside`; `dash` é a lista de comprimentos (na `formatVersion` 4, também por expressão e com `$token` nos itens). Cor `"none"` desliga. Na `formatVersion` 4 aceita também `cap`, `join`, `sides` e `offset` (ver "Traço: ponta, canto e lados"). |
| `shadow`                                         | `{ color, x?, y?, blur? }`. `color` é obrigatório (`"none"` desliga); `x` e `y` em px; `blur` maior ou igual a 0. Na `formatVersion` 4, `x`, `y` e `blur` aceitam `{ "$token": … }` de número (e só `$token`; `blur` resolvido negativo vale 0, com o aviso `valor inválido em shadow.blur: <valor>`).                                                                                                        |
| `cornerRadius`                                   | Número maior ou igual a 0 ou lista de 4 (superior-esquerdo, superior-direito, inferior-direito, inferior-esquerdo). Aceita expressão. Na `formatVersion` 4, cada item da lista também aceita `{ "$token": … }` de número (`[{ "$token": "corner-extra-small" }, 0, 0, { "$token": "corner-extra-small" }]`). Vale em `frame` e `rect`.                                                                        |

### `frame`

O nó que agrupa. Os filhos ficam em `children` e se distribuem conforme o `layout`.

| Chave      | Descrição                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`   | `{ "type": "none" }` (padrão), `row` ou `column` (ver "Dimensionamento"). Na `formatVersion` 4, `type`, `align` e `justify` aceitam expressão, e há `reverse`. |
| `children` | Lista de nós.                                                                                                                                                  |
| `clip`     | Recorta os filhos na caixa do quadro (e o traço e a sombra dele, ver "Recorte da raiz"). Padrão `true` na raiz do template e `false` nos demais quadros.       |

### `rect` e `ellipse`

Só as chaves comuns. `rect` aceita `cornerRadius`.

### `text`

| Chave   | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`  | Obrigatório, a menos que haja `runs` (um ou outro). Texto ou número, ou expressão (`$field`, `$concat`…). Número vira texto; vazio vira texto vazio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `color` | Cor do texto (aceita expressão). Padrão `#000000`; `"none"` esconde.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `runs`  | `formatVersion` 4. Lista não vazia de trechos, no lugar de `text`: o texto rico, com peso, cor e caixa de fundo no meio da linha (veja "Texto rico: trechos e caixa em linha").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `font`  | `{ family?, size?, weight?, italic?, lineHeight?, letterSpacing?, align?, verticalAlign?, decoration?, wrap?, ellipsis?, maxLines? }`, todos aceitando expressão. Padrões: `size` 14, `weight` 400 (de 100 a 900), `italic` falso, `lineHeight` 1,2, `letterSpacing` 0, `align` `left`, `verticalAlign` `top` (`top`, `middle`, `bottom`, ou `cap-middle` na `formatVersion` 4: veja "Centro pela maiúscula: `cap-middle`"), `decoration` `none` (`underline` ou `line-through`). `lineHeight` até 3 é múltiplo do tamanho; acima disso é px. Como no CSS, o px é a altura da linha como está (sem arredondar para cima) e o múltiplo é multiplicado pelo tamanho sem arredondar antes de multiplicar pelas linhas: 2 linhas de `lineHeight` 18,5 medem 37 e de 1,4 × 13, 36,4. `wrap`, `ellipsis` e `maxLines` são só da `formatVersion` 4 (veja "Texto de uma linha, reticências e `maxLines`"). `family` é uma família (`Roboto`) ou uma pilha CSS (`system-ui, "Segoe UI", Roboto, sans-serif`): a pilha vale como está, um nome com espaço pode vir entre aspas (`"Segoe UI"`), e um nome genérico (`system-ui`, `monospace`) vale sozinho, sem aspas; uma fonte da biblioteca (`fonts`) entra se a pilha começa pelo nome dela. Valor que o CSS não aceita (aspas sem fechar, item vazio) gera **aviso** na validação e o texto cai em `sans-serif`. Sem `family`, o desenho usa o token embutido `font-sans`, a fonte do tema do hospedeiro (a `Inter` fixa saiu; veja "Tokens de design (`$token`)"). **Aviso:** a largura de um texto sem `family` muda em relação às versões que usavam a `Inter`, e com ela o `hug`, a quebra de linha e o `texto maior que a caixa`; quem precisa de largura estável declara a `family`. |

O texto **quebra linha** quando o nó tem largura definida (px, `fill` ou `%`) e **não quebra** quando a largura é `hug`. Sem `width` e `height`, o texto é `hug` nos dois eixos (todos os outros nós são `fill`).

### `image` (imagem remota, `formatVersion` 3)

Mostra uma imagem de uma URL `https://` (avatar, foto, logo cuja URL vem do dado). Exemplo, um avatar com nome:

```json
{
  "type": "frame",
  "name": "avatar",
  "layout": { "type": "row", "gap": 8 },
  "children": [
    {
      "type": "image",
      "name": "foto",
      "src": { "$field": "foto" },
      "fit": "cover",
      "width": 40,
      "height": 40,
      "fill": "#e0e0e0",
      "cornerRadius": 20
    },
    { "type": "text", "text": { "$field": "nome" }, "width": "fill" }
  ]
}
```

| Chave  | Descrição                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src`  | Obrigatória. Um texto literal `https://...` ou exatamente `{ "$field": "<campo>" }` (ver abaixo).                                   |
| `fit`  | `cover` (padrão: preenche a caixa e corta o excesso), `contain` (cabe inteira) ou `fill` (estica).                                  |
| comuns | `name`, `visible`, `opacity`, `width`, `height`, `anchors`, `fill` (o fundo, atrás da imagem), `stroke`, `shadow` e `cornerRadius`. |

- **`src` restrito.** Só o literal ou `{ "$field": "<campo>" }`, sem `default`. `$concat`, `$switch`, `$if` e qualquer outra expressão são erro. Motivo: o componente não pode montar uma URL com valores de outros campos, o que mandaria dados do projeto ao servidor de quem escreveu a especialização.
- **Literal.** Precisa ser uma URL `https://` absoluta, sem usuário e senha, com até 2048 caracteres. `http:`, `data:` e caminho relativo são erro (o relativo fica recusado para poder virar imagem local do pacote no futuro sem ambiguidade).
- **O campo ligado** ao `src` precisa ser `string` (no `repeat`, uma coluna `string` da `table`); o validador da biblioteca confere. Nenhuma declaração de origem: a URL é o valor de um campo como qualquer outro.
- **Tamanho.** `width`/`height` `"hug"` é **erro**: a arrumação nunca depende da imagem baixada, para o desenho ser o mesmo na app, no MCP e antes de carregar. O padrão dos dois eixos é `fill`, como nos outros nós que não são texto. Use px, `fill` ou `%`.
- **Reservado.** Enquanto a imagem não carrega, sem consentimento da origem, com URL recusada ou com falha, o nó desenha o reservado (a caixa cinza com um X). O servidor MCP **nunca baixa** a imagem e desenha sempre o reservado.
- **Consentimento.** A imagem só é pedida à rede depois de a pessoa permitir aquela origem na app (Configurações › Privacidade); nada é gravado no projeto além da URL.
- Vale dentro do `template` de um `repeat` (o `src` liga a uma coluna `string`).

### `path`

| Chave      | Descrição                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `d`        | Obrigatório. Dados de caminho SVG, ou expressão (um `$switch` troca o ícone).                                          |
| `viewBox`  | Obrigatório. `[largura, altura]` positivos: a caixa em que `d` foi desenhado; o caminho é escalado para a caixa do nó. |
| `fillRule` | `nonzero` (padrão) ou `evenodd`.                                                                                       |

Escala diferente nos dois eixos (caixa do nó com outra proporção que o `viewBox`) estica o ícone e gera um aviso.

### `icon` (ícone do conjunto da biblioteca, `formatVersion` 4)

Desenha um ícone do conjunto declarado em `icons` na especialização (`formatVersion` 15; ver `docs/SPEC-FORMAT.md`, "Conjunto de ícones"), no lugar de um `$switch` com todos os caminhos dentro do componente.

```json
{
  "type": "icon",
  "name": { "$field": "icone" },
  "color": { "$token": "primary" },
  "width": 24,
  "height": 24
}
```

| Chave         | Descrição                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Obrigatória. O nome do ícone no conjunto: texto ou expressão (`$field`, `$switch`…). É o nome do **ícone**: o nó `icon` não tem nome de nó.  |
| `color`       | Cor do nó (expressão); padrão `#000000`. Pinta os caminhos sem cor própria e os que pedem a cor do nó (`fill` ou `stroke` `true`).           |
| `strokeWidth` | Largura dos traços, em unidades do `viewBox` do ícone (expressão); troca a `width` de todos os caminhos com traço.                           |
| comuns        | `visible`, `opacity`, `width`, `height` (`hug` = o `viewBox` do ícone), `minWidth`…, `anchors`, `fill`, `stroke`, `shadow` e `cornerRadius`. |

- **Escala.** Os caminhos são desenhados no `viewBox` do ícone (o dele, senão o do conjunto) e escalados para a caixa do nó; proporção diferente estica e gera o aviso `ícone esticado: escala diferente nos dois eixos`. A largura do traço escala junto.
- **Cor.** `color` pinta só o que não tem cor própria: `fill` ou `stroke` `true` e o caminho sem `fill` nem `stroke` usam a cor do nó; `fill`/`stroke` com uma cor própria a mantêm.
- **Nome fora do conjunto.** No desenho (nome vindo de um campo, ou sem conjunto carregado) o nó vira o **reservado** e o aviso `ícone desconhecido: <nome>` acompanha. Um nome **literal** fora do conjunto é erro do `validate_library` (nível 2), e um campo `enum` ligado ao `name` com opção fora do conjunto é aviso (nível 3).
- Numa `formatVersion` do componente menor que 4: `template.children[0].type: só é permitido com formatVersion 4`.

### `slot`

O espaço reservado para outras instâncias: a **marcação filha** de uma marcação com este tipo é desenhada dentro do slot. Um componente com slot recebe marcações filhas dentro do slot.

| Chave    | Descrição                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`  | Texto do rótulo do slot (aceita expressão). Padrão: o `name` do nó.                                                                                                             |
| `layout` | Como as filhas se organizam: `row` ou `column` (com `gap`, `padding`, `align`, `justify`) ou `none`/ausente (cada filha fica onde está). `gap` e `padding` podem vir de campos. |

O slot é o espaço; quem é desenhado dentro dele são as filhas. `width`, `height` e `anchors` dele funcionam como em qualquer nó. Um slot invisível (`visible` falso) ignora as filhas.

### `repeat` (a tabela desenhada, `formatVersion` 2)

Repete o desenho de **uma linha** por linha de um campo `table` do tipo: é como uma tabela de dados (os eventos de uma tela, as propriedades de uma chamada) vira desenho, sem campos numerados (`label1`, `label2`…).

```json
{
  "type": "repeat",
  "name": "linhas",
  "field": "linhas",
  "direction": "column",
  "gap": 4,
  "template": {
    "type": "frame",
    "name": "linha",
    "layout": { "type": "row", "gap": 12 },
    "children": [
      { "type": "text", "text": { "$field": "chave" }, "width": "hug" },
      { "type": "text", "text": { "$field": "valor" }, "width": "fill" }
    ]
  }
}
```

| Chave        | Descrição                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field`      | A `key` do campo `table` do tipo cujas linhas se repetem. **Exatamente um de `field` e `count`.**                                                              |
| `count`      | `formatVersion` 4. Repete o `template` `max(0, floor(count))` vezes, sem campo `table` (ver "Repeat por contagem" abaixo). Número ou expressão de número.      |
| `template`   | Obrigatório. Um nó `frame`: o desenho de **uma** linha. Não pode ter `repeat` nem `slot` dentro.                                                               |
| `direction`  | `column` (padrão: as linhas se empilham) ou `row` (lado a lado).                                                                                               |
| `distribute` | `formatVersion` 4. `"none"` (padrão) ou `"fill"`: com `fill`, o `repeat` ocupa o eixo do pai e as linhas dividem o eixo das linhas por igual (ver abaixo).     |
| `gap`        | Espaço entre as linhas em px (aceita expressão sobre os campos do tipo). Padrão 0.                                                                             |
| comuns       | Só `name`, `visible`, `opacity`, `width`, `height` e `anchors`. `fill`, `stroke`, `shadow` e `cornerRadius` não valem no `repeat` (o desenho é do `template`). |

Como o `template` lê a linha:

- Dentro do `template`, `{ "$field": "<coluna>" }` (e `$has`, `$eq`, `$switch`, em qualquer expressão ou condição) lê a **coluna da linha**. Uma coluna **sombreia** o campo do tipo de mesmo nome; o que não é coluna segue lendo o campo do tipo (um `{ "$field": "titulo" }` dentro do `template` mostra o título da anotação em cada linha). O que vale como coluna é o que as linhas trazem, e o validador da biblioteca confere que cada chave citada é coluna da `table` ou campo do tipo.
- Os valores da linha chegam como texto, número ou vazio. Numa coluna `ref` (ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Tipos de valor"), a célula chega como o **texto do alvo**, resolvido um nível como o campo `ref`: o rótulo da linha (`rowLabel`) quando o alvo é uma linha de tabela, o valor da tupla livre, o valor do campo simples; alvo quebrado, em ciclo ou em mais de um nível vira vazio e avisa (`referência quebrada: tabela[2].coluna`). A coluna `ref` **não** desenha seta: é dado.
- A tabela sem linhas (ou nula) desenha um quadro vazio. A ordem das linhas é a do campo.

Como o `repeat` se dimensiona (é um quadro por baixo): `hug` no **eixo das linhas** (a altura em `column`, a largura em `row`) e `fill` no outro, a menos que `width` ou `height` digam outra coisa; e o `template` também é `hug` no eixo das linhas se não disser o contrário. Por isso a altura do componente acompanha o número de linhas **medido**, mas a caixa da marcação não cresce sozinha: linhas demais para a caixa saem cortadas (a raiz recorta) e o desenho avisa `conteúdo maior que a caixa` (a marcação ganha a pendência de que o componente não cabe). O `preview` do componente traz algumas linhas de exemplo, que o Catálogo e a prova de desenho usam.

**`distribute: "fill"` (`formatVersion` 4).** Para uma lista que ocupa a altura que o pai lhe dá (e não a das linhas medidas), com as linhas de alturas iguais:

- o `repeat` ocupa o eixo do pai, como um filho `fill` (a altura em `column`, a largura em `row`);
- as linhas dividem o eixo das linhas **por igual**, depois de descontar os `gap`s: o `fill` do `template` nesse eixo (ou o eixo omitido) vale a fração; um valor explícito (px, `hug` ou `%`) no `template` ou no `repeat` fica como escrito, e as linhas `fill` dividem só o que sobra;
- sem `distribute` (ou `"none"`), um `fill` no `template` no eixo das linhas continua valendo 0, com o aviso `fill dentro de hug vira 0`.

```json
{
  "type": "repeat",
  "field": "linhas",
  "gap": 4,
  "distribute": "fill",
  "template": { "type": "frame", "layout": { "type": "row" }, "children": [] }
}
```

`distribute` numa `formatVersion` menor que 4 é erro (`template.children[0].distribute: só é permitido com formatVersion 4`).

**Repeat por contagem e `$index` (`formatVersion` 4).** O `repeat` aceita `count` no lugar de `field`: o `template` se repete `max(0, floor(count))` vezes, sem tabela. Serve para o que é um número e não dados: os dias de um mês, as marcas de um mostrador, os pontos de um indicador de páginas.

```json
{
  "type": "repeat",
  "count": 31,
  "direction": "row",
  "template": {
    "type": "frame",
    "children": [{ "type": "text", "text": { "$add": [{ "$field": "$index" }, 1] } }]
  }
}
```

- **`count`** é um número ou uma expressão de número (`{ "$field": "n" }`, `{ "$rows": "items" }`, uma conta). Um literal negativo ou não inteiro é erro (`template.children[0].count: esperava inteiro maior ou igual a 0`); uma expressão que dá negativo ou sem valor vale 0, e a parte fracionária cai (`3.9` vale 3).
- **Teto de 1000 linhas.** Acima disso saem 1000 linhas e o desenho avisa `repeat limitado a 1000 linhas: <nome do nó>` (`repeat` quando o nó não tem `name`).
- **`{ "$field": "$index" }`** dentro do `template` é o **índice da linha** (0, 1, …), no `repeat` por `count` e no por `field`. Ele entra pelo mesmo sombreamento das colunas e **não é campo do tipo**: não precisa ser declarado nem conta como campo sem uso. Num `repeat` dentro de outro, vale o do mais interno. `$index` fora do `template` de um `repeat` é erro (`template.children[0].text.$field: $index só vale dentro de um repeat`).
- Num `repeat` por `count`, o resto do `template` lê **campos do tipo** (não há colunas); o validador da biblioteca confere que cada chave citada é campo do tipo.
- `count` e `$index` numa `formatVersion` menor que 4 são erro (`só é permitido com formatVersion 4`, no caminho da chave).

### Traço: ponta, canto e lados (`formatVersion` 4)

Na `formatVersion` 4 o `stroke` ganha quatro chaves (`cap`, `join` e `sides` aceitam expressão; `offset` aceita literal ou `$token`) e só valem a partir da 4: numa versão menor o parser recusa com `<caminho da chave>: só é permitido com formatVersion 4` (ex.: `template.children[0].stroke.cap: só é permitido com formatVersion 4`).

| Chave    | Descrição                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cap`    | A ponta do traço (onde ele começa e termina, nas pontas das linhas tracejadas e dos lados de `sides`): `butt` (padrão), `round` ou `square`.                                                                                                                                        |
| `join`   | O canto entre dois segmentos do traço: `miter` (padrão, ponta viva), `round` ou `bevel`.                                                                                                                                                                                            |
| `sides`  | Lista não vazia, sem repetição, de `top`, `right`, `bottom` e `left`: só esses lados são traçados. Ausente, ou com os quatro lados, é o contorno inteiro (com o raio dos cantos). Só em `frame` e `rect`; em `ellipse` e `path` é erro (`só vale em frame e rect (este é <tipo>)`). |
| `offset` | Afastamento do traço da forma, em px maior ou igual a 0 (literal ou `{ "$token": … }` de número). Só em `frame`, `rect` e `ellipse`; em `path` e nos demais é erro (`só vale em frame, rect e ellipse (este é <tipo>)`).                                                            |

- `sides` pode vir de uma expressão que devolve a lista (um `$switch` com uma lista por caso, por exemplo).
- Com `cornerRadius` e lados parciais, o traço é **reto**: não há arco no canto.
- Os lados pedidos têm a **mesma** cor, largura, `align` e `dash`. Cor ou largura diferentes por lado pedem **dois nós** (ver "Limites conhecidos").
- O raster do servidor MCP (`get_marking_image`) respeita `cap`, `join` e `sides`.
- **`offset`** desenha o traço sobre o contorno da forma **crescida** de `offset` de cada lado, com o raio de cada canto + `offset` (como o `outline-offset` do CSS); o `align` vale em relação a esse contorno. Com `sides`, o afastamento vale só nos lados pedidos. O recorte ampliado da raiz conta `offset` + a extensão do traço (ver "Recorte da raiz"), então um `rect` filho que ocupa a forma, com traço `outside` e `offset` 2, desenha por fora da caixa o anel de foco do Material 3 (3 de largura, afastado 2). A cena leva o valor em `Stroke.offset`.
- **`dash` por expressão** (`formatVersion` 4): `$switch`, `$if` ou `$field` que devolvem a lista, e `{ "$token": … }` de número em cada item. Valor resolvido que não é uma lista de números maiores ou iguais a 0 dá o aviso `valor inválido em stroke.dash: <valor>` e nenhum tracejado. A lista literal de números continua valendo em todas as versões; expressão ou `$token` numa versão menor é `só é permitido com formatVersion 4`.

```json
{
  "type": "frame",
  "name": "divisória",
  "height": 48,
  "stroke": { "color": "#CAC4D0", "width": 1, "sides": ["bottom"] }
}
```

### Pixels de tela: `screen` e `stroke.scale` (`formatVersion` 4)

`screen` é uma chave **da raiz do arquivo** (não de nó): `"screen": { "anchor": "top-left" }`. Com ela, o template é desenhado no `size` do componente em **pixels de tela**, em qualquer zoom (não escala com a imagem nem com o zoom), ancorado no ponto `anchor` do retângulo da marcação. A marcação continua em pixels da imagem; só o desenho tem tamanho fixo na tela, como os pinos de comentário.

- `anchor`: `center` (padrão), `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom` ou `bottom-right`. O ponto do desenho e o ponto do retângulo com o mesmo nome coincidem (no `center`, os centros).
- O desenho pode passar do retângulo da marcação; por isso a pendência "não cabe" não é gerada em componente com `screen`.
- O tamanho do desenho é sempre o `size` (o retângulo da marcação só diz **onde**); `sizing`, `minSize` e o redimensionar da marcação não mudam o tamanho do desenho.
- Limite: o desenho em pixels de tela não é um nó de layout; as filhas de um `slot` continuam nos retângulos delas e não são arrumadas dentro dele.
- `screen` com chave desconhecida ou `anchor` fora do conjunto é erro com caminho (`screen.anchor: esperava um de: …`). Numa `formatVersion` menor que 4: `screen: só é permitido com formatVersion 4`. Em nó filho, `screen` é chave desconhecida.

`stroke.scale` (literal booleano, `formatVersion` 4): `true` (padrão) escala a largura do traço com o zoom, como o resto do desenho; `false` mantém a largura em **pixels de tela**, em qualquer zoom (um traço de 2 é 2 pixels a 50% e a 400%). Numa versão menor: `…stroke.scale: só é permitido com formatVersion 4`.

### Rotação: `rotation` (`formatVersion` 4)

`rotation` (número em graus, **sentido horário**, aceita expressão) gira o nó em volta do **centro da caixa dele**. Vale em qualquer nó (`frame`, `rect`, `ellipse`, `text`, `path`, `icon`, `image`, `slot` e `repeat`), menos na raiz do template (`template.rotation: não vale na raiz`).

- **É só desenho**, como o `transform` do CSS: não muda o layout, a medida, o `hug`, o `fill`, os avisos de "não cabe" nem a caixa do nó na arrumação. O Arrumar e o `hug` dão o mesmo resultado com e sem `rotation`; a caixa que a marcação e as âncoras enxergam é a sem giro.
- **Os filhos de um quadro girado giram junto**, e o `clip` do quadro gira com ele (o recorte da raiz não gira, porque a raiz não tem `rotation`). Num `repeat`, a `rotation` gira o quadro das linhas inteiro.
- **Sem valor ou 0 não gira**: um campo vazio vale 0 e o desenho é o mesmo de antes, sem `rotation`. Valores negativos e acima de 360 valem. Operando que não é número faz o valor não existir (ver "Contas e comparações").
- **A mesma rotação na app, no visualizador e no PNG do MCP.** Um `rect` de 40 × 10 com `rotation` 90 desenha uma barra vertical de 10 × 40 centrada no mesmo ponto. O hover e a área clicável seguem a forma girada.
- **Slot:** o conteúdo que a instância põe num `slot` dentro de um nó girado é posicionado pela caixa sem giro e **não gira** com o nó.
- Numa `formatVersion` menor que 4 a chave é erro (`só é permitido com formatVersion 4`).

Os ponteiros e as alças de mostradores (que antes pediam uma tabela de posições) saem de `rotation` ou de `$sin` e `$cos` (ver "Contas e comparações"); o centro da rotação é o centro da caixa, então para girar em volta de outro ponto use um quadro maior, com o desenho deslocado dentro dele.

### Recorte da raiz

A raiz do template (e um quadro interno com `clip: true`) recorta os filhos na caixa da instância. Em **todas** as versões, o recorte inclui também a extensão do traço e da sombra do próprio quadro e dos filhos que passam da caixa **só** por traço ou sombra:

- traço `outside` entra inteiro e `center`, pela metade (o `inside` já cabe na caixa); com `stroke.offset` (`formatVersion` 4) entra também o afastamento, por lado de `sides` quando houver (um traço `inside` afastado de 2 sai 2 da caixa);
- sombra entra com o `blur` e o deslocamento (`x`, `y`), por lado.

O **conteúdo** (formas e texto) continua recortado no retângulo da instância. Na cena, o recorte ampliado é `FrameNode.clipBox`, um retângulo local presente só quando maior que a caixa. O anel de um traço `outside` na raiz, que antes sumia, agora aparece.

## Dimensionamento

Há três perguntas diferentes: **quanto mede a instância** (a raiz), **quanto mede cada nó dentro do template** e **como as filhas de um componente com slot se arrumam**.

### A instância: `size`, `minSize` e `sizing`

- `size` é o tamanho **inicial** da instância, em px, e vale quando a instância **tem retângulo** (uma marcação no editor, um `*.screen.json`): o retângulo da marcação manda e o template se adapta a ele.
- `minSize` é o piso. Nenhum tamanho calculado fica abaixo dele (nem o `fill` dividido, nem o `hug`).
- `sizing` só vale quando a instância chega **sem retângulo**, isto é, numa tela vinda de um JSON externo (origem, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Origens") ou arrumada por `layoutScreen`. Cada eixo é:
  - **px**: tamanho fixo;
  - **`"fill"`**: ocupa o espaço que o pai dá naquele eixo;
  - **`"hug"`**: o tamanho do conteúdo (o template medido e, num componente com slot, os filhos já arrumados);
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

**Expressão em `width` e `height` (`formatVersion` 4).** O valor avaliado precisa ser um número finito maior ou igual a 0, um texto numérico puro (`"120"` vale 120 px), `"fill"`, `"hug"` ou `"NN%"`. Outro valor cai no padrão do tipo de nó (`hug` para texto, `fill` para o resto) e o motor avisa `valor inválido em width: <valor>` (ou `height`). Um literal inválido continua sendo erro da validação, em todas as versões.

### Limites de tamanho: `minWidth`, `maxWidth`, `minHeight`, `maxHeight` (`formatVersion` 4)

Quatro chaves em **qualquer** nó, em px (número maior ou igual a 0; aceitam expressão, e um valor que não é número finito maior ou igual a 0 conta como ausente). O limite é aplicado **depois** de resolvido o tamanho do nó (px, `%`, `hug` ou `fill`) e **antes** do `minSize` da instância.

- **`fill` com `max` (ou `min`)** se comporta como no flexbox: o filho que bate no limite **congela** nele e a diferença é repartida entre os outros `fill` do mesmo pai. Dois `fill` lado a lado, um com `maxWidth: 100`, dão 100 px ao primeiro e **todo o resto** ao segundo.
- **`min` maior que `max`** com literais é erro da validação (`template.children[1].minWidth: não pode ser maior que maxWidth`). Quando vem de expressão, vale o `min`.
- **Texto `hug`** cortado pelo `maxWidth` quebra linha na largura cortada, e a altura é a das linhas resultantes.
- **Na raiz** do template os limites só valem quando o componente é **medido** (eixo `hug`, por exemplo `sizing` numa tela sem retângulo); numa marcação com retângulo a raiz ocupa a caixa e os limites dela não mudam nada.
- Numa versão menor que 4 as quatro chaves são erro (`só é permitido com formatVersion 4`).

### Layout de um quadro

`layout.type` é `none` (padrão), `row` (filhos lado a lado) ou `column` (filhos empilhados).

| Chave     | Valores                                                                                   | Descrição                                                                   |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `gap`     | número maior ou igual a 0 (aceita expressão)                                              | Espaço entre filhos, no eixo principal.                                     |
| `padding` | número, `[vertical, horizontal]` ou `[cima, direita, baixo, esquerda]` (aceita expressão) | Margem interna. Entra no tamanho `hug` do quadro.                           |
| `align`   | `start` (padrão), `center`, `end`, `stretch`                                              | Posição no eixo **cruzado**.                                                |
| `justify` | `start` (padrão), `center`, `end`, `space-between`, `space-around`, `space-evenly`        | Posição no eixo **principal** (largura em `row`, altura em `column`).       |
| `reverse` | booleano ou expressão (padrão `false`; `formatVersion` 4)                                 | Os filhos em ordem inversa no eixo principal e o `start` passa a ser o fim. |

**Expressão no layout (`formatVersion` 4).** `layout.type`, `layout.align` e `layout.justify` aceitam expressão (um `$switch` sobre um campo `enum` escolhe `row` ou `column`, por exemplo), em quadro e em slot. O valor resolvido precisa estar no conjunto da tabela acima; fora dele vale o padrão (`none`, `start`, `start`) e o motor avisa `valor inválido em layout.type: <valor>` (ou `layout.align`, `layout.justify`). Os literais continuam conferidos na validação, em todas as versões; expressão nessas chaves numa versão menor que 4 é erro (`só é permitido com formatVersion 4`). Com `type` literal `"none"`, só `type` vale no `layout`.

Dentro de um template:

- **`hug` num quadro, em duas passagens** (o `shrink-to-fit` do flexbox; vale em todas as versões do formato):
  1. mede-se o conteúdo dentro do **limite que o quadro recebe do pai** (o conteúdo do pai, ou o limite que o próprio pai recebeu): um filho `fill` no eixo **cruzado** (ou num quadro `none`) contribui com o **menor** entre o limite e o que ele abraçaria dentro dele (um texto quebrado no limite, um quadro medido no limite) e um filho `"NN%"` com o limite × NN / 100. Sem limite conhecido, `fill` e `%` valem 0;
  2. o resultado vira o tamanho do quadro; depois `fill` e `%` são resolvidos contra ele e o texto é medido **nessa largura**.

  Assim, um texto `fill` numa coluna `hug` quebra em linhas de palavras, e o quadro tem a altura delas (antes, o texto era medido com largura 0 e quebrava letra a letra). O texto `hug` não muda: não quebra. Só o `fill` no eixo **principal** de um quadro `hug` avisa (`fill dentro de hug vira 0`), porque ali o resultado é mesmo 0. Um texto que, apesar disso, é medido com largura máxima 0 avisa `texto medido com largura 0: <nó>`.

- **`fill` no eixo principal** divide o que sobra (conteúdo menos tamanhos fixos menos `gap`s) por igual entre os filhos `fill`; o que sobra nunca é negativo.
- **`align: stretch`** estica o filho no eixo cruzado até a área de conteúdo (um `hug` com `stretch` vira `fill`); a posição `center` e `end` usa o tamanho do filho.
- **`justify: space-between`** reparte a folga entre os filhos (com um filho só, não faz nada).
- **`justify: space-around` e `space-evenly`** (`formatVersion` 4), como no flexbox do CSS (`Arrangement.SpaceAround`/`SpaceEvenly` do Compose): `space-around` dá a cada filho meia folga de cada lado (as pontas ficam com metade do vão entre filhos); `space-evenly` dá o mesmo vão nas pontas e entre os filhos. Com um filho só, os dois o centram. Numa versão menor, o literal é `só é permitido com formatVersion 4`, no caminho de `layout.justify`.
- **`layout.reverse`** (`formatVersion` 4), como `row-reverse`/`column-reverse` do CSS (o `reverseLayout` do Compose): o primeiro filho vai para o fim do eixo principal e o `start` passa a ser o fim (`justify: end` empacota no começo). Vale em quadro, em slot (a arrumação das filhas, `arrange`) e na arrumação da tela. O `repeat` não tem `layout`: num pai com `reverse`, o bloco das linhas anda como um filho só e as linhas guardam a ordem. Com `type: "none"`, `reverse` é chave desconhecida (como `align` e `justify`).

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
- **Âncora por expressão (`formatVersion` 4).** `left`, `right`, `top` e `bottom` aceitam uma expressão de número, e `centerX` e `centerY` uma condição ou expressão booleana (`visible` tem a mesma forma). Uma expressão que não produz número vale como **âncora ausente**, como se a chave não existisse:

```json
{
  "type": "rect",
  "width": 12,
  "height": 12,
  "anchors": {
    "left": { "$mul": [{ "$size": "width" }, 0.5] },
    "centerY": { "$gt": [{ "$field": "n" }, 5] }
  }
}
```

Os literais são conferidos como sempre (`anchors.left: esperava número`). Numa `formatVersion` menor que 4, a expressão é erro (`template.children[0].anchors.left: só é permitido com formatVersion 4`).

### Arrumação por tamanhos de uma tela

Quando a tela chega **sem geometria** (um JSON de backend, por exemplo), `layoutScreen` calcula **tamanhos e posições** a partir do `sizing` de cada componente. A entrada é uma árvore de nós (tipo, valores, filhos) mais as raízes da tela; a saída é a tela com o retângulo de cada instância.

A tela é o **componente raiz**, em coluna, sem padding nem gap. As regras:

- **Spec por eixo**: `sizing[eixo]`, ou `size[eixo]` se ausente. Todo tamanho final respeita `minSize`.
- **`hug` é arredondado para cima** (o inteiro seguinte), para o texto não quebrar por arredondamento. O resto fica exato.
- **Componente com slot** (um componente com `slot`) tem o layout do slot (`row`, `column` ou `none`, com `gap`, `padding`, `align` e `justify`), que arruma os filhos. O `hug` de um componente com slot mede os **filhos já arrumados**, então a altura do cartão cresce com o texto que ele carrega.
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

- `margin` (px, padrão 0) é a distância das bordas tocadas pela âncora. Raiz com `margin` e sem `anchor` é problema da origem: `margin só vale com anchor`, no caminho `margin` da raiz.
- Na raiz ancorada, `fill` ocupa a tela **menos a margem nos dois lados**; `hug` usa o conteúdo; px é px.
- Uma raiz pode ter uma **película** (`scrim`): o tipo de um componente (`sdui-scrim`) desenhado por baixo da raiz, cobrindo a tela inteira. A instância dele entra logo antes da raiz, com o id `<id da raiz>#scrim`, com os valores padrão dos campos.
- Quem declara as raízes, as âncoras e a película é a **origem** da especialização (`origins`, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md)).

### Caso de prova: o texto de apoio `hug` dentro de coluna `hug`

Um cartão (`fill` × `hug`) com um texto de apoio (`hug` na altura, `fill` na largura) dentro de uma coluna (`fill` × `hug`), seguido de outro cartão. Com um texto de apoio mais longo, o cartão, a coluna que o contém e o irmão seguinte **crescem o mesmo tanto** (a altura das linhas a mais; no teste, com a medida aproximada do Node, 80 px), e a largura não muda. Ninguém precisa dizer ao cartão quanto ele vale.

O teste que prova é `tests/model/components/layout.test.ts` (grupo "cartão do Material 3 dentro de uma coluna", `a altura do cartão e da coluna crescem com o body, e o irmão desce na mesma medida`). Ele confere ainda que o botão do slot de ações fica no canto inferior direito do cartão (`justify: end`), com 16 px de padding.

### Dois jeitos de arrumar

- **`layoutScreen`** (acima): tela sem retângulos; calcula tamanhos e posições. Alimenta as telas vindas de uma origem externa.
- **`arrange`** (`arrange.ts`): instâncias que **já têm retângulo**; o `layout` do slot só **posiciona** os filhos (ordem entre irmãos, `gap`, `padding`, `align`, `justify`), arredondando para px inteiros, e grava os retângulos. O retângulo continua sendo a fonte da verdade; o layout é uma ferramenta de edição. Slot sem layout (ou `none`) deixa os filhos onde estão. A ação "Arrumar" na app é da fase B3.

## Expressões e condições

Quase todo atributo aceita, no lugar de um literal, uma **expressão** sobre os campos da anotação.

| Expressão                                                             | Resultado                                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "$field": "label", "default": "Botão" }`                           | O valor do campo. Se o campo está vazio (`null`, ausente ou só espaços), vale o `default`; sem `default`, vale o padrão do atributo.                              |
| `{ "$if": <condição>, "then": …, "else": … }`                         | `then` se a condição vale; senão `else` (opcional; sem ele vale o padrão do atributo). `then` e `else` são expressões.                                            |
| `{ "$switch": "variant", "cases": { "a": …, "b": … }, "default": … }` | O caso cujo nome é o valor do campo; `default` (opcional) se não há caso ou o campo está vazio.                                                                   |
| `{ "$concat": ["R$ ", { "$field": "preco" }] }`                       | Só em texto: junta as partes (números viram texto).                                                                                                               |
| `{ "$add": […] }`, `{ "$mul": […] }`, `{ "$sin": … }`…                | `formatVersion` 4. Contas de número (veja "Contas e comparações").                                                                                                |
| `{ "$rows": "items" }`, `{ "$size": "width" }`                        | `formatVersion` 4. O número de linhas de um campo `table` e a largura ou altura da instância (veja "Contas e comparações").                                       |
| `{ "$token": "primary" }`                                             | `formatVersion` 4. O valor do token da especialização no modo do desenho (veja "Tokens de design (`$token`)"). Só onde se espera cor, número ou família de fonte. |

```json
{
  "text": { "$concat": [{ "$field": "label" }, " (", { "$field": "count" }, ")"] },
  "visible": { "$has": "label" },
  "fill": { "$switch": "variant", "cases": { "filled": "#6750A4" }, "default": "none" }
}
```

**Condições** (`$if`, `visible`, `italic`): um objeto com **um** operador.

| Condição                                   | Verdadeira quando                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `{ "$field": "selected" }`                 | O campo é "verdadeiro" (veracidade, abaixo).                                                         |
| `{ "$eq": ["variant", "ghost"] }`          | O campo é igual ao valor (comparado como texto; campo vazio nunca é igual).                          |
| `{ "$has": "label" }`                      | O campo não está vazio.                                                                              |
| `{ "$not": <condição> }`                   | A condição é falsa.                                                                                  |
| `{ "$and": [<condição>, …] }`              | Todas valem.                                                                                         |
| `{ "$or": [<condição>, …] }`               | Alguma vale.                                                                                         |
| `{ "$gt": [a, b] }`, `$gte`, `$lt`, `$lte` | `formatVersion` 4. Comparação de números; operando sem valor dá falso (veja "Contas e comparações"). |

**`$field` numa condição lê o campo por veracidade**, nunca como texto: o campo é verdadeiro quando não está vazio e o valor, sem diferença de maiúsculas, não é `""`, `"não"`, `"nao"`, `"no"`, `"false"`, `"0"` nem `"off"`; um número é verdadeiro quando diferente de 0. É assim que os booleanos funcionam: **um booleano é um campo `enum` com `["sim", "não"]`**, e `{ "$field": "selected" }` vale `sim`. O mesmo vale em `visible: { "$field": "x" }`. Os operadores `$eq`, `$has`, `$not`, `$and`, `$or`, `$gt`, `$gte`, `$lt` e `$lte` podem aparecer direto em `visible` e `italic`; `$field` fica como expressão.

Uma expressão que cita um campo que o **tipo não declara** é erro do validador da biblioteca (o desenho não acha o valor); campo do tipo que o desenho não usa é aviso, **a menos que o `code` do tipo o use**: chave de `params` ou de `values`, o `field` de `variants` (ou dos casos dela) ou uma palavra inteira das `notes` (é o caso de `width`, `height`, `weight` e `contentDescription`, que viram modificador ou argumento no código e não mudam o desenho).

### Contas e comparações (`formatVersion` 4)

Na `formatVersion` 4 as expressões **calculam**. Cada operando é uma expressão de número: um literal, `$field`, `$token` numérico, outra operação, `$if` ou `$switch`. As operações valem onde vale um número (tamanhos, `gap`, `padding`, `opacity`, `cornerRadius`, `font.size`…) e dentro de `$concat`.

| Operação                                         | Resultado                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `{ "$add": [a, b, …] }`, `{ "$mul": [a, b, …] }` | Soma e produto de 2 ou mais operandos.                                         |
| `{ "$sub": [a, b] }`, `{ "$div": [a, b] }`       | Exatamente 2 operandos.                                                        |
| `{ "$mod": [a, b] }`                             | Resto com o **sinal do divisor** (`((a % b) + b) % b`): `-1 mod 12` vale `11`. |
| `{ "$round": a }`, `$floor`, `$ceil`, `$abs`     | Um operando.                                                                   |
| `{ "$min": [a, b, …] }`, `{ "$max": [a, b, …] }` | O menor e o maior de 2 ou mais.                                                |
| `{ "$clamp": [valor, mínimo, máximo] }`          | O valor preso ao intervalo.                                                    |
| `{ "$sin": a }`, `{ "$cos": a }`                 | Seno e cosseno, com `a` em **graus**.                                          |

```json
{ "width": { "$mul": [{ "$field": "progress" }, 200] } }
```

- **Sem número, sem valor.** Um operando vazio, ou cujo texto aparado não é número (a vírgula não vale: `"0,5"` não é número), faz a operação **não produzir valor**, como o `$field` vazio sem `default`: vale o padrão do lugar. A divisão e o resto por zero também. O desenho não avisa; o validador recusa o operando **literal** que não é número (`template.width.$add[1]: precisa ser número`) e a aridade errada (`template.width.$sub: precisa de 2 operandos`).
- **Número no texto.** No `$concat` e no `text`, um número não inteiro sai com até 6 casas, sem zeros à direita (`0.1 + 0.2` vira `0.3`, não `0.30000000000000004`); o inteiro sai como sempre.
- **Comparações** são condições: `{ "$gt": [a, b] }`, `$gte`, `$lt` e `$lte`, cada uma com dois operandos de número. Valem em `$if`, `visible`, `$and`, `$or` e `$not`; operando sem valor dá **falso**. O `$eq` continua `[campo, valor]`.
- **`$rows` e `$size`.** `{ "$rows": "<campo table>" }` é o **número de linhas** do campo (sem linhas, 0); o validador da biblioteca recusa campo que não é `table` do tipo (`$rows conta as linhas de "titulo", que é um campo string do tipo "tabela", não uma table`). `{ "$size": "width" }` ou `"height"` é a **largura ou a altura da instância**, em px da imagem (o retângulo da marcação): é o que deixa um carousel ou uma barra seguir a largura disponível, e `left: { "$mul": [{ "$size": "width" }, 0.5] }` segue a marcação ao ser redimensionada. Na prova de desenho e na medida do `hug` da instância (`measureComponent`), vale o `size` do componente. `$size` com outro valor é erro (`template.width.$size: esperava "width" ou "height"`).
- **Campos citados.** Os campos dentro de uma operação, de `$rows` ou de uma comparação contam para o redesenho como em qualquer outra expressão. `{ "$field": "$index" }` (o índice da linha de um `repeat`) não é campo do tipo.
- **Calcule em vez de enumerar.** Não escreva um `$switch` de dezenas de casos sobre um número (nem um `$eq` por valor): use a conta. Numa `formatVersion` menor que 4, cada chave nova é erro `só é permitido com formatVersion 4`, no caminho dela (`template.width.$mul`).

### Tokens de design (`$token`, `formatVersion` 4)

`{ "$token": "<nome>" }` lê um valor nomeado da chave `tokens` da especialização (a `formatVersion` 15 dela, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Tokens de design"). O motor troca cada `$token` pelo valor antes de desenhar, então o token vale em qualquer lugar onde a expressão vale, inclusive como resultado de `$switch` e `$if`.

```json
{
  "type": "frame",
  "fill": { "$token": "primary" },
  "cornerRadius": { "$token": "radius-md" },
  "padding": { "$token": "space-4" },
  "children": [
    {
      "type": "text",
      "text": { "$field": "label" },
      "color": {
        "$switch": "variant",
        "cases": { "filled": { "$token": "on-primary" } },
        "default": { "$token": "primary" }
      },
      "font": { "family": { "$token": "font-mono" }, "size": 14 }
    }
  ]
}
```

- **Onde vale:** cor (`fill`, `color`, `stroke.color`, `shadow.color`, a cor de cada stop do gradiente, `background` e `color` de um trecho de `runs`), número (`gap`, `padding` (também o `padding` de um trecho de `runs`), `font.size`, `font.weight`, `cornerRadius`, `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, `width`/`height`, `opacity`…) e família de fonte (`font.family`, `family` de um trecho). Em enum, booleano ou texto (`layout.type`, `visible`, `text`…) é o erro `$token só vale onde se espera cor, número ou família de fonte`.
- **Também vale em:** `shadow.x`, `shadow.y` e `shadow.blur`, em cada item da lista de `cornerRadius`, em cada item de `stroke.dash` e em `stroke.offset` (só `$token` de número, sem outra expressão).
- **`alpha`** (opacidade): em posição de cor, `{ "$token": "scrim", "alpha": 0.32 }` multiplica o alfa da cor do token (um `#rrggbbaa` com alfa 0,5 e `alpha` 0,5 dá 0,25; `alpha: 0` é transparente, útil na parada de um degradê; `none` continua `none`). `alpha` é número de 0 a 1 ou `{ "$token": … }` de número. O motor devolve `#rrggbbaa`, então a app, o visualizador e o raster recebem a cor pronta. Fora de cor é o erro `alpha só vale em $token de cor` (no caminho `…$token`); fora de 0 a 1, `esperava número entre 0 e 1`.
- **Versão:** só na `formatVersion` 4 do componente; nas versões 1 a 3 o erro é `só é permitido com formatVersion 4`, no caminho da chave. O nome segue `[a-z0-9][a-z0-9-]*`; o objeto só aceita `$token` e, em cor, `alpha`.
- **Tokens embutidos:** `font-sans` e `font-mono` (família) existem em toda biblioteca e valem a fonte do hospedeiro: a app usa o `--font-sans` e o `--font-mono` do tema, o visualizador usa a pilha dos tokens da app ou a opção `fonts` do `createViewer`, e o MCP usa a Mapping Sans embutida (a Mapping Mono em `font-mono`; ver "Medida do texto"). A especialização pode redefini-los em `tokens.values`, e a definição dela vence a do hospedeiro. O texto sem `font.family` usa `font-sans`.
- **Modo:** o desenho segue o modo do projeto e do container (`drawingMode`, ver `docs/FORMAT.md`); sem modo escolhido, usa o **primeiro** de `tokens.modes`, e um modo não declarado cai no primeiro, sem aviso.
- **Validação:** o `parseComponent` confere a forma e a posição e entrega a lista de `$token` do arquivo; o validador da biblioteca (`validate_library`, nível 2) cruza com os `tokens` da especialização e recusa o token inexistente (`o token "x" não existe nos tokens da especialização`) e o de tipo errado (`o token "primary" é cor, mas aqui se espera número`), com o caminho do nó (`template.children[0].fill`). Sem `tokens` na especialização, só os embutidos existem.

## Avisos do motor

O motor **avisa**, não recorta nem recusa: conteúdo maior que o slot ou que a tela sai desenhado como pedido e o aviso acompanha. Os avisos são textos (em português) e vêm de três lugares.

**Ao desenhar um componente** (`instantiate`):

| Aviso                                             | Quando                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `campo não informado: <chave>`                    | O template cita um campo que não está nos valores recebidos (o campo existe no tipo e o valor não veio).                                                                                                                                                                                                        |
| `fill dentro de hug vira 0`                       | Um filho `fill` no eixo principal de um quadro `hug` (dentro de um template o `fill` vale 0).                                                                                                                                                                                                                   |
| `texto medido com largura 0: <nó>`                | Um texto com largura definida (`fill` ou `%`) foi medido com largura máxima 0 (o pai não tem largura para ele); sai quebrado letra a letra.                                                                                                                                                                     |
| `valor inválido em <chave>: <valor>`              | Uma expressão de `layout.type`, `layout.align`, `layout.justify`, `width` ou `height` (`formatVersion` 4) resolveu fora do conjunto; vale o padrão. Também `shadow.blur` negativo (vale 0), `stroke.offset` negativo (vale 0) e `stroke.dash` que não é lista de números maiores ou iguais a 0 (sem tracejado). |
| `texto maior que a caixa: <nó>`                   | Um texto com largura e altura definidas quebra em mais linhas do que a altura comporta (tolerância de 1 px) e não tem `maxLines` nem `ellipsis` que o corte (`formatVersion` 4 ou não).                                                                                                                         |
| `conteúdo maior que a caixa: <quadro>`            | Os filhos (tamanhos fixos mais `gap`s) passam do conteúdo do quadro no eixo principal, ou um filho fixo passa do conteúdo no eixo cruzado (tolerância de 1 px quando entre os filhos há texto).                                                                                                                 |
| `ícone esticado: escala diferente nos dois eixos` | A caixa de um `path` ou `icon` tem outra proporção que o `viewBox`.                                                                                                                                                                                                                                             |
| `ícone desconhecido: <nome>`                      | O `name` de um nó `icon` não está no conjunto de ícones da especialização (ou ela não declara `icons`): o nó vira o reservado (`formatVersion` 4).                                                                                                                                                              |

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

Os avisos não se repetem. A mesma regra vale na prova de desenho do validador da biblioteca (nível 3), onde cada aviso do motor vira um aviso do pacote. A prova roda cada caso **em cada modo** de `tokens` da especialização, com os tokens do modo resolvidos (o tamanho e a família do texto vêm do token); o aviso cita o modo (`tipo "card", o preview, modo dark, tamanho inicial 300×120: …`) o aviso igual em todos os modos sai uma vez, sem modo, e, sem `tokens`, a mensagem não traz modo.

## Texto de uma linha, reticências e `maxLines`

Na `formatVersion` 4, o `font` do nó `text` ganha três chaves (todas aceitam expressão, e `$field`/`$switch` valem como nas outras):

| Chave      | Valores                    | Efeito                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrap`     | `"word"` (padrão) `"none"` | `"word"` quebra por palavra na largura da caixa. `"none"` é **uma linha por parágrafo**: o texto não quebra. Numa caixa de largura fixa e sem `ellipsis`, a linha que passa da caixa é **recortada por pixel** na caixa do texto (a letra sai cortada no meio, como `white-space: nowrap; overflow: hidden`), com `align` `left`, `center` ou `right` (uma linha mais larga que a caixa começa na borda esquerda); na app, no visualizador e no PNG do MCP. |
| `ellipsis` | `true` / `false` (padrão)  | O texto que não cabe termina em `…`: na largura, com `wrap: "none"`; na altura, depois de `maxLines` linhas.                                                                                                                                                                                                                                                                                                                                                |
| `maxLines` | inteiro ≥ 1                | Número máximo de linhas. A última linha permitida leva o `…` (com `ellipsis`) ou é cortada (sem). Zero, negativo ou fracionário é erro.                                                                                                                                                                                                                                                                                                                     |

A medida do texto (`hug`, quebra e a prova de desenho) recebe as três chaves e mede o que o desenho mostra: `wrap: "none"` mede uma linha só, e `maxLines` limita a altura a `maxLines` × a altura da linha. Uma linha só quebra quando passa da largura da caixa por mais de **0,5 px** (uma folga única, igual no motor, no medidor do Konva e no desenho): a soma das larguras das palavras e a largura medida do DOM diferem na ponta do ponto flutuante, e sem a folga a última palavra cairia para a linha de baixo por uma fração de pixel.

Numa `formatVersion` menor que 4 elas são erro (`template.children[0].font.wrap: só é permitido com formatVersion 4`, também com expressão).

Quando as linhas quebradas passam da altura do nó e nada as corta (nem `maxLines` nem `ellipsis`), o desenho avisa `texto maior que a caixa: <nó>`, que entra na pendência "o componente não cabe" como o `conteúdo maior que a caixa`. Em ambos o excesso que **vem de texto** tem uma tolerância de 1 px por nó de texto (o DOM e o canvas diferem em frações de pixel).

## Centro pela maiúscula: `cap-middle` (`formatVersion` 4)

`font.verticalAlign` aceita, além de `top`, `middle` e `bottom`, o valor `"cap-middle"` (literal ou por expressão: um `$switch`/`$if` pode devolvê-lo). Ele é opt-in: o `middle` continua centrando a **caixa de linha** (como o CSS e o DOM da app) e nenhum desenho que não use o valor novo muda.

**A regra.** O bloco que vai do **topo da maiúscula da primeira linha** à **linha de base da última linha** fica centrado na caixa do nó. Ele mede `capHeight + (n − 1) × lineHeight`; a primeira linha de base fica em `(altura − bloco) / 2 + capHeight` e as seguintes descem `lineHeight`. Com uma linha só, o centro da altura da maiúscula cai no centro da caixa, qualquer que seja a fonte. Texto mais alto que a caixa segue a mesma conta (passa dos dois lados, como o `middle`); o recorte e o aviso `texto maior que a caixa` não mudam. Vale também para `maxLines` (centra as linhas que sobram) e para `runs`, com o `capHeight` da fonte base do nó e as linhas de base da primeira e da última linha.

**De onde vem o `capHeight`.** É a altura da maiúscula da fonte efetiva no tamanho do nó, em px fracionários: na app e no visualizador, `measureText('H').actualBoundingBoxAscent` do canvas (sem ela, `0,7 × size`). A medida do texto (`hug`, quebra, avisos) não muda: só a posição do desenho.

Numa `formatVersion` menor que 4 o literal é erro: `template.children[0].font.verticalAlign: só é permitido com formatVersion 4`.

## Texto rico: trechos e caixa em linha

Na `formatVersion` 4, o nó `text` aceita `runs` **no lugar de** `text`: uma lista não vazia de **trechos**, cada um com o seu estilo, que quebram linha juntos como um texto só. Serve para o negrito ou a cor no meio da frase e para o "chip" (uma caixa com fundo dentro da linha, como o rótulo `vencida` de uma fatura). Use `runs` em vez de trocar o rótulo por espaços e desenhar o chip por cima com outro nó: o chip acompanha o texto quando ele quebra ou muda de largura.

Cada trecho é um objeto com `text` (obrigatório) e as chaves abaixo. Todas aceitam expressão, e o `text` do trecho aceita `$field`, `$concat` e as outras, avaliado como o `text` do nó (número vira texto, vazio vira texto vazio).

| Chave        | Valores                                                             | Efeito                                                                                      |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `text`       | texto, número ou expressão                                          | O texto do trecho. Obrigatório.                                                             |
| `weight`     | 100 a 900                                                           | Sobrepõe o `font.weight` do nó.                                                             |
| `italic`     | `true` / `false`                                                    | Sobrepõe o `font.italic` do nó.                                                             |
| `family`     | família ou pilha CSS                                                | Sobrepõe o `font.family` do nó (família ou pilha CSS, como no `font`).                      |
| `size`       | número                                                              | Sobrepõe o `font.size` do nó. A altura de linha do trecho escala com ele (veja abaixo).     |
| `decoration` | `none`, `underline`, `line-through`                                 | Sobrepõe o `font.decoration` do nó.                                                         |
| `color`      | cor CSS                                                             | Sobrepõe o `color` do nó.                                                                   |
| `background` | cor CSS                                                             | **Faz do trecho um chip**: uma caixa em linha com esse fundo. Sem ele, o trecho é só texto. |
| `radius`     | número maior ou igual a 0                                           | Raio do canto do chip. Só vale com `background`. Padrão 0.                                  |
| `padding`    | número, ou `[vertical, horizontal]` (números maiores ou iguais a 0) | O respiro do chip: um número vale nos dois eixos. Só vale com `background`. Padrão 0.       |

Exemplo, uma fatura com o mês em negrito e um chip vermelho no fim da linha:

```json
{
  "type": "text",
  "name": "aviso",
  "width": "fill",
  "color": "#1D1B20",
  "font": { "size": 14, "lineHeight": 20 },
  "runs": [
    { "text": "Fatura de " },
    { "text": { "$field": "mes" }, "weight": 700 },
    { "text": " " },
    {
      "text": "vencida",
      "color": "#FFFFFF",
      "background": "#B3261E",
      "radius": 8,
      "padding": [2, 6]
    }
  ]
}
```

**O que é do nó e o que é do trecho.** O nó dá a base: o `font` e o `color`. O trecho sobrepõe só `weight`, `italic`, `family`, `size`, `decoration` e `color`. `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`, `ellipsis` e `maxLines` são **só do nó** e valem para todos os trechos (não existem no trecho: chave desconhecida).

**Quebra de linha.** Os trechos quebram **como um texto só, pela palavra**, e não um trecho por linha:

- As oportunidades de quebra são os **espaços dos trechos sem fundo** e as **bordas de um chip**. Uma palavra que atravessa trechos sem espaço entre eles (`"Pa"` e `"gar"`) é uma palavra só: o negrito no meio da palavra não a parte.
- `\n` num trecho sem fundo quebra a linha; num chip vira espaço.
- Um espaço no começo da linha é **descartado** num trecho sem fundo e **mantido** num chip (o chip desenha o texto inteiro, com o espaço inicial dentro do respiro). Espaço no fim da linha não conta na largura.

**O chip.** É um átomo inquebrável: a largura é a do texto mais 2·h (o `padding` horizontal) e a altura é a altura de linha do trecho mais 2·v (o vertical). Se não cabe no resto da linha, vai **inteiro** para a de baixo; se é maior que a linha inteira, fica sozinho na linha e passa da largura (nunca quebra por dentro). Componente da biblioteca dentro da linha não existe: o chip é um trecho, não um nó.

**Altura da linha.** A altura de linha de um trecho é a `lineHeight` do nó vezes o tamanho do trecho sobre o tamanho do nó (um trecho com `size` 21 num nó de 14 e `lineHeight` 20 tem linha de 30). Cada linha tem a maior altura entre a do nó e a dos pedaços dela; o chip conta com o respiro vertical (um chip com `padding` `[2, 6]` numa linha de 20 faz a linha de 24). Os pedaços ficam **centrados verticalmente** na linha, não alinhados pela linha de base (veja "Limites conhecidos").

**Reticências e linhas máximas.** `wrap`, `ellipsis` e `maxLines` do nó valem para o texto rico. `ellipsis` tira caracteres do fim do último pedaço de texto da linha (corta no meio de um trecho, se preciso; um chip sai inteiro, nunca cortado) e o `…` usa a fonte desse pedaço.

Numa `formatVersion` menor que 4, `runs` é erro (`template.children[0].runs: só é permitido com formatVersion 4`). Outros erros: `text` e `runs` juntos (`template.children[0]: text e runs juntos: use um ou outro`), `runs` vazio ou que não é lista (`template.children[0].runs: esperava lista não vazia de trechos`), trecho sem `text` (`template.children[0].runs[0].text: campo obrigatório`) e chave desconhecida no trecho (`template.children[0].runs[1].bogus: chave desconhecida: bogus`).

## Medida do texto

`hug`, quebra de linha e a altura de um texto dependem da **medida do texto**, que o motor recebe de fora (uma função `TextMeasurer`). Há duas:

- **Real**, no navegador: o Konva mede o texto com a fonte carregada. É o `konvaMeasurer`, usado pela app e pelo visualizador. A altura de linha segue o CSS (veja `lineHeight` em "Nós"): o teste do Chromium (`tests/e2e/textMetrics.spec.ts`) confere que o canvas e o DOM medem a mesma altura (2 linhas de `lineHeight` 18,5 px = 37).
- **Fonte livre, no servidor MCP**: `createMeasurer` (`mcp/image/textMeasurer.ts`) mede com o `opentype.js` e a fonte embutida (Mapping Sans e Mono, regular e negrito) ou a `fonts` da biblioteca, com kerning e `letterSpacing`; `render_marking`/`render_container` desenham as letras com a mesma fonte, então medida e desenho andam juntos. Sem a fonte do componente (fonte do sistema da app), a largura é a da fonte livre, não a da app.
- **Aproximada**, no Node (e nos testes do modelo): `approximateMeasurer`, sem canvas. Largura ≈ 0,55 × o tamanho da fonte por caractere (0,6 se o peso é 600 ou mais) mais o espaçamento entre letras; altura = número de linhas × altura de linha; com largura máxima, quebra por palavras; respeita `wrap`, `ellipsis` e `maxLines` e devolve as linhas já cortadas (`lines`).

O texto rico (`runs`) usa a mesma medida: o layout dos trechos mede cada pedaço de uma linha com o medidor, na fonte do trecho, e **o mesmo layout** serve à medida do `hug`, à prova de desenho do validador e ao desenho. Por isso a altura de um texto `hug` com `runs` é a soma das linhas (com a altura do chip) e a largura é a da linha mais larga. O servidor MCP também desenha o texto rico com letras (`render_marking`, `render_container` e o `get_marking_image` de container sem arquivo), com a fonte livre embutida.

Quem lê um aviso terminado em **`(aproximado)`** (a prova de desenho do validador da biblioteca, no servidor MCP ou na skill) deve entender que o texto foi medido pela aproximação: um aviso de "conteúdo maior que a caixa" pode sumir, ou aparecer só em outro tamanho, quando o navegador medir com a fonte de verdade. O aviso é um sinal para olhar, não uma sentença. E o contrário também vale: sem o aviso, o navegador pode medir um pouco mais largo.

## Validação

`parseComponent(json)` (em `src/model/components/parseComponent.ts`) devolve o mesmo contrato do `parseSpec`:

```ts
{ ok: true; component: ComponentFile }
| { ok: false; issues: { path: string; message: string }[]; errors: string[] }
```

- `errors[i]` é `"caminho: mensagem"` (ou só a mensagem quando o caminho é vazio), com o caminho JSON do problema: `template.children[1].text: esperava texto ou número`.
- O formato é **estrito**: chave desconhecida em qualquer nó, expressão, estilo ou na raiz é problema (`chave desconhecida: <chave>`). Outros problemas: `format`/`formatVersion` errados (`esperava 1, 2, 3 ou 4`), `image` numa `formatVersion` menor que 3 (`o nó image só existe na formatVersion 3`), `src` fora da regra do nó `image`, `width`/`height` `hug` no `image`, `repeat` numa `formatVersion` 1 (`o nó repeat só existe na formatVersion 2`, no caminho do nó), o nó `icon`, `runs`, `stroke.cap`, `stroke.join`, `stroke.sides`, `stroke.offset` ou `layout.reverse`, `stroke.dash` por expressão, `layout.justify` `space-around` ou `space-evenly`, `font.wrap`, `font.ellipsis` ou `font.maxLines` (`font.maxLines` que não é inteiro maior ou igual a 1: `esperava inteiro maior ou igual a 1`), `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `repeat.distribute` ou expressão em `layout.type`, `layout.align`, `layout.justify`, `width` ou `height` numa `formatVersion` menor que 4 (`só é permitido com formatVersion 4`, no caminho da chave), `text` e `runs` juntos no mesmo nó (`text e runs juntos: use um ou outro`, no caminho do nó), `runs` vazio ou que não é lista (`esperava lista não vazia de trechos`), trecho sem `text` ou com chave desconhecida, `padding` ou `radius` do trecho negativo, `min` literal maior que o `max` do mesmo eixo (`<nó>.minWidth: não pode ser maior que maxWidth`), `minWidth`, `maxWidth`, `minHeight` ou `maxHeight` negativo ou que não é número (`esperava número maior ou igual a 0`), `distribute` fora de `none`/`fill`, `sides` vazio, repetido ou fora de `top`/`right`/`bottom`/`left`, `sides` em `ellipse` ou `path`, `stroke.offset` fora de `frame`, `rect` e `ellipse` (`só vale em frame, rect e ellipse (este é <tipo>)`) ou negativo, `alpha` do `$token` fora de cor (`alpha só vale em $token de cor`) ou fora de 0 a 1, `repeat` sem `field` ou sem `template`, `repeat` ou `slot` dentro de um `repeat`, `id` fora do padrão, `size`/`minSize` inválidos, `minSize` maior que `size`, raiz do template que não é `frame`, `children` ou `layout` num nó que não é quadro (o `slot` aceita `layout`), tamanho de nó fora de `número`/`fill`/`hug`/`NN%`, expressão com mais de um operador, condição sem operador, peso de fonte fora de 100 a 900, cor vazia.
- `parseComponentText(texto)` lê o texto JSON (JSON inválido vira um problema de caminho vazio) e `validateComponent(json)` devolve só a lista `string[]`.
- `docs/component.schema.json` espelha a estrutura (para editores e geradores); ele **não** substitui o parser, e o código é a fonte da verdade.
- O **validador da biblioteca** (`src/model/library.ts`, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Validação da biblioteca") roda o `parseComponent` em cada componente do pacote e confere o que depende de mais de um arquivo (o campo citado pelo desenho existe no tipo, o `slot` declarado existe no template; num `repeat`, o `field` é uma `table` do tipo e cada chave citada no `template` é coluna dela ou campo do tipo; o `preview` de uma `table` é uma lista de linhas com colunas que existem).

## Limites conhecidos

- **Um slot por componente.** Os filhos de uma instância vão sempre para o primeiro slot do template (busca em profundidade). Vários slots ficam para depois.
- **Imagem só remota e só no nó `image`.** O arquivo do componente não carrega bitmap; a imagem vem de uma URL `https://` (um campo `string`) e não é gravada no projeto. Imagem local no pacote fica para depois (por isso o caminho relativo é recusado no `src`). Elipse e caminho não aceitam imagem como preenchimento.
- **`formatVersion` 1, 2, 3 e 4.** A 2 acrescenta só o `repeat`, a 3 só o `image`, a 4 só `stroke.cap`, `stroke.join`, `stroke.sides` e `stroke.offset`, `stroke.dash` por expressão, `$token` em sombra, raios e tracejado, `alpha` no `$token` de cor, `layout.justify` `space-around`/`space-evenly`, `layout.reverse`, `font.wrap`, `font.ellipsis` e `font.maxLines`, a expressão no layout e no tamanho, `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, `repeat.distribute`, `runs` (o texto rico), `$token` (os tokens de design) e o nó `icon` (o conjunto de ícones) (a medição em duas passagens vale em todas), e as anteriores continuam aceitas sem mudança. Mudar o formato do componente pede uma versão nova e a decisão de aceitar as antigas.
- **Contas só com número, sem datas nem texto.** As operações (`$add`, `$mul`, `$sin`…), as comparações (`$gt`…), `$rows`, `$size`, o `repeat` por `count` com `$index` e as âncoras por expressão valem só na `formatVersion` 4 do componente e só sobre números: não há função de data (`$weekday`), nem formatação de texto além do número (casas fixas, zero à esquerda, separador de milhar). Um MCP anterior a esta versão recusa a chave nova no caminho dela.
- **`rotation` é só desenho e gira em volta do centro da caixa.** Ela não muda layout nem medida; o conteúdo de um `slot` dentro de um nó girado não gira; o recorte ampliado (traço e sombra fora da caixa) de um quadro com filhos girados conta a caixa do filho girado, não o que há dentro dele.
- Gradiente só `linear`; sombra só uma por nó; borda uma por nó.
- Listas que viram campos numerados (`label1`, `label2`…) são frágeis: para um dado em forma de tabela (os eventos de uma tela, as propriedades de uma chamada), declare um campo `table` e desenhe-o com `repeat`. Os componentes do Material 3 (a barra de navegação, a folha com N itens) ainda usam campos numerados.
- O `repeat` não aninha no validador (uma `table` não tem `table` dentro; o motor expande um `repeat` dentro de outro, mas o arquivo é recusado) e não mede a tabela para crescer a marcação: a caixa é da marcação. Um desenho de linha com colunas de largura alinhada entre linhas (uma grade) precisa de larguras fixas ou em `%`; `hug` mede cada linha à parte. Para linhas de alturas iguais que ocupam o espaço do pai, use `distribute: "fill"` (`formatVersion` 4).
- **`fill` no eixo principal de um pai `hug` continua valendo 0** (com o aviso `fill dentro de hug vira 0`): não há de onde tirar o tamanho. O que a medição em duas passagens resolve é o `fill` e o `%` no eixo **cruzado**, como um texto que quebra numa coluna `hug`.
- A medida do texto no Node é aproximada (ver acima).
- **Sombra interna não existe.** `shadow` é sempre externa; para um efeito de fundo afundado, desenhe um nó a mais.
- **`stroke.sides` com cor ou largura por lado.** Os lados pedidos compartilham cor, largura, `align` e `dash`; para valores diferentes por lado, use dois nós (cada um com os seus `sides`).
- **O `middle` centra a caixa de linha, não a maiúscula.** A caixa de linha tem o ascent e o descent da fonte, que variam de uma fonte para outra; o rótulo de uma linha pode ficar alguns décimos de px acima ou abaixo do centro da letra. Para o rótulo de uma linha (botão, chip, aba, campo), use `cap-middle`; para parágrafo, ou para bater com o DOM linha a linha, o `middle`.
- **`cap-middle` com trechos maiores que o do nó.** O `capHeight` é o da fonte base do nó; um trecho com `size` maior pode ficar fora do centro.
- **Texto rico não alinha pela linha de base.** Os pedaços de uma linha (texto de tamanhos diferentes e chips) ficam centrados verticalmente na linha. Com trechos de `size` bem diferentes, as letras podem não encostar na mesma linha de base; para um destaque grande, prefira um chip ou um nó à parte.
- **Componente da biblioteca dentro da linha de texto não existe.** O chip é um trecho com fundo (texto, cor, raio e respiro), não um nó: um ícone ou outro componente no meio do texto pede um quadro `row` com nós vizinhos.
- **A imagem do MCP não é a da app.** `render_marking` e `render_container` desenham com a fonte livre embutida (ou a `fonts` da biblioteca): a largura do texto difere da fonte do sistema da app, então uma quebra de linha pode cair em outro lugar. O gradiente vale a primeira cor, a imagem remota vira um reservado e a sombra não tem `spread` nem versão interna.
