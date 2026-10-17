# Formato da especialização (`formatVersion` 1 a 4)

O formato do arquivo que define camadas e tipos de anotação (e, na `formatVersion` 2, as plataformas de código; na 3, as origens externas; na 4, a **biblioteca**: componentes, documentos, exemplos, fontes, origens executáveis e o contrato de versão). A página "Ajuda → Especializações" da app é uma versão resumida deste documento (um teste garante que os títulos das seções e os blocos de código coincidem).

## O que é uma especialização

Uma **especialização** é um arquivo JSON que define **camadas obrigatórias** e os **tipos de anotação** que podem ser criados nelas. Ex: a especialização **SDUI** traz a camada Componentes (Button, Input…) e a camada Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e só falta preencher os valores.

- Um projeto pode aplicar **várias** especializações, a qualquer momento.
- Uma especialização **não cita outra pelo nome**. A ligação entre elas é feita por **referências fortes** (tipo `ref`) que escolhem os alvos por **etiquetas**.
- Camadas da especialização só aceitam anotações **tipadas**, sem chaves extras. Camadas criadas pelo usuário continuam livres.
- A especialização aplicada é **copiada** para `specs/<id>.json` dentro do projeto, que fica autocontido. A cópia mantém a `formatVersion` com que foi aplicada.
- A `formatVersion` 2 liga a especialização ao código (plataformas e `code`). A importação aceita as versões 1 a 4; uma especialização v1 é uma v2 sem plataformas e sem `code` (ver "Plataformas e code").
- A `formatVersion` 3 é a 2 mais `sources`: a que elementos de um sistema externo cada tipo corresponde e de que propriedade de origem vem cada campo (ver "Origens (sources)").
- A `formatVersion` 4 é a 3 mais a **biblioteca**: o tipo aponta para um componente (`component`), um documento (`doc`) e exemplos (`examples`); a raiz ganha `fonts`, `origins` e `migrations`; as `sources` ganham `path`, `slot` e `ignore` (ver "Origens (sources)", "Biblioteca: o pacote", "Contrato de versão" e "Validação da biblioteca"). As versões 1, 2 e 3 continuam aceitas sem mudança: cada chave da v4 numa versão anterior é o erro `só é permitido com formatVersion 4`, no caminho exato.

Arquivos de apoio:

- `docs/spec.schema.json`: JSON Schema (draft 2020-12). Valida só a **estrutura**; as regras entre elementos (ids únicos, `allowedChildren`, `requiresOwner`, `labelField`, `rowLabel`, `default` compatível, plataformas declaradas, chaves de `params` e `values`, `sources` só a partir da versão 3, `values` das origens só em `enum` e com destinos nas `options`, `path`/`slot`/`ignore` só em sistema declarado em `origins`, `examples` em um modo só, os passos de `migrations` coerentes com os tipos e campos) só são verificadas pelo validador da app (`src/model/spec.ts`, que é a fonte da verdade).
- `docs/component.schema.json`: JSON Schema do arquivo de componente (`docs/COMPONENT-FORMAT.md`).
- `examples/specs/sdui.json` (`formatVersion` 2) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1): exemplos completos.
- `examples/specs/biblioteca.json` (`formatVersion` 4): exemplo pequeno com `component`, `doc`, `examples`, `fonts`, `origins`, `path`/`ignore` nas `sources` e `migrations`. É só o arquivo da especialização: os arquivos que ele cita (`components/`, `docs/`, `examples/`, `fonts/`) não vêm junto.
- `examples/libraries/material3/`: um pacote de biblioteca **completo** (especialização v4, quinze componentes, documentos, exemplos e uma tela de exemplo de um sistema externo), gerado por `npm run build:examples` (ver "Biblioteca: o pacote").

## Formato do arquivo

```json
{
  "format": "mapping-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "description": "opcional",
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "input",
          "name": "Input",
          "labelField": null,
          "requiresOwner": false,
          "allowedChildren": ["onChange"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            {
              "key": "tipo",
              "type": "enum",
              "options": ["text", "email"],
              "default": "text"
            },
            {
              "key": "dado",
              "type": "ref",
              "accepts": { "tags": ["data-field"], "free": true }
            }
          ]
        }
      ]
    }
  ]
}
```

Na raiz: `format` (sempre `"mapping-spec"`), `formatVersion` (`1`, `2`, `3` ou `4`), `id`, `name` e `version` (inteiro ≥ 1) são obrigatórios; `description`, `platforms` (a partir da versão 2) e, só na versão 4, `fonts`, `origins` e `migrations` são opcionais. Cada camada tem `id` (único), `name`, `color` (`#RRGGBB`) e `annotationTypes`. A importação ainda aceita arquivos antigos com `"mapeador-spec"`.

### Tipo de anotação

