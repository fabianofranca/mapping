# Formato da especialização (`formatVersion` 1, 2 e 3)

O formato do arquivo que define camadas e tipos de anotação (e, na `formatVersion` 2, as plataformas de código; na 3, as origens externas). A página "Ajuda → Especializações" da app é uma versão resumida deste documento (um teste garante que os títulos das seções e os blocos de código coincidem).

## O que é uma especialização

Uma **especialização** é um arquivo JSON que define **camadas obrigatórias** e os **tipos de anotação** que podem ser criados nelas. Ex: a especialização **SDUI** traz a camada Componentes (Button, Input…) e a camada Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e só falta preencher os valores.

- Um projeto pode aplicar **várias** especializações, a qualquer momento.
- Uma especialização **não cita outra pelo nome**. A ligação entre elas é feita por **referências fortes** (tipo `ref`) que escolhem os alvos por **etiquetas**.
- Camadas da especialização só aceitam anotações **tipadas**, sem chaves extras. Camadas criadas pelo usuário continuam livres.
- A especialização aplicada é **copiada** para `specs/<id>.json` dentro do projeto, que fica autocontido. A cópia mantém a `formatVersion` com que foi aplicada.
- A `formatVersion` 2 liga a especialização ao código (plataformas, `code` e `codeRef`). A importação aceita as versões 1, 2 e 3; uma especialização v1 é uma v2 sem plataformas e sem `code` (ver "Plataformas, code e codeRef").
- A `formatVersion` 3 é a 2 mais `sources`: a que elementos de um sistema externo cada tipo corresponde e de que propriedade de origem vem cada campo (ver "Origens (sources)").

Arquivos de apoio:

- `docs/spec.schema.json`: JSON Schema (draft 2020-12). Valida só a **estrutura**; as regras entre elementos (ids únicos, `allowedChildren`, `requiresOwner`, `labelField`, `rowLabel`, `default` compatível, plataformas declaradas, chaves de `params` e `values`, `sources` só na versão 3, `values` das origens só em `enum` e com destinos nas `options`) só são verificadas pelo validador da app (`src/model/spec.ts`, que é a fonte da verdade).
- `examples/specs/sdui.json` (`formatVersion` 2) e `examples/specs/modelo-de-dados.json` (`formatVersion` 1): exemplos completos.

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

Na raiz: `format` (sempre `"mapping-spec"`), `formatVersion` (`1`, `2` ou `3`), `id`, `name` e `version` (inteiro ≥ 1) são obrigatórios; `description` e `platforms` (a partir da versão 2) são opcionais. Cada camada tem `id` (único), `name`, `color` (`#RRGGBB`) e `annotationTypes`. A importação ainda aceita arquivos antigos com `"mapeador-spec"`.

### Tipo de anotação

