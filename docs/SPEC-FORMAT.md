# Formato da especialização (`formatVersion` 1)

O formato do arquivo que define camadas e tipos de anotação. A página "Ajuda → Especializações" da app é uma versão resumida deste documento (um teste garante que os títulos das seções e os blocos de código coincidem).

## O que é uma especialização

Uma **especialização** é um arquivo JSON que define **camadas obrigatórias** e os **tipos de anotação** que podem ser criados nelas. Ex: a especialização **SDUI** traz a camada Componentes (Button, Input…) e a camada Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e só falta preencher os valores.

- Um projeto pode aplicar **várias** especializações, a qualquer momento.
- Uma especialização **não cita outra pelo nome**. A ligação entre elas é feita por **referências fortes** (tipo `ref`) que escolhem os alvos por **etiquetas**.
- Camadas da especialização só aceitam anotações **tipadas**, sem chaves extras. Camadas criadas pelo usuário continuam livres.
- A especialização aplicada é **copiada** para `specs/<id>.json` dentro do projeto, que fica autocontido.

Arquivos de apoio:

- `docs/spec.schema.json`: JSON Schema (draft 2020-12). Valida só a **estrutura**; as regras entre elementos (ids únicos, `allowedChildren`, `requiresOwner`, `labelField`, `rowLabel`, `default` compatível) só são verificadas pelo validador da app (`src/model/spec.ts`, que é a fonte da verdade).
- `examples/specs/sdui.json` e `examples/specs/modelo-de-dados.json`: exemplos completos.

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

Na raiz: `format` (sempre `"mapping-spec"`), `formatVersion` (`1`), `id`, `name` e `version` (inteiro ≥ 1) são obrigatórios; `description` é opcional. Cada camada tem `id` (único), `name`, `color` (`#RRGGBB`) e `annotationTypes`. A importação ainda aceita arquivos antigos com `"mapeador-spec"`.

### Tipo de anotação

| Propriedade       | Obrigatória | Descrição                                                                                                 |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `id`              | sim         | Único **na especialização inteira**.                                                                      |
| `name`            | sim         | Nome exibido (ex: "Button").                                                                              |
| `description`     | não         | Texto de ajuda.                                                                                           |
| `labelField`      | não         | Chave de um campo `string` cujo valor é o **rótulo da instância** quando o `name` da anotação está vazio. |
| `requiresOwner`   | não         | Padrão `false`. A anotação precisa ter exatamente um dono (ver "Relações").                               |
| `allowedChildren` | não         | Ids dos tipos que podem ser **vinculados** a este.                                                        |
| `fields`          | sim         | Lista de campos (pode ser vazia).                                                                         |

### Campo

| Propriedade   | Obrigatória        | Descrição                                                                                                     |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `key`         | sim                | Chave gravada no JSON. `[A-Za-z0-9_]`, **não pode começar com `_`** (reservado). Única dentro do tipo.        |
| `label`       | não                | Rótulo exibido (pode ter acentos). Padrão: `key`.                                                             |
| `type`        | sim                | `string`, `number`, `date`, `enum`, `table` ou `ref`.                                                         |
| `required`    | não                | Padrão `false`. Vazio é permitido ao salvar, mas a anotação fica **incompleta**.                              |
| `default`     | não                | Valor inicial. Precisa ser válido para o tipo. Não existe para `table` nem `ref`.                             |
| `options`     | só `enum`          | Lista não vazia de strings únicas.                                                                            |
| `columns`     | só `table`         | Campos com a mesma estrutura, **apenas** `string`, `number`, `date` ou `enum`.                                |
| `tags`        | não                | Etiquetas que tornam o campo **alvo de referências** (`[a-z0-9-]+`). Em `table`, cada **linha** vira um alvo. |
| `rowLabel`    | `table` com `tags` | Chave de uma coluna `string` que nomeia cada linha como alvo.                                                 |
| `accepts`     | só `ref`           | `{ "tags": [...], "free": true\|false }`. Precisa de pelo menos uma etiqueta ou `free: true`.                 |
| `description` | não                | Texto de ajuda exibido no editor.                                                                             |

## Tipos de valor

- `string`: texto.
- `number`: número, inteiro ou decimal.
- `date`: data ISO `AAAA-MM-DD`.
- `enum`: uma das `options`. Booleanos são `enum` (ex: `["sim", "não"]`).
- `table`: lista de linhas; cada linha é um objeto com as chaves das `columns` (mais o id interno `_id`).
- `ref`: **referência forte** a uma tupla de outra anotação. O valor do campo é a referência.

## Relações entre anotações

Sempre dentro da mesma especialização.

- `allowedChildren`: tipos que podem ser vinculados (via `parentAnnotationId`) a este. Um dono pode ter N filhos, inclusive do mesmo tipo. Os filhos devem estar em **outra camada**.
- `requiresOwner: true`: a anotação precisa de exatamente um dono, de um tipo que a liste em `allowedChildren`.

## Referências e etiquetas

Um campo `ref` aponta para um **alvo**. São alvos válidos:

- tuplas de anotações **livres**, se `accepts.free` for `true`;
- campos de anotações tipadas (qualquer especialização aplicada) cujo `tags` contenha alguma etiqueta de `accepts.tags`; numa `table` com `tags`, cada linha é um alvo, nomeada pela coluna `rowLabel`.

Etiqueta recomendada (reutilize em novas especializações): **`data-field`** — atributo de um modelo de dados (classe, entidade, DTO).

## Regras de validação

As mensagens de erro trazem o caminho, ex: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "string", "number", "date", "enum", "table" ou "ref"`.

- `format`, `formatVersion`, `id`, `name` e `version` obrigatórios; `version` inteiro ≥ 1;
- ids de camada únicos; ids de tipo únicos na especialização inteira; `key` única no tipo e nas colunas; nenhuma `key` começando com `_`;
- `allowedChildren` só referencia tipos existentes **em outra camada**;
- todo tipo com `requiresOwner: true` aparece no `allowedChildren` de algum tipo;
- `default` compatível com o tipo (e presente em `options` no `enum`); `ref` sem `default`;
- `columns` só com tipos simples; `rowLabel` obrigatório em `table` com `tags` e apontando para uma coluna `string`;
- `labelField` aponta para um campo `string` do tipo;
- `accepts` com pelo menos uma etiqueta ou `free: true`; etiquetas no formato `[a-z0-9-]+`;
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

- [`examples/specs/sdui.json`](../examples/specs/sdui.json): `string`, `number`, `enum`, `table` e `ref`; `required`, `default`, `label`, `description`; `allowedChildren` e `requiresOwner`; referência por etiqueta (`dado`) que também aceita tuplas livres.
- [`examples/specs/modelo-de-dados.json`](../examples/specs/modelo-de-dados.json): `date`, `labelField`, `table` com etiqueta `data-field` e `rowLabel` (cada atributo vira um alvo de referência).