| Propriedade       | Obrigatória | Descrição                                                                                                       |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `id`              | sim         | Único **na especialização inteira**.                                                                            |
| `name`            | sim         | Nome exibido (ex: "Button").                                                                                    |
| `description`     | não         | Texto de ajuda.                                                                                                 |
| `labelField`      | não         | Chave de um campo `string` cujo valor é o **rótulo da instância** quando o `name` da anotação está vazio.       |
| `requiresOwner`   | não         | Padrão `false`. A anotação precisa ter exatamente um dono (ver "Relações").                                     |
| `allowedChildren` | não         | Ids dos tipos que podem ser **vinculados** a este.                                                              |
| `fields`          | sim         | Lista de campos (pode ser vazia).                                                                               |
| `code`            | não         | A partir da `formatVersion` 2. Como o tipo vira código, por plataforma declarada (ver "Plataformas e code").    |
| `sources`         | não         | A partir da `formatVersion` 3. Elementos de origem a que o tipo corresponde (ver "Origens (sources)").          |
| `component`       | não         | Só `formatVersion` 4. Caminho do arquivo `.json` do componente que desenha o tipo (ver "Biblioteca: o pacote"). |
| `doc`             | não         | Só `formatVersion` 4. Caminho do documento `.md` do tipo (ver "Biblioteca: o pacote").                          |
| `examples`        | não         | Só `formatVersion` 4. Exemplos nomeados do tipo: valores dos campos ou o JSON de um sistema externo.            |

### Campo

| Propriedade   | Obrigatória        | Descrição                                                                                                                                                        |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`         | sim                | Chave gravada no JSON. `[A-Za-z0-9_]`, **não pode começar com `_`** (reservado). Única dentro do tipo.                                                           |
| `label`       | não                | Rótulo exibido (pode ter acentos). Padrão: `key`.                                                                                                                |
| `type`        | sim                | `string`, `number`, `date`, `enum`, `table` ou `ref`.                                                                                                            |
| `required`    | não                | Padrão `false`. Vazio é permitido ao salvar, mas a anotação fica **incompleta**.                                                                                 |
| `default`     | não                | Valor inicial. Precisa ser válido para o tipo. Não existe para `table` nem `ref`.                                                                                |
| `options`     | só `enum`          | Lista não vazia de strings únicas.                                                                                                                               |
| `columns`     | só `table`         | Campos com a mesma estrutura, **apenas** `string`, `number`, `date` ou `enum`.                                                                                   |
| `tags`        | não                | Etiquetas que tornam o campo **alvo de referências** (`[a-z0-9-]+`). Em `table`, cada **linha** vira um alvo.                                                    |
| `rowLabel`    | `table` com `tags` | Chave de uma coluna `string` que nomeia cada linha como alvo.                                                                                                    |
| `accepts`     | só `ref`           | `{ "tags": [...], "free": true\|false }`. Precisa de pelo menos uma etiqueta ou `free: true`.                                                                    |
| `description` | não                | Texto de ajuda exibido no editor.                                                                                                                                |
| `sources`     | não                | A partir da `formatVersion` 3. Propriedades de origem do campo, inclusive em colunas; na v4, `path` em sistema declarado em `origins` (ver "Origens (sources)"). |

## Tipos de valor

- `string`: texto.
- `number`: número, inteiro ou decimal.
- `date`: data ISO `AAAA-MM-DD`.
- `enum`: uma das `options`. Booleanos são `enum` (ex: `["sim", "não"]`).
- `table`: lista de linhas; cada linha é um objeto com as chaves das `columns` (mais o id interno `_id`).
- `ref`: **referência forte** a uma tupla de outra anotação. O valor do campo é a referência.

**Tipo de campo removido: `codeRef`.** Até a etapa 9 existia o tipo `codeRef` (onde a instância foi implementada, por plataforma). Ele saiu do formato: a especialização guarda só o que ajuda a **gerar** código (o `code` dos tipos, com `symbol` e `path`), não referência ao código gerado. Um arquivo antigo com um campo `"type": "codeRef"` continua válido: a importação da app e o `validate_specialization` **leem e ignoram** o campo (ele sai do tipo, junto com as chaves de `params` do `code` que o citam) e dão um aviso com o caminho (`ignored-field`). Nenhuma `formatVersion` nova; as cópias em `specs/` dos projetos existentes continuam abrindo. O JSON Schema ([`spec.schema.json`](spec.schema.json)) descreve só o formato atual e recusa o campo. Ao encontrar um, remova-o do arquivo.

## Relações entre anotações

Sempre dentro da mesma especialização.

- `allowedChildren`: tipos que podem ser vinculados (via `parentAnnotationId`) a este. Um dono pode ter N filhos, inclusive do mesmo tipo. Os filhos devem estar em **outra camada**.
- `requiresOwner: true`: a anotação precisa de exatamente um dono, de um tipo que a liste em `allowedChildren`.

## Referências e etiquetas

Um campo `ref` aponta para um **alvo**. São alvos válidos:

- tuplas de anotações **livres**, se `accepts.free` for `true`;
- campos de anotações tipadas (qualquer especialização aplicada) cujo `tags` contenha alguma etiqueta de `accepts.tags`; numa `table` com `tags`, cada linha é um alvo, nomeada pela coluna `rowLabel`.

Etiqueta recomendada (reutilize em novas especializações): **`data-field`** — atributo de um modelo de dados (classe, entidade, DTO).

## Plataformas e code

A `formatVersion` 2 liga a especialização ao código: ela declara as **plataformas** (um app, um contrato de API…) e como cada tipo de anotação vira código em cada uma. A `formatVersion` 1 continua válida: é a 2 sem plataformas e sem `code`. O núcleo da app é genérico; plataformas, linguagens e componentes de código entram só por estas propriedades.

| Propriedade | Onde                            | Descrição                                                                                                                                                                                |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platforms` | raiz (opcional)                 | Lista de `{ id, name, language }`. `id` no formato `[a-z0-9-]+` e único na especialização; `name` é exibido; `language` é informativo (ajuda o agente).                                  |
| `code`      | tipo de anotação (opcional)     | Objeto por **id de plataforma declarada**; cada entrada tem as propriedades abaixo.                                                                                                      |
| `symbol`    | entrada de `code` (obrigatória) | Componente ou tipo que implementa o tipo de anotação naquela plataforma.                                                                                                                 |
| `path`      | entrada de `code` (opcional)    | Arquivo que define o `symbol`, **relativo à raiz do repositório da plataforma** (`/` como separador, sem `.`, `..`, `/` no começo nem letra de unidade). Sem linha: o `symbol` localiza. |
| `params`    | entrada de `code` (opcional)    | Chave de um campo do tipo → nome do parâmetro no código. Campos fora de `params` não são passados.                                                                                       |
| `values`    | entrada de `code` (opcional)    | Chave de um campo `enum` → (valor no mapping → valor no código). Valor sem tradução é passado como está.                                                                                 |
| `notes`     | entrada de `code` (opcional)    | Orientação livre para o agente.                                                                                                                                                          |

