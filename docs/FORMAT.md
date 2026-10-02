# Formato do `mapping.json` (schema v4)

O projeto é uma pasta (ou um zip com o mesmo conteúdo) com `mapping.json`, `images/` e,
se houver especializações aplicadas, `specs/`. Todas as coordenadas das marcações são
**pixels inteiros da imagem original** (`images[].file`, com a orientação EXIF já aplicada).

```
meu-projeto/
├── mapping.json
├── images/
└── specs/            # cópias das especializações aplicadas (ver SPEC-FORMAT.md)
    ├── sdui.json
    └── modelo-dados.json
```

```json
{
  "schemaVersion": 4,
  "app": "mapeador-imagens",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": { "name": "Carro", "createdAt": "…", "updatedAt": "…" },
  "specializations": [],
  "layers": [{ "id": "L1", "name": "Componentes", "color": "#E53935", "spec": null }],
  "images": [
    {
      "id": "I1",
      "name": "Tela Home",
      "file": "images/home.webp",
      "width": 1182,
      "height": 2560,
      "placement": { "x": 0, "y": 0, "scale": 0.4 },
      "markingColor": null
    }
  ],
  "markings": [
    {
      "id": "M1",
      "imageId": "I1",
      "parentId": null,
      "name": "Botão",
      "rect": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "needsReview": false
    }
  ],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Button",
      "inherit": false,
      "parentAnnotationId": null,
      "type": null,
      "values": null,
      "entries": [{ "id": "E1", "key": "estilo", "value": "primário" }]
    }
  ]
}
```

## Campos da v2 e v3

- `images[].name`: rótulo opcional (`null` = use o nome do arquivo). Mudá-lo não renomeia o arquivo.
- `images[].markingColor` (v3): cor `#RRGGBB` da borda das marcações da imagem, ou `null` (cor neutra do tema). Só afeta a interface, não o recorte.
- `annotations[].inherit`: se `true`, a anotação também vale para **todos os descendentes** da marcação.
- `annotations[].parentAnnotationId`: anotação "dona" (ou `null`).
  - a dona está na **mesma marcação** e em **outra camada**;
  - não há ciclos (a cadeia pode atravessar várias camadas).
- `placement` e `needsReview` só importam para a interface; `placement` não afeta o recorte.

A herança **não é materializada** no JSON: é sempre calculada a partir de `parentId` e `inherit`.
Herança e vínculo são independentes: se a dona tem `inherit: true`, suas vinculadas só descem
para as marcações filhas se também tiverem `inherit: true`.

## Campos da v4 (especializações)

Uma **especialização** é um arquivo JSON que define camadas e tipos de anotação (formato em
[`SPEC-FORMAT.md`](SPEC-FORMAT.md)). Ao ser aplicada, ela é **copiada** para `specs/<id>.json`:
o projeto fica autocontido e quem lê entende o significado das camadas e chaves.

- `specializations[]`: `{ "id", "version", "file" }` de cada especialização aplicada. `file` é o
  caminho da cópia (`specs/sdui.json`).
- `layers[].spec`: `null` (camada livre) ou `{ "specId", "layerId" }`, a camada de origem na
  especialização. Camadas da especialização só têm anotações **tipadas** dela.
- `annotations[].type`: `null` (anotação **livre**) ou `{ "specId", "typeId" }` (anotação **tipada**).
- `annotations[].values`: `null` na livre; na tipada, um objeto com os valores por `key` do campo,
  em **JSON nativo**:
  - `string` e `enum`: texto; `number`: número; `date`: texto ISO `AAAA-MM-DD`;
  - `table`: array de linhas; cada linha tem as chaves das colunas e um id interno `_id`;
  - `ref`: objeto de referência (abaixo);
  - campo vazio: `null` (ou ausente); `table` vazia: `[]`.
- `annotations[].entries`: pares da anotação livre; sempre `[]` na tipada. Cada par tem um `id`.
- O rótulo de uma anotação tipada é o `name`; se vazio, o valor do campo `labelField` do tipo;
  se vazio, o nome do tipo. Ex.: uma Classe com `nome: "Contato"` aparece como `Contato`.

Anotação tipada (Classe da especialização `modelo-dados`):

```json
{
  "id": "A2",
  "markingId": "M-form",
  "layerId": "L3",
  "name": null,
  "inherit": false,
  "parentAnnotationId": null,
  "type": { "specId": "modelo-dados", "typeId": "classe" },
  "values": {
    "nome": "Contato",
    "descricao": null,
    "versao": 1,
    "revisadoEm": "2026-10-02",
    "atributos": [
      {
        "_id": "R1",
        "nome": "email",
        "tipo": "String",
        "obrigatorio": "sim",
        "exemplo": null
      }
    ]
  },
  "entries": []
}
```