| Propriedade       | Obrigatória | Descrição                                                                                                             |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`              | sim         | Único **na especialização inteira**.                                                                                  |
| `name`            | sim         | Nome exibido (ex: "Button").                                                                                          |
| `description`     | não         | Texto de ajuda.                                                                                                       |
| `labelField`      | não         | Chave de um campo `string` cujo valor é o **rótulo da instância** quando o `name` da anotação está vazio.             |
| `requiresOwner`   | não         | Padrão `false`. A anotação precisa ter exatamente um dono (ver "Relações").                                           |
| `allowedChildren` | não         | Ids dos tipos que podem ser **vinculados** a este.                                                                    |
| `fields`          | sim         | Lista de campos (pode ser vazia).                                                                                     |
| `code`            | não         | A partir da `formatVersion` 2. Como o tipo vira código, por plataforma declarada (ver "Plataformas, code e codeRef"). |
| `sources`         | não         | Só `formatVersion` 3. Elementos de origem a que o tipo corresponde (ver "Origens (sources)").                         |

### Campo

| Propriedade   | Obrigatória        | Descrição                                                                                                     |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `key`         | sim                | Chave gravada no JSON. `[A-Za-z0-9_]`, **não pode começar com `_`** (reservado). Única dentro do tipo.        |
| `label`       | não                | Rótulo exibido (pode ter acentos). Padrão: `key`.                                                             |
| `type`        | sim                | `string`, `number`, `date`, `enum`, `table`, `ref` ou `codeRef`.                                              |
| `required`    | não                | Padrão `false`. Vazio é permitido ao salvar, mas a anotação fica **incompleta**.                              |
| `default`     | não                | Valor inicial. Precisa ser válido para o tipo. Não existe para `table`, `ref` nem `codeRef`.                  |
| `options`     | só `enum`          | Lista não vazia de strings únicas.                                                                            |
| `columns`     | só `table`         | Campos com a mesma estrutura, **apenas** `string`, `number`, `date` ou `enum`.                                |
| `tags`        | não                | Etiquetas que tornam o campo **alvo de referências** (`[a-z0-9-]+`). Em `table`, cada **linha** vira um alvo. |
| `rowLabel`    | `table` com `tags` | Chave de uma coluna `string` que nomeia cada linha como alvo.                                                 |
| `accepts`     | só `ref`           | `{ "tags": [...], "free": true\|false }`. Precisa de pelo menos uma etiqueta ou `free: true`.                 |
| `platforms`   | só `codeRef`       | Subconjunto dos ids declarados em `platforms` (padrão: todas). Não pode ser vazio nem repetir ids.            |
| `description` | não                | Texto de ajuda exibido no editor.                                                                             |
| `sources`     | não                | Só `formatVersion` 3. Propriedades de origem do campo, inclusive em colunas (ver "Origens (sources)").        |

## Tipos de valor

- `string`: texto.
- `number`: número, inteiro ou decimal.
- `date`: data ISO `AAAA-MM-DD`.
- `enum`: uma das `options`. Booleanos são `enum` (ex: `["sim", "não"]`).
- `table`: lista de linhas; cada linha é um objeto com as chaves das `columns` (mais o id interno `_id`).
- `ref`: **referência forte** a uma tupla de outra anotação. O valor do campo é a referência.
- `codeRef`: **onde a instância foi implementada**, por plataforma (caminho do arquivo, símbolo e linha). Só existe na `formatVersion` 2; o valor (uma lista de entradas) é descrito em [`FORMAT.md`](FORMAT.md), "Campos da v7".

## Relações entre anotações

Sempre dentro da mesma especialização.

- `allowedChildren`: tipos que podem ser vinculados (via `parentAnnotationId`) a este. Um dono pode ter N filhos, inclusive do mesmo tipo. Os filhos devem estar em **outra camada**.
- `requiresOwner: true`: a anotação precisa de exatamente um dono, de um tipo que a liste em `allowedChildren`.

## Referências e etiquetas

Um campo `ref` aponta para um **alvo**. São alvos válidos:

- tuplas de anotações **livres**, se `accepts.free` for `true`;
- campos de anotações tipadas (qualquer especialização aplicada) cujo `tags` contenha alguma etiqueta de `accepts.tags`; numa `table` com `tags`, cada linha é um alvo, nomeada pela coluna `rowLabel`.

Etiqueta recomendada (reutilize em novas especializações): **`data-field`** — atributo de um modelo de dados (classe, entidade, DTO).

## Plataformas, code e codeRef

A `formatVersion` 2 liga a especialização ao código: ela declara as **plataformas** (um app, um contrato de API…) e como cada tipo de anotação vira código em cada uma. A `formatVersion` 1 continua válida: é a 2 sem plataformas e sem `code`. O núcleo da app é genérico; plataformas, linguagens e componentes de código entram só por estas propriedades.

| Propriedade | Onde                            | Descrição                                                                                                                                                             |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platforms` | raiz (opcional)                 | Lista de `{ id, name, language }`. `id` no formato `[a-z0-9-]+` e único na especialização; `name` é exibido; `language` é informativo (ajuda o agente).               |
| `code`      | tipo de anotação (opcional)     | Objeto por **id de plataforma declarada**; cada entrada tem as propriedades abaixo.                                                                                   |
| `symbol`    | entrada de `code` (obrigatória) | Componente ou tipo que implementa o tipo de anotação naquela plataforma.                                                                                              |
| `params`    | entrada de `code` (opcional)    | Chave de um campo do tipo → nome do parâmetro no código. Campos fora de `params` não são passados.                                                                    |
| `values`    | entrada de `code` (opcional)    | Chave de um campo `enum` → (valor no mapping → valor no código). Valor sem tradução é passado como está.                                                              |
| `notes`     | entrada de `code` (opcional)    | Orientação livre para o agente.                                                                                                                                       |
| `codeRef`   | tipo de campo                   | Onde a instância foi implementada. O `platforms` do campo é opcional e restringe as plataformas permitidas. Não é permitido em colunas de `table` nem como `default`. |