O `path` vale nas `formatVersion` 2 e 3 (não há versão nova). Ele vira link pelo `urlTemplate` e caminho local pelo `localPath` do repositório da plataforma, configurados no projeto (`platformRepos`, ver o [`FORMAT.md`](FORMAT.md)): a app mostra a linha "Definição" nos Detalhes da anotação tipada e o MCP devolve o endereço e o arquivo local (ver o [`AGENT-GUIDE.md`](AGENT-GUIDE.md)).

`code` só vale em especializações que declaram `platforms`. Os ids citados em `code` precisam existir em `platforms`, e as chaves de `params` e `values` precisam ser campos do tipo.

```json
{
  "format": "mapping-spec",
  "formatVersion": 2,
  "id": "sdui",
  "name": "SDUI",
  "version": 2,
  "platforms": [{ "id": "app", "name": "App", "language": "typescript" }],
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "fields": [
            { "key": "texto", "type": "string", "required": true },
            {
              "key": "estilo",
              "type": "enum",
              "options": ["primary", "secondary"],
              "default": "primary"
            }
          ],
          "code": {
            "app": {
              "symbol": "DSButton",
              "path": "app/src/main/java/com/app/ds/DSButton.kt",
              "params": { "texto": "text", "estilo": "style" },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              },
              "notes": "Passe o id como testId."
            }
          }
        }
      ]
    }
  ]
}
```

