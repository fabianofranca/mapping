# Formato do `mapping.json` (schema v6)

O projeto é uma pasta (ou um zip com o mesmo conteúdo) com `mapping.json`, `images/` e,
se houver especializações aplicadas, `specs/`. Todas as coordenadas das marcações são
**pixels inteiros da imagem original** (`images[].file`, com a orientação EXIF já aplicada).

```
meu-projeto/
├── .gitignore        # só no modo pasta, criado com o projeto: ignora backups/
├── mapping.json
├── images/
├── specs/            # cópias das especializações aplicadas (ver SPEC-FORMAT.md)
│   ├── sdui.json
│   └── modelo-dados.json
└── backups/          # só no modo pasta: originais guardados antes de migrar o schema
    └── mapping.v1.20260930-143015.json
```

Ao abrir um `mapping.json` de versão antiga, a app migra em memória e, **antes do primeiro
salvamento**, guarda o texto original em `backups/mapping.v<versão>.<AAAAMMDD-HHMMSS>.json`
(horário local). Ao **criar** um projeto numa pasta, a app grava também um `.gitignore` com `backups/`
(ou acrescenta a linha a um `.gitignore` que já exista, sem sobrescrevê-lo), para quem versiona a pasta
com git. No modo local, o backup fica no armazenamento do navegador (os 3 mais recentes
por projeto). A pasta `backups/` não faz parte do projeto: o zip exportado não a inclui.

```json
{
  "schemaVersion": 6,
  "revision": 0,
  "app": "mapping",
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
      "markingColor": null,
      "locked": false
    }
  ],
  "markings": [
    {
      "id": "M1",
      "imageId": "I1",
      "parentId": null,
      "name": "Botão",
      "rect": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "needsReview": false,
      "locked": false
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

## Referência dos campos

Todos os campos abaixo são **obrigatórios** (nenhum é omitido; o "vazio" é `null`). Ids são
strings não vazias, únicas dentro da sua coleção (a app gera `crypto.randomUUID()`; ids curtos
como `M1` nos exemplos também valem). Cores são `#RRGGBB`.

**Raiz**

| Campo              | Tipo    | Descrição                                                                 |
| ------------------ | ------- | ------------------------------------------------------------------------- |
| `schemaVersion`    | `6`     | Versão do schema.                                                         |
| `revision`         | inteiro | Contador de gravações (v6, ver abaixo).                                   |
| `app`              | string  | Sempre `"mapping"` (a leitura aceita também `"mapeador-imagens"`).        |
| `coordinateSystem` | string  | Sempre `"image-pixels-exif-oriented"`: pixels da imagem, EXIF aplicado.   |
| `project`          | objeto  | `name` (texto), `createdAt` e `updatedAt` (ISO 8601).                     |
| `specializations`  | array   | Especializações aplicadas (ver v4).                                       |
| `layers`           | array   | Camadas, **globais** (valem para todas as imagens), na ordem de exibição. |
| `images`           | array   | Imagens do projeto.                                                       |
| `markings`         | array   | Marcações retangulares.                                                   |
| `annotations`      | array   | Anotações (livres ou tipadas).                                            |

**`layers[]`**: `id`; `name` (não vazio); `color`; `spec` (`null` ou `{ specId, layerId }`).

**`images[]`**: `id`; `name` (`string` ou `null`); `file` (caminho relativo, ex: `images/home.webp`, único
no projeto); `width` e `height` (pixels inteiros, com a orientação EXIF já aplicada);
`placement` (`{ x, y, scale }` — posição e escala da imagem no canvas, só para a interface);
`markingColor` (`null` ou cor); `locked` (booleano, v5: ver abaixo).

**`markings[]`**: `id`; `imageId`; `parentId` (marcação-pai ou `null`); `name` (`string` ou `null`);
`rect` (`{ x, y, width, height }`, **inteiros em pixels da imagem original**, `x`/`y` ≥ 0);
`needsReview` (booleano, só para a interface); `locked` (booleano, v5: ver abaixo).

**`annotations[]`**: `id`; `markingId`; `layerId`; `name` (`string` ou `null`); `inherit`;
`parentAnnotationId`; `type`, `values` e `entries` (ver v4). Livre: `type` e `values` são `null`.
Tipada: os dois preenchidos e `entries` vazio.

## Regras de validade

Um arquivo só abre se passar nas regras abaixo (`validateProject` em `src/model/`); caso contrário, a app
recusa o arquivo e informa o problema, sem alterá-lo.