`code` e `codeRef` só valem em especializações que declaram `platforms`. Os ids citados em `code` e no `platforms` do campo precisam existir em `platforms`, e as chaves de `params` e `values` precisam ser campos do tipo.

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
    },
    {
      "id": "telas",
      "name": "Telas",
      "color": "#00897B",
      "annotationTypes": [
        {
          "id": "screen",
          "name": "Screen",
          "labelField": "nome",
          "fields": [
            { "key": "nome", "type": "string", "required": true },
            { "key": "implementacao", "type": "codeRef" }
          ]
        }
      ]
    }
  ]
}
```

- Plataformas com o **mesmo id** em especializações diferentes são a mesma plataforma (a configuração do repositório fica no projeto, não na especialização).
- O valor de um `codeRef` e o repositório de cada plataforma (`platformRepos`, no projeto) estão em [`FORMAT.md`](FORMAT.md), "Campos da v7". O editor do `codeRef` na app e o uso de `code` pelo servidor MCP chegam nas fases seguintes da etapa 3b.

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
- `sources` só existe na `formatVersion` 3: uma versão anterior da app recusa o arquivo com a mensagem de versão, em vez de ignorar as origens.
- Em código TypeScript, `findTypesBySource(specs, system, { id?, name? })` (em `src/model/`) devolve os tipos que correspondem a um elemento de origem: os que casam pelo `id` primeiro, depois os que casam só pelo `name`.

## Regras de validação

As mensagens de erro trazem o caminho, ex: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "string", "number", "date", "enum", "table", "ref" ou "codeRef"`.

- `format`, `formatVersion` (1, 2 ou 3), `id`, `name` e `version` obrigatórios; `version` inteiro ≥ 1;
- ids de camada únicos; ids de tipo únicos na especialização inteira; `key` única no tipo e nas colunas; nenhuma `key` começando com `_`;
- `allowedChildren` só referencia tipos existentes **em outra camada**;
- todo tipo com `requiresOwner: true` aparece no `allowedChildren` de algum tipo;
- `default` compatível com o tipo (e presente em `options` no `enum`); `ref` e `codeRef` sem `default`;
- `columns` só com tipos simples (`codeRef` não pode ser coluna); `rowLabel` obrigatório em `table` com `tags` e apontando para uma coluna `string`;
- `labelField` aponta para um campo `string` do tipo;
- `accepts` com pelo menos uma etiqueta ou `free: true`; etiquetas no formato `[a-z0-9-]+`;
- `platforms`: `id` no formato `[a-z0-9-]+` e único, `name` obrigatório, `language` opcional; `platforms`, `code` e `codeRef` a partir da `formatVersion` 2;
- `sources` só na `formatVersion` 3; origem de tipo com `system` e pelo menos `id` ou `name`; origem de campo com `system` e `name`; `values` só em campos `enum` e com destinos que existam em `options`;
- `code` e `codeRef` só em especializações que declaram `platforms`; os ids de `code` e do `platforms` do campo precisam existir em `platforms`;
- `symbol` obrigatório em cada entrada de `code`; chaves de `params` e `values` precisam ser campos do tipo; `values` só para campos `enum`, com chaves que existam em `options`;
- `color` no formato `#RRGGBB`;
- propriedades desconhecidas são rejeitadas.

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

- [`examples/specs/sdui.json`](../examples/specs/sdui.json) (`formatVersion` 2): `string`, `number`, `enum`, `table` e `ref`; `required`, `default`, `label`, `description`; `allowedChildren` e `requiresOwner`; referência por etiqueta (`dado`) que também aceita tuplas livres; plataformas `android`, `ios` e `bff`, `code` em todos os tipos de componentes e eventos e a camada Telas com o `Screen` e o campo `codeRef`.
- [`examples/specs/modelo-de-dados.json`](../examples/specs/modelo-de-dados.json) (`formatVersion` 1, sem plataformas): `date`, `labelField`, `table` com etiqueta `data-field` e `rowLabel` (cada atributo vira um alvo de referência).