- Plataformas com o **mesmo id** em especializações diferentes são a mesma plataforma (a configuração do repositório fica no projeto, não na especialização).
- O repositório de cada plataforma (`platformRepos`, no projeto) está em [`FORMAT.md`](FORMAT.md), "Campos da v7". Plataforma em que algum tipo tem `path`, sem repositório configurado no projeto, gera um aviso (não é pendência). O uso de `code` pelo servidor MCP (`get_code_hints`, `find_by_code`) está no [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

## Origens (sources)

A `formatVersion` 3 diz a que elementos de um **sistema externo** (uma ferramenta de design, outro catálogo de componentes…) cada tipo corresponde e de que propriedade de origem vem cada campo. É o que um agente de importação usa para saber que componente vira que tipo, sem deduzir pelo nome. O núcleo não interpreta `system` nem os nomes: só valida a estrutura e devolve os dados a quem pedir.

```json
{
  "id": "button",
  "name": "Button",
  "sources": [{ "system": "figma", "id": "3f2a9c", "name": "DS/Button" }],
  "fields": [
    {
      "key": "estilo",
      "type": "enum",
      "options": ["primary", "secondary", "text"],
      "sources": [
        {
          "system": "figma",
          "name": "Style",
          "values": { "Primary": "primary", "Secondary": "secondary", "Text": "text" }
        }
      ]
    },
    {
      "key": "texto",
      "type": "string",
      "sources": [{ "system": "figma", "name": "Label" }]
    }
  ]
}
```

| Propriedade | Onde                                  | Descrição                                                                                                                                                                    |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`   | tipo de anotação (opcional)           | Lista de `{ system, id?, name? }`, cada uma com pelo menos `id` ou `name`. Um tipo pode corresponder a vários elementos (ex: variantes antigas e novas do mesmo componente). |
| `sources`   | campo ou coluna de `table` (opcional) | Lista de `{ system, name, values? }`: a propriedade de origem do valor.                                                                                                      |
| `values`    | origem de um campo (opcional)         | Só em campos `enum`: valor de origem → uma das `options` (os destinos precisam existir em `options`).                                                                        |

- `system`, `id` e `name` são textos não vazios; comparações são exatas (maiúsculas contam).
- `sources` só existe a partir da `formatVersion` 3: nas versões 1 e 2 o arquivo é recusado com a mensagem de versão, em vez de ignorar as origens.
- Em código TypeScript, `findTypesBySource(specs, system, { id?, name? })` (em `src/model/`) devolve os tipos que correspondem a um elemento de origem: os que casam pelo `id` primeiro, depois os que casam só pelo `name`. Cada resultado traz `executable` (o `system` está em `origins` daquela especialização), e `isExecutableSystem(spec, system)` diz o mesmo para um sistema: quem monta uma resposta lê o `path` dos campos só onde ele existe. A busca nunca casa pelo `path`.

### Origem executável (`formatVersion` 4)

A v4 deixa uma origem ser **executável**: a especialização declara em `origins` como ler o JSON de um sistema externo (o de um backend de SDUI, por exemplo) e transformá-lo numa tela de componentes. O núcleo executa a **declaração**, que é dado, e nunca código vindo da especialização; `system` continua sendo só um nome. Um sistema é executável quando o seu `system` aparece em `origins`. Isso muda o que as `sources` pedem:

| Propriedade | Onde                                      | Descrição                                                                                                                                                                                        |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`      | `sources` de campo ou coluna              | O caminho do valor dentro das `props` do nó externo (`a.b[0].c`; sem `[*]`). **Obrigatório** em sistema declarado em `origins`; **proibido** nos demais.                                         |
| `name`      | `sources` de campo ou coluna              | Só o **nome** da propriedade de origem (exibição). Opcional em sistema executável; obrigatório nos demais, como na v3. Nunca é lido como caminho: um nome com `.` ou `[` não é mal interpretado. |
| `name`      | `sources` do tipo                         | Em sistema executável é o **nome do tipo externo** (a chave `node.type` do nó): é por ele que o nó vira o tipo. O `id` não participa da tradução.                                                |
| `slot`      | `sources` do tipo (só sistema executável) | Nome do nó `slot` do componente que recebe os filhos do nó externo (não vazio; o validador da biblioteca confere que o componente tem esse slot).                                                |
| `ignore`    | `sources` do tipo (só sistema executável) | Props que o nó externo traz e o desenho não usa (textos não vazios, sem repetição). Uma prop que não é caminho de campo nem está em `ignore` gera o aviso `propriedade desconhecida`.            |

```json
{
  "id": "m3-card",
  "name": "Card",
  "component": "components/m3-card.json",
  "sources": [
    {
      "system": "sdui",
      "name": "Card",
      "slot": "ações",
      "ignore": ["contentDescription"]
    }
  ],
  "fields": [
    {
      "key": "headline",
      "type": "string",
      "required": true,
      "sources": [{ "system": "sdui", "path": "headline" }]
    },
    {
      "key": "variant",
      "type": "enum",
      "options": ["elevated", "filled", "outlined"],
      "default": "elevated",
      "sources": [{ "system": "sdui", "path": "style", "name": "Estilo" }]
    }
  ]
}
```

A declaração é a chave `origins` da raiz: uma lista, uma entrada por sistema (`system` único). Ela é **estrita**: chave desconhecida é problema, com o caminho (`origins[0].screen.roots[1].path: …`).

| Propriedade | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system`    | Obrigatório. O nome do sistema (o mesmo `system` das `sources`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `name`      | Texto de exibição, opcional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `node`      | Obrigatório. `{ type, props, children }`: os nomes das chaves do nó externo que guardam o tipo, as props e os filhos. Os três são obrigatórios nesta versão.                                                                                                                                                                                                                                                                                                                                                                                  |
| `screen`    | Obrigatório. Onde ficam os valores da tela: `width` e `height` (obrigatórios; sem eles não há tela), `id`, `name`, `background` e `roots` (ao menos uma raiz). Cada valor é um **literal** ou `{ path, values?, default? }`.                                                                                                                                                                                                                                                                                                                  |
| `roots`     | Em `screen`. Lista de `{ path, anchor?, margin?, scrim? }`: `path` é o caminho da raiz no documento (`[*]` faz cada elemento virar uma raiz; raiz que não existe é ignorada, sem aviso); `anchor` é uma das nove âncoras da tela (`top-start`, `top`, `top-end`, `start`, `center`, `end`, `bottom-start`, `bottom`, `bottom-end`), literal ou caminho relativo ao nó da raiz; `margin` é a distância das bordas em px; `scrim` é o `id` de um tipo desenhado por baixo da raiz (a película de um modal). Sem `anchor` a raiz entra no fluxo. |
| `booleans`  | `{ "true": texto, "false": texto }`: como um booleano do JSON vira texto nos campos sem `values` próprio (ex: `sim`/`não`).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `examples`  | Lista de `{ name, file }`: telas de exemplo (o JSON de uma tela inteira) do sistema; `name` não vazio e único na origem, `file` caminho do pacote `.json`.                                                                                                                                                                                                                                                                                                                                                                                    |

```json
{
  "origins": [
    {
      "system": "sdui",
      "node": { "type": "type", "props": "props", "children": "children" },
      "screen": {
        "id": { "path": "screen.id" },
        "width": { "path": "screen.device.width" },
        "height": { "path": "screen.device.height" },
        "background": {
          "path": "screen.background",
          "values": { "surface": "#FEF7FF" },
          "default": "#FFFFFF"
        },
        "roots": [
          { "path": "content" },
          { "path": "bottomBar", "anchor": "bottom" },
          {
            "path": "floating[*]",
            "anchor": { "path": "anchor" },
            "margin": { "path": "margin" }
          },
          { "path": "modal", "anchor": "bottom", "scrim": "m3-scrim" }
        ]
      },
      "booleans": { "true": "sim", "false": "não" },
      "examples": [{ "name": "Configurações", "file": "examples/settings.sdui.json" }]
    }
  ]
}
```

Como o desenho é calculado (tamanhos `fill`/`hug`, âncoras da tela, avisos do motor) está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). **Limites conhecidos**: um slot por componente; props só dentro de `props` (não há origem com as props no próprio nó); listas do JSON externo que viram campos numerados (`items[0].label` vira `label1`) são frágeis, e campo de tabela no lugar delas é uma evolução; só a direção externo → tela (não há saída da tela para o sistema externo).

## Biblioteca: o pacote

Com a v4, uma especialização é uma **biblioteca**: um **pacote**, que é a **pasta da especialização**, com tudo o que ela cita. O arquivo da especialização fica na raiz da pasta.

```
material3/
  material3.spec.json          a especialização (formatVersion 4)
  components/m3-button.json    um arquivo por componente (mapping-component)
  docs/m3-button.md            o documento markdown do tipo
  examples/settings.sdui.json  uma tela de exemplo de um sistema externo
  fonts/Roboto-Regular.ttf     as fontes do desenho
  fonts/LEIA-ME.txt
```

Os nomes das pastas (`components/`, `docs/`, `examples/`, `fonts/`) são convenção; o que vale é o caminho citado. **Todo caminho citado** pela especialização é relativo ao arquivo dela, com `/`, **sem `..`**, sem `/` no começo e sem letra de unidade (a mesma regra do `path` do `code`), e termina na extensão esperada:

| Chave                       | Onde             | Extensão                             |
| --------------------------- | ---------------- | ------------------------------------ |
| `component`                 | tipo de anotação | `.json` (um componente)              |
| `doc`                       | tipo de anotação | `.md`                                |
| `examples[].file`           | tipo de anotação | `.json` (o nó de um sistema externo) |
| `origins[].examples[].file` | origem           | `.json` (uma tela inteira)           |
| `fonts[].file`              | raiz             | `.ttf`, `.otf`, `.woff` ou `.woff2`  |

O formato do arquivo de componente está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). As chaves novas da v4:

| Propriedade  | Onde             | Descrição                                                                                                                                                                                                                                                                          |
| ------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component`  | tipo de anotação | O arquivo do componente que desenha o tipo. Opcional: um tipo sem componente continua valendo, só não tem desenho.                                                                                                                                                                 |
| `doc`        | tipo de anotação | O documento markdown do tipo (quando usar, variantes, exemplos de uso).                                                                                                                                                                                                            |
| `examples`   | tipo de anotação | Lista de exemplos. `name` (não vazio e único no tipo) e `description` opcional, mais **um** de dois modos: `values` (valores dos campos do tipo) ou `system` com `file` (o JSON de **um nó** de um sistema externo declarado em `origins`: um componente, não uma tela).           |
| `values`     | exemplo          | Chave de um campo do próprio tipo (coluna não vale) → valor. `null` é sempre aceito; `string` pede texto, `date` pede `AAAA-MM-DD` válido, `number` pede número finito e `enum` pede uma das `options`. Campo `table` e campo `ref` **não** aceitam valor em exemplo nesta versão. |
| `fonts`      | raiz             | Lista de `{ family, file, weight?, style? }`. `family` não vazio; `weight` é um inteiro de 100 a 1000 ou uma faixa `"100 900"` (dois inteiros, o primeiro menor); `style` é `normal` (padrão) ou `italic`. O par `family` + `weight` + `style` não pode se repetir.                |
| `origins`    | raiz             | A declaração de origem executável (ver "Origens (sources)").                                                                                                                                                                                                                       |
| `migrations` | raiz             | O contrato de versão (ver "Contrato de versão").                                                                                                                                                                                                                                   |

```json
{
  "id": "m3-button",
  "name": "Button",
  "labelField": "label",
  "component": "components/m3-button.json",
  "doc": "docs/m3-button.md",
  "fields": [
    { "key": "label", "type": "string", "required": true },
    {
      "key": "variant",
      "type": "enum",
      "options": ["filled", "tonal", "outlined"],
      "default": "filled"
    }
  ],
  "examples": [
    { "name": "Preenchido", "values": { "label": "Salvar", "variant": "filled" } },
    {
      "name": "Contornado",
      "description": "Botão com borda.",
      "values": { "label": "Cancelar", "variant": "outlined" }
    }
  ]
}
```

**Fontes.** O arquivo de uma fonte declarada pode não estar no pacote (as fontes têm licença e peso; o pacote de exemplo não leva os `.ttf`). A fonte ausente **avisa** e o desenho cai na fonte do sistema; o pacote continua válido.

**Aplicar a um projeto.** Aplicar uma biblioteca **copia a pasta inteira** para `specs/<id>/` (a cópia de uma especialização v1 a v3 continua sendo o arquivo `specs/<id>.json`). Na app, **Especializações** aceita a pasta (`showDirectoryPicker`, Chrome/Edge) ou um zip do pacote (com ou sem uma pasta-raiz única), confere os três níveis e mostra erros (bloqueiam) e avisos (deixam aplicar); **Atualizar de pasta…/zip…** passa a versão aplicada como `previous` ao contrato de versão (quebra sem migração é erro) e regrava a pasta, e **Remover** a apaga. Um arquivo `.json` v4 isolado é **recusado** na app: a v4 pede o pacote. Ao abrir o projeto, o Diagnóstico mostra os problemas dos níveis 1 e 2 da cópia. As tools do servidor MCP e a skill que escreve o pacote são da B2 também.

**Pacote de exemplo.** `examples/libraries/material3/` é o Material Design 3 (baseline, tema claro) inteiro no formato: a especialização v4 com quinze tipos, cada um com `component`, `doc` e de um a três exemplos, os quinze componentes, a tela de configurações `examples/settings.sdui.json` (uma tela de SDUI sem retângulos, traduzida pela `origins`) e `fonts/LEIA-ME.txt`, que diz quais arquivos da Roboto baixar (os `.ttf` não são versionados). É **gerado** por `npm run build:examples` (`scripts/buildLibraryExamples.mjs`, a partir do Material 3 do laboratório) e um teste (`tests/model/libraryExamples.test.ts`) confere que o repositório está em dia com o gerador: não edite os arquivos à mão, regere.

## Contrato de versão

`version` (inteiro ≥ 1) é a **versão do pacote**. Subir a versão de uma biblioteca é uma decisão que pode quebrar os projetos que a aplicaram; o contrato diz o que é seguro e o que exige uma migração declarada. Duas versões do mesmo pacote são comparadas por `diffSpecs(anterior, nova)` (em `src/model/specVersions.ts`, função pura) e cada diferença é **aditiva** ou **quebra**. Tipo, campo e opção são identificados pelo `id`, pela `key` e pelo texto, nunca pela posição; as colunas de uma `table` contam como campos do tipo.

**Aditiva** (só acrescenta; atualizar não perde nada):

- um tipo novo, um campo **opcional** novo (coluna incluída), uma opção nova de `enum`;
- um `component`, um `doc`, um exemplo ou uma fonte novos, ou outro arquivo de componente para o tipo;
- trocar o **desenho** (o template do componente) sem mudar os campos.

**Quebra** (e só isto): remover ou renomear um **tipo**, um **campo** (ou coluna) ou uma **opção de `enum`**; tornar um campo **obrigatório**, inclusive um campo novo que já nasce obrigatório (os valores existentes ficam incompletos); mudar o `type` de um campo.

**Fora do contrato**, de propósito: camadas, `labelField`, `allowedChildren`, `requiresOwner`, `description`, `tags`, `code`, `platforms` e `sources`, e remover um `component`, um `doc`, um exemplo ou uma fonte. Nada disso gera diferença. Um renome é indistinguível de remover + acrescentar; quem renomeia **declara** isso num passo `rename-*`, e é isso que o diferencia de uma remoção.

### `migrations`

Toda quebra precisa de uma entrada em `migrations` na raiz da versão nova. Cada entrada liga duas versões do pacote e traz **passos declarativos**:

```json
{
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [
        { "op": "rename-field", "type": "button", "from": "texto", "to": "label" },
        {
          "op": "map-values",
          "type": "button",
          "field": "variant",
          "values": { "primary": "filled" }
        },
        { "op": "fill-field", "type": "button", "field": "size", "default": "md" },
        { "op": "rename-type", "from": "chip", "to": "tag" },
        { "op": "remove-field", "type": "tag", "field": "legacy" },
        { "op": "remove-type", "type": "badge", "mode": "convert" }
      ]
    }
  ]
}
```

`from` é um inteiro ≥ 1; `to` é maior que `from` e não passa de `version`; `steps` não é vazia; nenhum `from` se repete. Os seis passos e a quebra que cada um cobre:

| Passo (`op`)   | Chaves                     | Cobre a quebra                                                                                                                                                                                                 |
| -------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rename-type`  | `from`, `to`               | tipo removido (`from` é o tipo que saiu; `to` existe na versão nova).                                                                                                                                          |
| `remove-type`  | `type`, `mode`             | tipo removido. `mode` (`convert` ou `delete`) diz o destino das anotações do tipo.                                                                                                                             |
| `rename-field` | `type`, `from`, `to`       | campo removido (`from` é o que saiu; `to` existe no tipo).                                                                                                                                                     |
| `remove-field` | `type`, `field`            | campo removido (o tipo continua existindo).                                                                                                                                                                    |
| `map-values`   | `type`, `field`, `values`  | opção de `enum` removida: cada chave de `values` é uma opção antiga e o destino é uma `option` atual.                                                                                                          |
| `fill-field`   | `type`, `field`, `default` | campo que passou a obrigatório, campo novo obrigatório **ou** `type` trocado: o `default` (texto ou número, válido para o tipo do campo) entra no lugar; no `type` trocado os valores antigos são descartados. |

- A chave de campo de um passo (`field`, `from`, `to`) é a `key` do campo **ou** `tabela.coluna`: a coluna de uma `table` também guarda dados, então mudar uma coluna (remover, trocar o `type`, torná-la obrigatória) é quebra e é coberta pelo mesmo passo.
- O arquivo é conferido sozinho (nível 1 do validador): o **lado novo** do passo existe na versão (`rename-type.to` é um tipo daqui; o campo `to`/`field` existe no tipo; os destinos de `map-values` estão nas `options` de um campo `enum`; o `default` de `fill-field` é válido para o campo) e o **lado antigo** não existe mais (`rename-type.from`, `remove-type.type` não são tipos desta versão; `rename-field.from` e `remove-field.field` não são campos do tipo). Que o lado antigo existia na versão anterior é conferido quando se compara duas versões.
- A **cadeia** liga as entradas por `from → to`, a partir da versão que o projeto aplicou até a `version` nova (`migrationChain`). Uma cadeia rompida (falta a entrada de uma versão) deixa **toda** quebra sem cobertura. `missingMigrations(anterior, nova)` devolve as quebras que nenhum passo da cadeia cobre; lista vazia é contrato cumprido, e `migrationFor` diz que passo cobre uma quebra.
- O validador da biblioteca (nível 2) usa o contrato quando recebe a versão anterior: cada quebra sem passo vira um **erro**, e uma `version` que não cresceu também.

**Hoje** o contrato **classifica, valida e informa**: `specializationUpdateImpact` (em `src/model/specializations.ts`) devolve, além do que já devolvia, `changes` (as diferenças), `breaking` (as quebras), `missingMigrations` (as quebras sem passo: a atualização vai perder dados), `migrations` (os passos da cadeia, na ordem) e `comparable` (`false` quando a cópia aplicada não está disponível, e então nada é comparado). A **execução** dos passos sobre um projeto é a fase B4 da etapa Biblioteca; até lá, nenhuma migração é aplicada.

## Validação da biblioteca

`validateLibrary` (em `src/model/library.ts`) valida um pacote **já lido**: recebe a lista de arquivos (`{ path, text? }` para `.json` e `.md`, `{ path, binary: true }` para uma fonte presente), o caminho da especialização (sem ele, procura o único arquivo com `"format": "mapping-spec"`), opcionalmente a versão anterior (`previous`, que liga o contrato de versão) e até que nível ir (`level`, padrão 3). É puro: não lê disco nem rede.

**Erro impede usar, aviso deixa usar.** Cada problema é `{ file, path, message, severity }` (`severity` é `error` ou `warning`; `file` é o arquivo do problema e `path` o caminho dentro dele, ambos podem ser vazios):

```json
{
  "file": "material3.spec.json",
  "path": "layers[0].annotationTypes[2].component",
  "message": "arquivo não encontrado: components/m3-fab.json",
  "severity": "error"
}
```

O relatório traz `ok` (sem nenhum erro), `issues` (todos, na ordem dos níveis), `errors`, `warnings`, a `spec` lida e um `summary` (nível alcançado e contagens de tipos, componentes, documentos, exemplos e fontes). Os níveis rodam em ordem e cada um só roda se o anterior deixou o que ele precisa: sem especialização legível não há nível 2; um componente inválido não impede os outros de passar pelos níveis 2 e 3.

1. **Cada arquivo isolado, estrito.** A especialização (`parseSpec`; os avisos de `specWarnings`), cada componente citado (`parseComponent`, com o caminho dentro do arquivo), cada documento (`.md` vazio avisa). Um arquivo citado que não está no pacote é **erro** (`arquivo não encontrado`); um `.json` ou `.md` do pacote que ninguém cita é **aviso** (`arquivo não referenciado pela especialização`).
2. **Coerência entre arquivos.** O `slot` declarado nas `sources` do tipo existe no componente (erro); todo campo que o desenho usa existe no tipo (**erro**: o desenho não acha o valor); campo do `preview` que o tipo não tem, campo do tipo que o desenho não usa e dois tipos com o mesmo arquivo de componente são **avisos**; os arquivos dos exemplos de sistema externo existem e são JSON (erro quando não); o `scrim` das raízes é um tipo da especialização (erro); o arquivo de cada fonte existe (**aviso** quando falta: o desenho usa a fonte do sistema); e, com `previous`, o contrato de versão (erro para a quebra sem passo e para a `version` que não cresceu; aviso para um passo que cita o que não existia na versão anterior).
3. **Prova de desenho.** Cada componente é instanciado com os valores do `preview` (ou os padrões dos campos) e de **cada exemplo de valores**, no `size` **e** no `minSize`: cada aviso do motor vira um aviso do pacote com `(aproximado)` no fim, porque aqui o texto é medido de forma **aproximada** (a medida real é a do navegador). Uma falha ao desenhar é erro. Cada exemplo de sistema externo (o do tipo, `system` + `file`, e cada tela de `origins[].examples`) passa pela declaração de origem: erro do resultado é erro, e propriedade desconhecida e os outros avisos da origem são avisos. A lista de avisos está no [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Avisos do motor".

As três portas — **o aplicativo, o servidor MCP e a skill `spec-author`** — chamam a **mesma função** e mostram o mesmo relatório. Isso é da fase B2 da etapa Biblioteca; hoje a função existe e é coberta por testes, mas nenhuma porta a chama ainda.

O pacote Material 3 do repositório (`examples/libraries/material3/`) passa pelo validador com **zero erros** e **42 avisos**: duas fontes ausentes (o `.ttf` da Roboto não é versionado) e 40 de "conteúdo maior que a caixa" na prova de desenho, quase todos no tamanho mínimo, onde o conteúdo real não cabe mesmo (no tamanho inicial só o chip "Selecionado" avisa). O teste `tests/model/libraryExamples.test.ts` fixa esse resultado.

## Regras de validação

As mensagens de erro trazem o caminho, ex: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "string", "number", "date", "enum", "table" ou "ref"`.

- `format`, `formatVersion` (1 a 4), `id`, `name` e `version` obrigatórios; `version` inteiro ≥ 1;
- ids de camada únicos; ids de tipo únicos na especialização inteira; `key` única no tipo e nas colunas; nenhuma `key` começando com `_`;
- `allowedChildren` só referencia tipos existentes **em outra camada**;
- todo tipo com `requiresOwner: true` aparece no `allowedChildren` de algum tipo;
- `default` compatível com o tipo (e presente em `options` no `enum`); `ref` sem `default`;
- `columns` só com tipos simples; `rowLabel` obrigatório em `table` com `tags` e apontando para uma coluna `string`;
- `labelField` aponta para um campo `string` do tipo;
- `accepts` com pelo menos uma etiqueta ou `free: true`; etiquetas no formato `[a-z0-9-]+`;
- `platforms`: `id` no formato `[a-z0-9-]+` e único, `name` obrigatório, `language` opcional; `platforms` e `code` a partir da `formatVersion` 2;
- `sources` a partir da `formatVersion` 3; origem de tipo com `system` e pelo menos `id` ou `name`; origem de campo com `system` e `name` (ou `path`, na v4, em sistema de `origins`); `values` só em campos `enum` e com destinos que existam em `options`;
- **v4, chaves novas:** `fonts`, `origins`, `migrations` (raiz), `component`, `doc` e `examples` (tipo) só na `formatVersion` 4: numa versão anterior o erro é `só é permitido com formatVersion 4`, no caminho da chave;
- **v4, caminhos do pacote:** `component` e `examples[].file` com extensão `.json`, `doc` com `.md`, `fonts[].file` com `.ttf`, `.otf`, `.woff` ou `.woff2`, e `origins[].examples[].file` com `.json`; todos relativos, normalizados, com `/`, sem `.`, `..`, `/` no começo nem unidade;
- **v4, `fonts`:** `family` não vazio; `weight` inteiro de 100 a 1000 ou faixa `"100 900"` (o primeiro número menor); `style` `normal` ou `italic`; o par `family` + `weight` + `style` não se repete;
- **v4, `examples`:** `name` não vazio e único no tipo; ou `values` ou `system` com `file`, nunca os dois modos nem nenhum; as chaves de `values` são campos do tipo, com valor `null` ou compatível com o tipo (`table` e `ref` não aceitam); `system` precisa estar em `origins`;
- **v4, `sources`:** `path` só em sistema declarado em `origins` (e obrigatório nele), com sintaxe válida (`a.b[0].c`) e sem `[*]`; fora de `origins`, `name` é obrigatório e `path` é proibido; `slot` e `ignore` só em sistema declarado em `origins`, e `ignore` sem repetição;
- **v4, `origins`:** conferido por `parseOrigins`, estrito: `system` único, `node` com `type`, `props` e `children`, `screen` com `width`, `height` e ao menos uma raiz, caminhos e âncoras válidos, `booleans` com `true` e `false`, `examples` com `name` único e `file` `.json`;
- **v4, `migrations`:** `from` inteiro ≥ 1 e único, `to` maior que `from` e no máximo `version`, `steps` não vazia, `op` conhecido e chaves estritas por passo; o lado novo de cada passo existe nesta versão e o lado antigo não existe mais (ver "Contrato de versão");
- `code` só em especializações que declaram `platforms`; os ids de `code` precisam existir em `platforms`;
- `symbol` obrigatório em cada entrada de `code`; `path`, se houver, não vazio e relativo à raiz do repositório (normalizado, com `/`, sem `.`, `..`, `/` no começo nem unidade); chaves de `params` e `values` precisam ser campos do tipo; `values` só para campos `enum`, com chaves que existam em `options`;
- `color` no formato `#RRGGBB`;
- propriedades desconhecidas são rejeitadas (o `platforms` de um campo só existia no tipo removido `codeRef`);
- um campo do tipo removido `codeRef` (fora de `columns`) não é erro: é lido, ignorado e vira aviso (ver "Tipos de valor").

**Validar antes de importar.** A importação da app e o servidor MCP usam a mesma validação (`parseSpecText`, em `src/model/`). A tool `validate_specialization` do servidor (um `path` dentro das raízes ou o `text` JSON) devolve exatamente esses erros, com o caminho, sem aplicar a nenhum projeto, e ainda avisa o que não impede a importação mas costuma ser descuido: plataforma declarada e não usada, tipo sem `code` numa especialização com plataformas, o `format` antigo (`mapeador-spec`) e o campo do tipo removido `codeRef`, ignorado (`ignored-field`). A importação da app mostra o aviso dos campos ignorados.

## Exemplo comentado: SDUI

```json
{
  "format": "mapping-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": ["onClick"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            {
              "key": "estilo",
              "type": "enum",
              "options": ["primary", "secondary"],
              "default": "primary"
            }
          ]
        },
        {
          "id": "input",
          "name": "Input",
          "fields": [
            { "key": "id", "type": "string", "required": true },
            {
              "key": "dado",
              "type": "ref",
              "accepts": { "tags": ["data-field"], "free": true }
            }
          ]
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#FB8C00",
      "annotationTypes": [
        {
          "id": "onClick",
          "name": "onClick",
          "requiresOwner": true,
          "fields": [
            {
              "key": "acao",
              "type": "enum",
              "options": ["navigate", "submit"],
              "required": true
            }
          ]
        }
      ]
    }
  ]
}
```

- Duas camadas: Componentes e Eventos, cada uma com seus tipos.
- `Button`: `id` é obrigatório (sem ele a anotação fica incompleta) e `estilo` já vem como `primary` (`default`).
- `Button` lista `onClick` em `allowedChildren`, e `onClick` tem `requiresOwner`: um `onClick` só existe ligado a um `Button`.
- `Input.dado` é um `ref`: aceita atributos com a etiqueta `data-field` (ex: as linhas de atributos da Classe, do Modelo de dados) e também tuplas de anotações livres.

## Exemplos completos

- [`examples/specs/sdui.json`](../examples/specs/sdui.json) (`formatVersion` 2): `string`, `number`, `enum`, `table` e `ref`; `required`, `default`, `label`, `description`; `allowedChildren` e `requiresOwner`; referência por etiqueta (`dado`) que também aceita tuplas livres; plataformas `android`, `ios` e `bff`, `code` em todos os tipos de componentes e eventos e a camada Telas com o `Screen` (sem `code`).
- [`examples/specs/modelo-de-dados.json`](../examples/specs/modelo-de-dados.json) (`formatVersion` 1, sem plataformas): `date`, `labelField`, `table` com etiqueta `data-field` e `rowLabel` (cada atributo vira um alvo de referência).