### Ids estáveis

Os ids de par (`entries[].id`) e de linha (`_id`) são UUIDs que **não mudam** ao editar a chave
ou os valores. É neles que as referências se apoiam. São únicos: ids de par no projeto inteiro,
ids de linha dentro da tabela.

### Referências (`ref`)

O valor de um campo `ref` aponta para uma tupla de **outra** anotação, em qualquer marcação ou
imagem do projeto. Há três formatos:

| Alvo                          | Valor                                | Rótulo          |
| ----------------------------- | ------------------------------------ | --------------- |
| Par de anotação livre         | `{ "annotationId", "entryId" }`      | `User.name`     |
| Linha de `table` com etiqueta | `{ "annotationId", "key", "rowId" }` | `Contato.email` |
| Campo simples com etiqueta    | `{ "annotationId", "key" }`          | `Contato.nome`  |

**Como resolver uma referência** (passo a passo):

1. Ache em `annotations` a anotação de `id` igual a `annotationId`. Se não existir, a
   referência está **quebrada**.
2. Se o valor tem `entryId`: procure em `entries` dessa anotação (livre) o par com esse `id`.
   O alvo é o par; o rótulo é `<rótulo da anotação>.<key do par>`.
3. Se tem `key` e `rowId`: em `values[key]` (um array), procure a linha com `_id` igual a
   `rowId`. O rótulo usa o valor da coluna indicada por `rowLabel` no campo da especialização.
4. Se tem só `key`: o alvo é o campo `values[key]` da anotação tipada; o rótulo usa o `label` do
   campo (ou a `key`).
5. Para saber se o alvo é **aceito**, compare com `accepts` do campo de origem: um par livre só
   vale com `"free": true`; uma linha ou campo precisa ter, na especialização, alguma das
   etiquetas (`tags`) de `accepts.tags`.

Excluir o alvo **não apaga** a referência: ela continua no arquivo e fica quebrada.

Em código TypeScript, `src/model/` oferece `resolveRef`, `refLabel`, `findRefTargets` (alvos aceitos
por um campo) e `getBacklinks` (quem aponta para uma anotação).

### Pendências

O estado "incompleta" **não é gravado**: é calculado a partir do projeto e das cópias em `specs/`
(`getAnnotationIssues` em `src/model/`). Motivos: campo obrigatório vazio (inclusive coluna
obrigatória numa linha), valor incompatível com o tipo, opção inexistente, chave fora do tipo,
tipo inexistente, anotação fora da camada do seu tipo, dono ausente (`requiresOwner`), dono de
tipo não permitido (`allowedChildren`), referência quebrada e alvo não aceito. Nenhum deles
impede a abertura do projeto.

## Como um agente lê o `mapping.json`

1. **Recorte da marcação**: `rect` em pixels da imagem em `images[].file` (orientação EXIF aplicada).
2. **Anotações próprias**: `annotations` com o `markingId` da marcação, agrupadas por `layerId`.
3. **Herdadas**: subir por `parentId` e pegar as anotações dos ancestrais com `inherit: true`.
4. **Estrutura**: anotações com `parentAnnotationId` formam uma árvore; o nome da camada da
   vinculada é o nome da propriedade na dona. Ex.: `Button.Eventos = [onClick, onLongPress]`.
5. **Significado**: numa anotação tipada, leia o tipo em `specs/<arquivo>.json` (camada
   `layers[].id == layer.spec.layerId`, tipo `annotationTypes[].id == type.typeId`). Os campos
   (`fields`) dizem o `label`, o tipo e a descrição de cada chave de `values`.
6. **Referências**: campos `ref` em `values` apontam para outras anotações (ver acima).

Em código TypeScript, `src/model/` oferece `getInheritedAnnotations(project, markingId)` e
`getLinkedAnnotations(project, annotationId)`.

## Migração

Arquivos v1 são migrados ao abrir: toda imagem recebe `name: null` e toda anotação recebe
`inherit: false` e `parentAnnotationId: null`. Arquivos v2 recebem `markingColor: null` em cada imagem.
Arquivos v3 recebem `specializations: []`, `spec: null` em cada camada, `type: null` e
`values: null` em cada anotação e um `id` novo em cada par. Ao salvar, o arquivo passa a ser v4.
Arquivos de versão mais nova abrem somente para leitura.