- Ids únicos em cada coleção; `file` único entre as imagens; `file` das especializações único.
- Toda marcação aponta para uma imagem existente; `parentId`, se houver, é uma marcação existente.
- `rect`: inteiros, largura e altura **≥ 8 px**, e **inteiramente dentro** da imagem (`0 ≤ x`,
  `x + width ≤ width da imagem`; idem para `y`).
- A marcação-pai está **na mesma imagem** e **contém** o `rect` da filha. Não há ciclos.
- As imagens **não se sobrepõem** no canvas (`placement` × tamanho × escala).
- Toda anotação aponta para uma marcação e uma camada existentes.
- Pares (`entries`): chave não vazia (após `trim`) e única dentro da anotação; ids de par únicos no projeto.
- Linhas de `table`: `_id` único dentro da tabela.
- Anotação "dona" (`parentAnnotationId`): existe, está na **mesma marcação** e em **outra camada**, e a
  cadeia não tem ciclos.

Regras das especializações (campo obrigatório vazio, tipo incompatível, referência quebrada,
`allowedChildren`…) **não** impedem a abertura: viram **pendências** (ver abaixo).

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

## Campos da v6 (revisão)

`revision` (inteiro ≥ 0, obrigatório, logo depois de `schemaVersion`) conta as gravações do arquivo. Quem
grava (a app ou o servidor MCP) relê o arquivo antes, confere se a `revision` no disco é a que carregou e
grava `revision + 1`; se for outra, alguém alterou o `mapping.json` por fora e a gravação é recusada ou
confirmada pelo usuário. Quem edita o arquivo à mão não precisa mexer no campo, mas o valor só sobe
quando a app ou o MCP gravam. As operações do `src/model/` não alteram a `revision`: ela é do arquivo, não
do conteúdo. (A conferência na gravação entra na fase 3a.2; a v6 só traz o campo.)

## Campos da v5 (trava)

`images[].locked` e `markings[].locked` (`true`/`false`, obrigatórios) protegem itens já revisados
contra alterações acidentais. Quem **lê** o arquivo (um agente que recorta a imagem) pode ignorá-los:
a trava não muda o significado dos dados, só o que a app deixa **alterar**.

- A trava vale para **a manipulação direta do próprio item trancado**: ele **não pode ser movido,
  redimensionado nem excluído**. A seleção continua livre, e nome, pai, anotações e "Confirmar posição"
  continuam editáveis.
- Trancar uma marcação **trava a geometria dos descendentes** (mover e redimensionar), sem alterar o
  `locked` deles: destrancar o pai libera todos. Excluir um descendente solto continua permitido.
- Um descendente trancado **nunca impede o pai**. Mover o pai **leva junto** os descendentes trancados,
  mantendo a posição relativa (o pai e os descendentes se movem pelo mesmo deslocamento); redimensionar o
  pai não move os filhos. Excluir o pai (ou uma imagem) com descendentes trancados é permitido: eles são
  excluídos junto, e a confirmação informa **quantos itens trancados** serão excluídos. Só a própria
  marcação (ou imagem) trancada bloqueia a exclusão.
- Imagem trancada: não pode ser movida nem redimensionada no canvas. As marcações dela seguem a regra
  própria (as coordenadas são em pixels da imagem, então mover a imagem não as muda). Trocar o arquivo
  por outro de **tamanho diferente** (o que reescala as marcações) é bloqueado se a imagem ou alguma
  marcação dela estiver trancada; reapontar um arquivo do mesmo tamanho é livre.
- Criar marcações novas dentro de um pai ou imagem trancados continua permitido, e o `locked` delas
  começa em `false`.
- "Trancar todas as marcações desta imagem" muda o `locked` de todas as marcações da imagem de uma só vez
  (uma entrada no desfazer). Trancar e destrancar entram no desfazer.
- Os itens vindos do Figma (etapa 4) serão somente leitura por outro mecanismo; a trava é para os itens
  manuais.

As regras ficam em `src/model/locks.ts` (`canEditMarkingGeometry`, `canDeleteMarking`,
`canEditImagePlacement`, `canDeleteImage`, `canReplaceImage`); as operações do modelo lançam o erro
`locked` se alguém tentar contorná-las.

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
`values: null` em cada anotação e um `id` novo em cada par. Arquivos v4 recebem `locked: false` em cada
imagem e em cada marcação. Arquivos v5 recebem `revision: 0`. Ao salvar, o arquivo passa a ser v6 (e, no modo pasta, o original vai antes
para `backups/`, como em qualquer migração).
Arquivos de versão mais nova abrem somente para leitura.
