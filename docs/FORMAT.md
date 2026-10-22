# Formato do `mapping.json` (schema v13)

O projeto é uma pasta (ou um zip com o mesmo conteúdo) com `mapping.json`, `images/` (os arquivos de imagem dos containers) e,
se houver especializações aplicadas, `specs/` (e, se houver propostas de alteração, `proposals/`). Todas as coordenadas das marcações são
**pixels inteiros da imagem original** do container (`containers[].file`, com a orientação EXIF já aplicada), com uma exceção
desde a v13: a **marcação do canvas** (`containerId` nulo), cujo `rect` é em unidades do canvas (ver "Campos da v13 (pertencimento)").

```
meu-projeto/
├── .gitignore        # só no modo pasta, criado com o projeto: ignora backups/
├── mapping.json
├── images/
├── specs/            # cópias das especializações aplicadas (ver SPEC-FORMAT.md)
│   ├── sdui.json
│   ├── modelo-dados.json
│   └── material3/    # pacote de biblioteca (formatVersion 4): a pasta da especialização
│       ├── material3.spec.json
│       ├── components/ docs/ examples/ fonts/
├── proposals/        # propostas de alteração (ver PROPOSAL-FORMAT.md)
│   └── 8c1f…/
│       ├── proposal.json
│       └── images/   # imagens novas ou trocadas, até serem aceitas
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
  "schemaVersion": 13,
  "revision": 0,
  "app": "mapping",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": { "name": "Carro", "createdAt": "…", "updatedAt": "…" },
  "specializations": [],
  "platformRepos": {},
  "layers": [{ "id": "L1", "name": "Componentes", "color": "#E53935", "spec": null }],
  "containers": [
    {
      "id": "I1",
      "name": "Tela Home",
      "file": "images/home.webp",
      "width": 1182,
      "height": 2560,
      "placement": { "x": 0, "y": 0, "scale": 0.4 },
      "parentId": null,
      "markingColor": null,
      "locked": false,
      "source": null,
      "background": null
    }
  ],
  "markings": [
    {
      "id": "M1",
      "containerId": "I1",
      "parentId": null,
      "name": "Botão",
      "rect": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "needsReview": false,
      "locked": false,
      "floating": false,
      "source": { "system": "figma", "id": "12:34", "url": null }
    }
  ],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Button",
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

| Campo              | Tipo    | Descrição                                                                    |
| ------------------ | ------- | ---------------------------------------------------------------------------- |
| `schemaVersion`    | `13`    | Versão do schema.                                                            |
| `revision`         | inteiro | Contador de gravações (v6, ver abaixo).                                      |
| `app`              | string  | Sempre `"mapping"` (a leitura aceita também `"mapeador-imagens"`).           |
| `coordinateSystem` | string  | Sempre `"image-pixels-exif-oriented"`: pixels da imagem, EXIF aplicado.      |
| `project`          | objeto  | `name` (texto), `createdAt` e `updatedAt` (ISO 8601; fuso vira UTC).         |
| `specializations`  | array   | Especializações aplicadas (ver v4).                                          |
| `platformRepos`    | objeto  | Clone local de cada plataforma (v7; só `localPath` desde a v11, ver abaixo). |
| `layers`           | array   | Camadas, **globais** (valem para todos os containers), na ordem de exibição. |
| `containers`       | array   | Containers do projeto (v12; antes `images`).                                 |
| `markings`         | array   | Marcações retangulares (de um container ou do canvas, v13).                  |
| `arrows`           | array   | Setas (v13): marcações que apontam, ligam duas marcações.                    |
| `annotations`      | array   | Anotações (livres ou tipadas).                                               |

**`layers[]`**: `id`; `name` (não vazio); `color`; `spec` (`null` ou `{ specId, layerId }`).

**`containers[]`** (v12; até a v11 a coleção se chamava `images`): `id`; `name` (`string` ou `null`); `file` (caminho relativo, ex: `images/home.webp`, único
no projeto; `null` no container sem arquivo, v10: ver abaixo); `width` e `height` (pixels inteiros, com a orientação EXIF já aplicada);
`placement` (`{ x, y, scale }` — posição e escala da imagem no canvas, só para a interface);
`parentId` (v13: `null` ou a marcação do canvas que envolve o container, calculado pela app; ver abaixo);
`markingColor` (`null` ou cor); `locked` (booleano, v5: ver abaixo); `source` (`null` ou origem, v8:
ver abaixo); `background` (`null` ou cor `#RRGGBB`, v10: a cor de fundo do container sem arquivo).

**`markings[]`**: `id`; `containerId` (v12; antes `imageId`; `null` na marcação do canvas, v13); `parentId` (marcação-pai ou `null`,
calculado pela app desde a v13); `name` (`string` ou `null`);
`rect` (`{ x, y, width, height }`, **inteiros em pixels da imagem original** do container, `x`/`y` ≥ 0; na marcação do canvas,
**inteiros em unidades do canvas**, `x`/`y` podem ser negativos);
`needsReview` (booleano, só para a interface); `locked` (booleano, v5: ver abaixo); `floating` (booleano, v13: ver abaixo);
`source` (`null` ou origem, v8: ver abaixo).

**`arrows[]`** (v13): `id` (no mesmo espaço dos ids das marcações); `from` e `to` (ids de marcações, diferentes); `fromSide` e `toSide`
(`top`, `right`, `bottom`, `left` ou `null`); `points` (pontos de passagem da rota); `style` (`straight`, `curve` ou `elbow`);
`name` (`string` ou `null`); `locked` (booleano). Ver "Campos da v13 (setas)".

**`annotations[]`**: `id`; `markingId` (o id de uma marcação **ou de uma seta**, v13); `layerId`; `name` (`string` ou `null`);
`parentAnnotationId`; `type`, `values` e `entries` (ver v4). Livre: `type` e `values` são `null`.
Tipada: os dois preenchidos e `entries` vazio.

## Regras de validade

Um arquivo só abre se passar nas regras abaixo (`validateProject` em `src/model/`); caso contrário, a app
lista os problemas e repara o que tem reparo mecânico (ver "Arquivos inconsistentes"), sem alterar o
arquivo ao ler.

- Ids únicos em cada coleção; `file` único entre as imagens que têm arquivo; `file` das especializações único.
- Container (v12): `file` é `null` se, e somente se, `background` é uma cor (`container-content`).
- Toda marcação tem `containerId` nulo (marcação do canvas, v13) ou de um container existente; `parentId`, se houver, é uma marcação existente.
- `rect`: inteiros, largura e altura **≥ 8 px**; na marcação de container, **inteiramente dentro** da imagem (`0 ≤ x`,
  `x + width ≤ width da imagem`; idem para `y`); na marcação do canvas, sem limite de posição.
- A marcação-pai está **no mesmo espaço** (o mesmo container, ou o canvas) e **contém** o `rect` da filha. Não há ciclos.
- Pertencimento (v13): ver "Campos da v13 (pertencimento)"; o `parentId` do container e a marcação flutuante têm regras próprias.
- As imagens **não se sobrepõem** no canvas (`placement` × tamanho × escala).
- Toda anotação aponta para uma marcação (ou uma seta, v13) e uma camada existentes.
- Seta (v13): `from` e `to` são marcações existentes (nem outra seta, nem um container) e diferentes
  (`arrow-endpoint-missing`, `arrow-self`); o id dela não repete o de uma marcação nem o de outra seta
  (`duplicate-id`). Nada mais é invariante: duas setas iguais são permitidas.
- Pares (`entries`): chave não vazia (após `trim`) e única dentro da anotação; ids de par únicos no projeto.
- Linhas de `table`: `_id` único dentro da lista.
- `source` (v8): `null` ou `{ system, id, url }`, com `system` e `id` textos não vazios e `url` texto ou
  `null` (as três chaves presentes).
- `platformRepos` (v11): chaves no formato `[a-z0-9-]+`; cada valor com `localPath` (texto). Uma chave
  desconhecida na entrada (o antigo `urlTemplate`) é descartada na leitura. Configuração de uma plataforma
  que nenhuma especialização declara não impede a abertura.
- Anotação "dona" (`parentAnnotationId`): existe, está na **mesma marcação** e em **outra camada**, e a
  cadeia não tem ciclos.

Regras das especializações (campo obrigatório vazio, tipo incompatível, referência quebrada,
`allowedChildren`…) **não** impedem a abertura: viram **pendências** (ver abaixo).

### Arquivos inconsistentes

Um arquivo que viola as regras acima (editado à mão, gerado por outra ferramenta) não abre direto: a app
mostra a **lista exata** dos problemas (regra, tipo do item, id e nome), com **Copiar**.

Quando todos os problemas têm reparo mecânico e inequívoco (`repairProject` em `src/model/repair.ts`), o
diálogo oferece **Reparar e abrir**:

| Problema                                                                                               | Reparo                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Par com `id` já usado (em outra anotação ou na mesma)                                                  | O primeiro fica com o id; os outros ganham um id novo.                     |
| `rect` fora da imagem                                                                                  | Recortado aos limites da imagem; se não sobra área, a marcação é removida. |
| Marcação de imagem inexistente                                                                         | Removida.                                                                  |
| Seta com ponta inexistente (ou que é outra seta) ou ligada a ela mesma (v13)                           | Removida, com as anotações dela (na rodada seguinte).                      |
| Anotação de marcação ou camada inexistente                                                             | Removida, com as anotações que ela possui (`parentAnnotationId`).          |
| `parentId` inexistente ou ciclo na hierarquia de marcações                                             | A marcação (no ciclo, cada uma do ciclo) vira raiz do espaço dela.         |
| Marcação flutuante dentro de um container ou com pai (v13)                                             | Vai para o canvas, com o `rect` convertido, e fica sem pai.                |
| Pai de marcação flutuante; pai de container inexistente, que não é do canvas ou que não o contém (v13) | O `parentId` vira `null`.                                                  |
| Imagens sobrepostas                                                                                    | A de maior índice vai para a direita da caixa das anteriores.              |

Um reparo pode expor outro (a marcação removida deixa as anotações dela sem marcação e os filhos sem pai):
cada rodada resolve o que a anterior expôs. Qualquer outro problema (id repetido de imagem, marcação,
anotação, camada ou especialização; arquivo repetido; `rect` pequeno demais; filha fora do pai; pai em
outra imagem; problemas de anotação dona; chave vazia ou repetida; `_id` repetido em `table`)
deixa o arquivo **recusado**: o diálogo só lista e fecha. Corrija o arquivo à mão (ou restaure uma cópia)
e abra de novo.

Ler nunca grava. Ao reparar, o projeto abre reparado em memória; o original vai para
`backups/mapping.v<versão>.<AAAAMMDD-HHMMSS>.json` e o reparado para o `mapping.json` só na **primeira
gravação**, como na migração. O nome é o mesmo do backup de migração (um v11 reparado vira
`mapping.v11.<data>.json`): para saber qual foi o motivo, compare a data com o Diagnóstico ou o conteúdo
com o `mapping.json` atual. O resumo do reparo fica no aviso do editor e no Diagnóstico. O servidor MCP
continua recusando o arquivo (ler nunca grava), com a mesma lista de problemas na resposta.

Datas (`createdAt`, `updatedAt`) com fuso (`2026-10-01T09:30:00-03:00`, de outra ferramenta) são aceitas
e gravadas em UTC (`2026-10-01T12:30:00.000Z`).

## Campos da v2 e v3 (registro histórico)

O campo `annotations[].inherit` (v2) saiu na v13 (ver "Campos da v13"); abaixo, o que a v2 e a v3 introduziram.

- `containers[].name`: rótulo opcional (`null` = use o nome do arquivo). Mudá-lo não renomeia o arquivo.
- `containers[].markingColor` (v3): cor `#RRGGBB` da borda das marcações da imagem, ou `null` (cor neutra do tema). Só afeta a interface, não o recorte.
- `annotations[].inherit` (v2, **removido na v13**): marcava a anotação como válida para os descendentes da marcação.
- `annotations[].parentAnnotationId`: anotação "dona" (ou `null`).
  - a dona está na **mesma marcação** e em **outra camada**;
  - não há ciclos (a cadeia pode atravessar várias camadas).
- `placement` e `needsReview` só importam para a interface; `placement` não afeta o recorte.

Uma anotação vale só para a própria marcação; o contexto de uma marcação filha vem do caminho (`parentId`),
não de anotações herdadas.

## Campos da v4 (especializações)

Uma **especialização** é um arquivo JSON que define camadas e tipos de anotação (formato em
[`SPEC-FORMAT.md`](SPEC-FORMAT.md)). Ao ser aplicada, ela é **copiada** para `specs/<id>.json`:
o projeto fica autocontido e quem lê entende o significado das camadas e chaves.

- `specializations[]`: `{ "id", "version", "file" }` de cada especialização aplicada. `file` é o
  caminho da cópia (`specs/sdui.json`) ou, num pacote de biblioteca, o do arquivo da
  especialização **dentro da pasta** (`specs/material3/material3.spec.json`).
- **Pasta `specs/<id>/` (pacote da biblioteca, `formatVersion` 4).** Aplicar a especialização a
  partir de uma pasta (ou zip) **copia a pasta inteira** para `specs/<id>/` (`<id>` limpo para nome
  de pasta, com sufixo `-2`… se colidir): o arquivo da especialização, `components/`, `docs/`,
  `examples/` e `fonts/`, com os caminhos relativos que a especialização cita. Os bytes são
  preservados (as fontes são binárias); no zip exportado a pasta vai igual. Só o arquivo da
  especialização é lido para o projeto em memória (o `file` acima); os demais arquivos não
  fazem parte do estado nem do desfazer: a app os lê quando precisa (validar ao abrir, desenhar).
  Atualizar a versão regrava a pasta inteira (o que a versão nova não tem sai); remover a
  especialização apaga a pasta; desfazer um e outro devolve os arquivos. Pacote incompleto
  (arquivo citado que falta) não impede abrir o projeto: aparece como problema da biblioteca no
  Diagnóstico. O schema do `mapping.json` não muda: a v1 a v3 continuam `specs/<id>.json`.
- `layers[].spec`: `null` (camada livre) ou `{ "specId", "layerId" }`, a camada de origem na
  especialização. Camadas da especialização só têm anotações **tipadas** dela.
- `annotations[].type`: `null` (anotação **livre**) ou `{ "specId", "typeId" }` (anotação **tipada**).
- `annotations[].values`: `null` na livre; na tipada, um objeto com os valores por `key` do campo,
  em **JSON nativo**:
  - `string` e `enum`: texto; `number`: número; `date`: texto ISO `AAAA-MM-DD`;
  - `table`: array de linhas; cada linha tem as chaves das colunas e um id interno `_id`;
  - `ref`: objeto de referência (abaixo);
  - campo vazio: `null` (ou ausente); `table` vazia: `[]` (`null` também vale).
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
quando a app ou o MCP gravam; a app percebe a edição à mão pelo conteúdo (e pela data do arquivo), não só
pela `revision`. As operações do `src/model/` não alteram a `revision`: ela é do arquivo, não do conteúdo
(a app a guarda na sessão e a incrementa a cada gravação). Um arquivo sem o campo (v5) vale `0`, como na
migração.

## Campos da v5 (trava)

`containers[].locked` e `markings[].locked` (`true`/`false`, obrigatórios) protegem itens já revisados
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
- Os itens que chegam de outra ferramenta (etapa 4) entram por **propostas de alteração** revisadas
  ([`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)); aceitar numa revisão uma mudança de geometria ou a
  remoção de um item trancado é permitido (com aviso), e a trava continua ligada depois.

As regras ficam em `src/model/locks.ts` (`canEditMarkingGeometry`, `canDeleteMarking`,
`canEditImagePlacement`, `canDeleteImage`, `canReplaceImage`); as operações do modelo lançam o erro
`locked` se alguém tentar contorná-las.

### Ids estáveis

Os ids de par (`entries[].id`) e de linha (`_id`) são UUIDs que **não mudam** ao editar a chave ou os
valores. É neles que as referências se apoiam. São únicos: ids de par no projeto inteiro e ids de linha
dentro da tabela.

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
tipo não permitido (`allowedChildren`), referência quebrada e alvo não aceito. Nenhum deles impede a
abertura do projeto.

## Campos da v7 (repositórios por plataforma)

> **Histórico:** na v11 o `urlTemplate` saiu do projeto: o endereço do repositório passou para a
> especialização e o projeto guarda só o `localPath`. Ver "Campos da v11".

A v7 ligou o mapeamento ao código das plataformas que as especializações declaram
([`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Plataformas e code"): a especialização diz como se cria uma
instância de cada tipo (`code`, com o `symbol` e o arquivo que o define, `path`) e o projeto guardava
**onde ficava o repositório** de cada plataforma (`platformRepos`), com um `urlTemplate` e um `localPath`.
Até a v8 havia também o campo `codeRef` (o lugar da solução em que a instância foi escrita), que saiu
na v9 (ver "Campos da v9").

## Campos da v8 (origem externa)

`containers[].source` e `markings[].source` guardam a **identidade do item num sistema externo**, para que
uma reexportação reconheça os mesmos elementos (ex: o mesmo container ou o mesmo componente exportados de
novo de uma ferramenta de design) e proponha só o que mudou.

```json
"source": { "system": "figma", "id": "12:34", "url": "https://www.figma.com/design/abc?node-id=12-34" }
```

| Campo    | Tipo             | Descrição                                                              |
| -------- | ---------------- | ---------------------------------------------------------------------- |
| `system` | string           | Sistema de origem (texto livre, não vazio). O núcleo não o interpreta. |
| `id`     | string           | Id do elemento no sistema de origem (não vazio).                       |
| `url`    | string ou `null` | Endereço do elemento na origem, se houver.                             |

- `null` = item sem origem (criado à mão). A origem não muda o significado dos dados nem a trava.
- O formato não exige origens únicas: a busca (`findBySource(project, system, id)` em `src/model/`)
  devolve todas as imagens e marcações com a mesma origem, imagens primeiro.
- Quem atribui a origem é quem importa (um agente, por uma proposta); a app a mostra e a preserva.

Em código TypeScript, `src/model/` oferece `resolveRef`, `refLabel`, `findRefTargets` (alvos aceitos
por um campo) e `getBacklinks` (quem aponta para uma anotação).

### Pendências

O estado "incompleta" **não é gravado**: é calculado a partir do projeto e das cópias em `specs/`
(`getAnnotationIssues` em `src/model/`). Motivos: campo obrigatório vazio (inclusive coluna
obrigatória numa linha), valor incompatível com o tipo, opção inexistente, chave fora do tipo,
tipo inexistente, anotação fora da camada do seu tipo, dono ausente (`requiresOwner`), dono de
tipo não permitido (`allowedChildren`), referência quebrada e alvo não aceito. Nenhum deles impede a
abertura do projeto.

## Campos da v7 (repositórios por plataforma)

> **Histórico:** na v11 o `urlTemplate` saiu do projeto: o endereço do repositório passou para a
> especialização e o projeto guarda só o `localPath`. Ver "Campos da v11".

A v7 ligou o mapeamento ao código das plataformas que as especializações declaram
([`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Plataformas e code"): a especialização diz como se cria uma
instância de cada tipo (`code`, com o `symbol` e o arquivo que o define, `path`) e o projeto guardava
**onde ficava o repositório** de cada plataforma (`platformRepos`), com um `urlTemplate` e um `localPath`.
Até a v8 havia também o campo `codeRef` (o lugar da solução em que a instância foi escrita), que saiu
na v9 (ver "Campos da v9").

## Campos da v8 (origem externa)

`containers[].source` e `markings[].source` guardam a **identidade do item num sistema externo**, para que
uma reexportação reconheça os mesmos elementos (ex: o mesmo container ou o mesmo componente exportados de
novo de uma ferramenta de design) e proponha só o que mudou.

```json
"source": { "system": "figma", "id": "12:34", "url": "https://www.figma.com/design/abc?node-id=12-34" }
```

| Campo    | Tipo             | Descrição                                                              |
| -------- | ---------------- | ---------------------------------------------------------------------- |
| `system` | string           | Sistema de origem (texto livre, não vazio). O núcleo não o interpreta. |
| `id`     | string           | Id do elemento no sistema de origem (não vazio).                       |
| `url`    | string ou `null` | Endereço do elemento na origem, se houver.                             |

- `null` = item sem origem (criado à mão). A origem não muda o significado dos dados nem a trava.
- O formato não exige origens únicas: a busca (`findBySource(project, system, id)` em `src/model/`)
  devolve todas as imagens e marcações com a mesma origem, imagens primeiro.
- Quem atribui a origem é quem importa (um agente, por uma proposta); a app a mostra e a preserva.

## Como um agente lê o `mapping.json`

1. **Recorte da marcação**: `rect` em pixels da imagem em `containers[].file` (orientação EXIF aplicada).
   A marcação do canvas (`containerId` nulo) não tem recorte: o `rect` dela é em unidades do canvas.
   **Pertencimento**: quem está dentro de quem já vem gravado em `parentId` (da marcação e do container).
   Agrupe por `parentId`; **não calcule interseções nem escolha pai por geometria**, e não grave `parentId`
   à mão: a app o recalcula a partir dos retângulos (ver "Campos da v13 (pertencimento)").
2. **Anotações próprias**: `annotations` com o `markingId` da marcação, agrupadas por `layerId`.
3. **Estrutura**: anotações com `parentAnnotationId` formam uma árvore; o nome da camada da
   vinculada é o nome da propriedade na dona. Ex.: `Button.Eventos = [onClick, onLongPress]`.
4. **Significado**: numa anotação tipada, leia o tipo em `specs/<arquivo>.json` (camada
   `layers[].id == layer.spec.layerId`, tipo `annotationTypes[].id == type.typeId`). Os campos
   (`fields`) dizem o `label`, o tipo e a descrição de cada chave de `values`.
5. **Referências**: campos `ref` em `values` apontam para outras anotações (ver acima).
6. **Código de instanciação**: o `code` do tipo diz como se cria uma instância dele em cada plataforma
   (`symbol` é o que se chama, `path` é o arquivo que o define, `params`, `values` e `notes` dizem como
   passar os campos; [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Plataformas e code"). O arquivo de cada `symbol`
   está no `repo` da plataforma, **na especialização do tipo**: monte a URL com o `urlTemplate` do `repo`
   (ver "Campos da v11") ou, se o projeto informar o clone local em `platformRepos[plataforma].localPath`,
   junte o `localPath` e o `path` (relativos à pasta do projeto). Leia o arquivo para saber a assinatura e
   escreva a chamada na solução. Para ir do código ao mapeamento, procure os tipos cujo `path` é igual ao
   arquivo ou termina com ele por segmentos inteiros (`DSButton.kt` casa com `app/…/DSButton.kt`,
   `Button.kt` não) ou cujo `symbol` é igual, e depois as anotações desses tipos. O mapeamento não guarda
   nada sobre a solução.

Em código TypeScript, `src/model/` oferece `getLinkedAnnotations(project, annotationId)` e, para o código, `codeLink`, `codeLocalPath`,
`findByCode` e `codeBlueprint`.

## Campos da v9 (sem o campo de código)

A v9 não acrescenta campos: ela tira do formato o campo `codeRef` das especializações (o lugar da
solução em que a instância foi escrita, uma lista de entradas `{ _id, platform, path, symbol, line }` em
`values`). O mapeamento e a especialização guardam só o que ajuda a **instanciar** os tipos (o `code`
dos tipos), nunca onde a instância ficou.

- **Migração v8 → v9**: os valores dos campos `codeRef` saem de `values`. O tipo de cada campo vem da
  **cópia da especialização aplicada** (`specs/<id>.json`): a migração lê a cópia (crua, sem validar) e
  descarta, nas anotações dos tipos dela, só as chaves que ela declara com `"type": "codeRef"`. Uma chave
  de mesmo nome em outro tipo não é tocada. O resto do projeto não muda; um v8 sem `codeRef` só muda
  de versão.
- **Sem a cópia** (ausente, JSON ilegível ou de outra especialização) não há como saber quais chaves
  eram `codeRef`, e a migração não adivinha pelo formato do valor: os valores ficam. Com a cópia de
  volta, eles aparecem como "chave que não existe no tipo" (`unknown-field`), como qualquer campo que
  saiu de um tipo.
- **Cópias em `specs/`**: um campo `codeRef` na cópia é lido e ignorado (sai do tipo, com um aviso na
  importação); a app não regrava a cópia só por isso, então ela continua com o campo até a próxima
  atualização da especialização.
- **Propostas antigas**: uma mudança `values.<campo>` num campo que não existe mais no tipo não cabe no
  projeto (`field-mismatch`, ver [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)): aceita, bloqueia
  "Aplicar"; a visão Proposto a deixa de fora. O revisor a rejeita e o agente reenvia sem ela.

## Campos da v10 (container sem arquivo)

> Esta seção descreve a v10 com os nomes de então (`images[]`, `blank-background`, `blank-image`); na v12 a
> coleção é `containers[]` e a invariante é `container-content` (ver "Campos da v12").

A v10 permite uma imagem **sem arquivo**, o **container** sem arquivo: uma área
com tamanho e cor de fundo onde se marcam e desenham componentes, sem foto por baixo. **Container** é o nome
que a interface, o MCP e a documentação dão ao objeto de topo do canvas (com foto ou sem ela); o `mapping.json`
o grava em `images[]` (na v12, `containers[]`) e a letra `i` das referências `mapping://<projeto>/i/<código>` é o container. Em `images[]`:

- `file: null` e `background: "#RRGGBB"` (cor em maiúsculas); `width` e `height` inteiros de 1 a 20000
  (`MAX_BLANK_SIZE`). Não há arquivo em `images/`, nem no zip exportado, nem bitmap: o container é desenhado
  pela app. A imagem com arquivo tem `background: null`.
- **Invariante `blank-background`** (hoje `container-content`): `file === null` se, e somente se, `background !== null`. A checagem
  de `file` repetido (`duplicate-file`) ignora o container sem arquivo.
- Tudo o mais é igual ao de uma imagem: `placement` (mesma colocação ao adicionar, lado maior de 1000
  unidades do canvas), marcações em pixels do container, nome (`name`; sem nome a interface mostra
  "Container"), `markingColor`, `locked`, `source`.
- **Editar**: a cor muda livremente; o tamanho é geometria (imagem trancada recusa) e não pode deixar
  marcação para fora (`rect-out-of-image`) nem fazer a imagem sobrepor outra. Mantém a escala do
  `placement`.
- **Não vale** para o container sem arquivo: trocar o arquivo (`replace_container`/"Trocar imagem"), "Copiar recorte"
  e ler o arquivo pelo MCP (`get_container_file` devolve `container-without-file`; `get_marking_image` devolve a região
  na cor de fundo).
- **Propostas**: a criação leva a imagem inteira com `file: null`; a alteração ganha os campos `background`
  (cor) e `size` (`{ width, height }`), só quando a imagem é um container sem arquivo (ver
  [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)).
- **Migração v9 → v10**: toda imagem recebe `background: null` (um valor já presente é preservado). Nada
  mais muda.

## Campos da v11 (sobreposição local do repositório)

A v11 muda **onde fica o repositório** de cada plataforma. O arquivo de cada `symbol` está no repositório
da **biblioteca**, e por isso o endereço dele passou para a especialização (`platforms[].repo`,
`formatVersion` 5; [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Plataformas e code"). O projeto guarda só uma
**sobreposição local**: onde o clone desse repositório está nesta máquina.

### Sobreposição local (`platformRepos`)

```json
"platformRepos": {
  "android": { "localPath": "../../.." },
  "bff": { "localPath": "../../../../bff" }
}
```

- A chave é o id da plataforma. Plataformas com o **mesmo id** em especializações diferentes são a mesma
  plataforma e usam a mesma sobreposição (o nome exibido é o da primeira especialização aplicada). O
  endereço, ao contrário, é de cada especialização: cada uma declara o `repo` da própria biblioteca.
- **`localPath`**: raiz do clone local do repositório da plataforma, **relativa à pasta do projeto** (ex:
  `../../..` quando o projeto fica em `docs/mapping/telas/` dentro do repositório do app). Texto não vazio:
  a app não grava entrada vazia, e uma plataforma sem caminho sai do objeto. Remover uma especialização
  não apaga a sobreposição.
- Não há endereço no projeto: o `urlTemplate` não existe mais em `platformRepos`. Um arquivo antigo com
  ele é lido, e o campo é descartado pela migração (ver abaixo).
- Plataforma sem `localPath` não é problema: o agente usa o endereço do `repo` da especialização. O aviso
  de repositório ausente (`missing-repo`) **saiu na v11**; o que resta é o aviso da especialização
  (`path-without-repo`, plataforma em que algum tipo tem `path` e que não declara `repo`), conferido na
  validação dela e na importação.

### Como montar a URL do arquivo de um tipo

O `path` do `code` de um tipo da especialização (`code.<plataforma>.path`, o arquivo que define o
`symbol`, relativo à raiz do `repo` da plataforma; [`SPEC-FORMAT.md`](SPEC-FORMAT.md)):

1. Pegue, na **especialização dona do tipo** (a de `type.specId`), `platforms[<plataforma>].repo.urlTemplate`,
   com a plataforma da chave de `code`. Sem `repo` ou sem `urlTemplate`, não há link.
2. Troque `{path}` pelo `path`, codificando **cada segmento** (`encodeURIComponent`) e mantendo as `/`
   (ex: `Minha Tela.kt` → `Minha%20Tela.kt`).
3. Remova o trecho a partir do **último `#`** se ele contém `{line}` (e não `{path}`):
   `…/{path}#L{line}` → `…/{path}`; `…#lines-{line}` → sem o fragmento. Se `{line}` não estiver num
   fragmento assim (ex: `?linha={line}`), ele vira vazio.

Ex.: `https://github.com/org/app-android/blob/v3/{path}` com `path: "app/Main.kt"` dá
`…/blob/v3/app/Main.kt`. O `repo.ref` é informativo e não entra no link.

### Como achar o arquivo local

Junte `localPath` e `path` com `/`: o resultado é relativo à **pasta do projeto** (a do `mapping.json`).
Ex.: `localPath: "../../.."` e `path: "app/Main.kt"` → `../../../app/Main.kt`. Sem `localPath`, não há
caminho local.

Em código TypeScript, `src/model/` oferece `codeLink` (a URL, pelo `urlTemplate` do `repo` da
especialização dona do tipo), `codeLocalPath` (o caminho relativo à pasta do projeto, pela sobreposição),
`findByCode` (os tipos cujo `code` aponta para um arquivo ou símbolo, com as anotações deles),
`codeBlueprint` (o que `get_code_hints` devolve: o código de instanciação de cada tipo e, por marcação,
os valores a passar) e `projectPlatforms` (plataformas das especializações aplicadas, sem repetir id, cada
uma com os `repo` das especializações que a declaram).

### Migração v10 → v11

- O `urlTemplate` de cada entrada de `platformRepos` é **descartado**.
- A entrada que fica sem `localPath` (só tinha `urlTemplate`, ou o `localPath` era `null` ou vazio) é
  **removida**. A que tinha `localPath` o mantém, sem mais nada.
- Um v10 sem `platformRepos` migra sem mudar mais nada.
- Como toda migração, o original vai para `backups/mapping.v10.<AAAAMMDD-HHMMSS>.json` antes do primeiro
  salvamento (no modo pasta).
- O **Diagnóstico** registra o que foi descartado (as plataformas e os endereços) com a orientação:
  regrave a especialização com `repo` (`formatVersion` 5) e atualize-a no projeto. Até lá, a linha
  "Definição" e o MCP não montam o link dessa plataforma; o endereço descartado está no registro e no
  backup, para copiar para `repo.urlTemplate`.

## Campos da v12 (container)

A v12 troca o nome do objeto de topo do canvas: o que era a **imagem** passa a ser o **container** (uma área
com ou sem arquivo de imagem). Só o vocabulário do `mapping.json` muda; os dados são os mesmos.

- A coleção `images` vira **`containers`**, e a marcação troca `imageId` por **`containerId`**. Os campos de
  cada container (`id`, `name`, `file`, `width`, `height`, `placement`, `markingColor`, `locked`, `source`,
  `background`) não mudam.
- `file`: `string` (caminho em `images/`) ou `null` (container sem arquivo). `background`: cor `#RRGGBB` ou
  `null`.
- **Invariante `container-content`** (antes `blank-background`): `file === null` se, e somente se,
  `background !== null`. Erros relacionados: `container-without-file` (ler o arquivo de um container sem
  arquivo) e `container-has-file` (operação só do container sem arquivo aplicada a um com arquivo).
- Continuam com o nome antigo: a pasta `images/` (guarda os arquivos de imagem), a letra `i` das referências
  `mapping://<projeto>/i/<código>` (agora é o container), a chave `screen` de `origins` e, na proposta, o
  cabeçalho da mudança (`imageId`, `entity: "image"`; ver [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md)). Os
  campos da marcação dentro da proposta usam `containerId`; a proposta antiga (`imageId`) é lida convertendo.
- **Migração v11 → v12**: ao abrir, a app renomeia só essas duas chaves (`images` → `containers`,
  `imageId` → `containerId` em cada marcação) e muda `schemaVersion` para 12. Nada é apagado. Como toda
  migração, o original vai para `backups/mapping.v11.<AAAAMMDD-HHMMSS>.json` antes do primeiro salvamento
  (no modo pasta) e a faixa da migração aparece no topo.

| Versão | O que mudou                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v9     | Sem o campo de código (`codeRef`)                                                                                                                          |
| v10    | Container sem arquivo (`file: null`, `background`)                                                                                                         |
| v11    | `platformRepos` guarda só o `localPath`                                                                                                                    |
| v12    | `images` → `containers`, `imageId` → `containerId` (só os nomes)                                                                                           |
| v13    | Sem herança de anotações (`annotations[].inherit` saiu); marcação do canvas (`containerId` nulo), `floating`, `containers[].parentId` e a coleção `arrows` |

## Campos da v13 (sem herança)

A v13 tira do formato a herança de anotações: o campo `annotations[].inherit` ("a anotação vale para todos os
descendentes da marcação") não existe mais. Uma anotação vale **só para a própria marcação**. O que fica:

- O vínculo entre anotações (`parentAnnotationId`, `allowedChildren`, `requiresOwner`): é relação de dados na
  mesma marcação.
- A herança da **trava** (`lock.inherited`: a trava de um pai alcança os descendentes), que é outra coisa.
- **Migração v12 → v13**: ao abrir, a app apaga `inherit` de cada anotação e muda `schemaVersion` para 13.
  Nenhuma anotação é perdida; só deixa de valer para as marcações filhas. Como toda migração, o original vai
  para `backups/mapping.v12.<AAAAMMDD-HHMMSS>.json` antes do primeiro salvamento (no modo pasta) e a faixa da
  migração aparece no topo.
- O **Diagnóstico** registra quais anotações tinham a herança ligada (quantas e em que marcações), para quem
  quiser repetir a informação à mão (por exemplo, copiando a anotação para as filhas).
- A mesma v13 traz também o pertencimento por geometria (a seção seguinte) e será estendida pelas fases
  seguintes da etapa.

## Campos da v13 (pertencimento)

A v13 acrescenta ao formato a **marcação do canvas** e o **pertencimento por geometria**: quem contém quem é
decidido pela ferramenta, a partir dos retângulos, e gravado no JSON. Quem lê o arquivo agrupa por
`parentId`; nunca calcula interseção nem escolhe o pai.

**Campos novos**

| Onde           | Campo         | Tipo             | Descrição                                                                                                                          |
| -------------- | ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `markings[]`   | `containerId` | string ou `null` | `null` = **marcação do canvas**: não pertence a nenhum container e envolve containers e outras marcações do canvas.                |
| `markings[]`   | `floating`    | booleano         | Marcação **flutuante** (uma nota solta sobre telas): vive no canvas, fica por cima de tudo e está fora da árvore de pertencimento. |
| `containers[]` | `parentId`    | string ou `null` | A marcação do canvas que envolve o container (ver as regras abaixo), ou `null`. Calculado pela app.                                |

- **Espaço da marcação.** A marcação de container (`containerId` preenchido) tem `rect` em **pixels da imagem
  original** do container, dentro da imagem, como sempre. A marcação do canvas (`containerId: null`) tem `rect`
  em **unidades do canvas** (as mesmas do `placement` dos containers), inteiros, com `x` e `y` possivelmente
  **negativos** e sem limite de tamanho. O `coordinateSystem` do arquivo continua `image-pixels-exif-oriented`:
  a marcação do canvas é a **exceção**, e o recorte da imagem não se aplica a ela.
- **`floating`.** A marcação flutuante tem sempre `containerId: null` e `parentId: null`, e nenhuma outra marcação
  ou container tem uma flutuante como pai. Ela pode ficar por cima de uma tela sem virar filha dela.
- **`parentId` é derivado.** Nenhuma pessoa nem agente o escolhe: a app o recalcula ao fim de toda operação
  que mexe na geometria (desenhar, mover, redimensionar, mover ou redimensionar a imagem, excluir, aplicar uma
  proposta). Ler o arquivo, migrar e abrir **não** o recalculam.
- **Membros não são gravados.** Os membros de uma marcação são as marcações e os containers cujo `parentId` é o
  `id` dela; derive-os agrupando por `parentId`. Não existe lista de filhos no JSON.

**Regras de contenção** (todas sobre os retângulos gravados, em um espaço de cada vez)

1. **Dentro = totalmente contido.** Um retângulo está dentro de outro quando está inteiro nele (borda
   encostando conta). Sobreposição parcial não é relação nenhuma; não há tolerância no formato (a interação
   da app tem, ver `docs/ARCHITECTURE.md`).
2. **Pai da marcação** = a **menor** marcação do **mesmo espaço** (o mesmo container, ou o canvas) que a
   contém. Empate de área: a que vem **antes no array `markings`** é a de fora (o pai). Duas marcações iguais,
   portanto, formam uma cadeia pela ordem do array.
3. **Pai do container** = a **menor** marcação do **canvas** (não flutuante) que contém o retângulo dele no
   canvas (`placement` × tamanho × escala; como esse retângulo pode ser decimal, a comparação tem uma folga ínfima de arredondamento). Container dentro de container não existe.
4. **Troca de espaço.** Uma marcação de container cujo retângulo, no canvas, deixa de caber no container passa
   a marcação do canvas (e o contrário, ao caber inteira num container): o `containerId` muda e o `rect` é
   convertido de um espaço para o outro, sem mudar o tamanho que a pessoa vê. As descendentes dela vão junto.
5. **Flutuantes fora da árvore.** A flutuante nunca é pai nem filha, de marcação ou de container.
6. Uma marcação tem **um pai só**; grupos que se cruzam sem conter um ao outro não geram relação.

**Invariantes novas** (viram erros da abertura, ver "Regras de validade"; os códigos aparecem na lista de
problemas): `container-parent-missing` (pai de container inexistente), `container-parent-not-canvas` (o pai
do container não é uma marcação do canvas, ou é flutuante), `container-outside-parent` (o pai do container
não o contém), `floating-in-container` (flutuante com container ou pai) e `parent-floating` (pai flutuante).
As antigas continuam, agora por espaço: `parent-other-image` (pai em outro espaço) e `rect-outside-parent`.
O arquivo é validado só pela **consistência** do `parentId` declarado (existe, é do espaço certo e contém); a
escolha da menor marcação não é invariante, e é a app quem a refaz na próxima operação de geometria.

**Reparo** (`Reparar e abrir`): uma flutuante dentro de um container vai para o canvas com o `rect`
convertido; um pai de marcação flutuante, ou um pai de container inexistente, que não seja do canvas ou que
não o contenha, vira `null`. O que o reparo não resolve continua recusando o arquivo.

**Migração v12 → v13 e v13 da ME0.** A migração acrescenta `floating: false` a cada marcação e
`parentId: null` a cada container (além de apagar `inherit`). Ela **não assenta**: os `parentId` de
marcação ficam como estavam e os de container ficam `null` até a primeira operação de geometria. Um
`mapping.json` v13 gravado antes dos campos novos (sem `floating` nem `containers[].parentId`) abre sem
migração, com esses padrões. Todo projeto v12 tem marcações só em containers, então nenhuma marcação do canvas
nasce na migração.

**Ordem das chaves na gravação:** `parentId` vem depois de `placement` no container; `floating` vem depois de
`locked` na marcação; `arrows` vem entre `markings` e `annotations`.

**De onde vem o `floating`: a biblioteca de notas.** A marcação flutuante nasce de um tipo de anotação com
`floating: true` (especialização `formatVersion` 7, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Tipo flutuante"):
ao adicionar uma instância do tipo, a app grava a marcação com `containerId: null`, `parentId: null` e
`floating: true`, no canvas. A app traz uma biblioteca assim embutida, a de **notas** (`libraries/notas/`, id
`notas`: camada "Notas", tipo `nota` com os campos `titulo` e `texto`), e a **aplica por padrão**:

- projeto **novo** (pasta ou neste dispositivo) nasce com ela, com a cópia em `specs/notas/` e a entrada em
  `specializations[]`;
- projeto aberto de um schema **anterior ao 13** ganha a biblioteca ao abrir, em memória e sem entrada de
  desfazer; `specs/notas/` é gravada junto com o backup da migração, na primeira gravação;
- projeto **já v13** sem ela (removida pela pessoa, ou criado sem) fica como está.

Ela se remove como qualquer especialização (**Especializações › Remover**, apagando ou convertendo as notas) e
não volta ao reabrir o projeto. Quem lê o arquivo não precisa saber disso: a nota é uma anotação tipada
(`specId` `notas`, `typeId` `nota`) numa marcação com `floating: true`.

## Campos da v13 (setas)

A v13 traz a **seta**: uma marcação que **aponta**. Em vez de cobrir uma área, liga duas marcações e descreve a
relação entre elas (um deep link, um evento disparado). O traço é do mundo visual; a relação e os dados dela são
da marcação, então a seta **pode ter anotações por camada**, como qualquer marcação, e pode existir sem nenhuma.
Ela fica numa coleção própria, `arrows`, entre `markings` e `annotations`.

```json
{
  "id": "5d1c…",
  "from": "3f2a…",
  "to": "9b7e…",
  "fromSide": null,
  "toSide": "left",
  "points": [{ "x": 480, "y": 120 }],
  "style": "curve",
  "name": "abre o perfil",
  "locked": false
}
```

| Campo      | Tipo                | Descrição                                                                                                                                                     |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | string              | Único **entre as marcações e as setas**: o `markingId` de uma anotação aponta para qualquer das duas.                                                         |
| `from`     | string              | Marcação de origem. Nunca outra seta nem um container (para apontar para uma tela, aponte para uma marcação dela).                                            |
| `to`       | string              | Marcação de destino, diferente de `from`.                                                                                                                     |
| `fromSide` | lado ou `null`      | `top`, `right`, `bottom` ou `left`: o lado da origem onde a seta se prende. `null` = automático (o lado voltado para o ponto seguinte).                       |
| `toSide`   | lado ou `null`      | O mesmo, no destino.                                                                                                                                          |
| `points`   | array de `{ x, y }` | Pontos de passagem, **só da pessoa** (nenhum agente nem proposta os escreve). `[]` = a rota padrão, de lado a lado. Espaço derivado das duas pontas (abaixo). |
| `style`    | string              | `straight` (reta), `curve` (curva, o padrão) ou `elbow` (canto). Reta e curva usam os mesmos pontos; a curva é só a suavização do desenho.                    |
| `name`     | string ou `null`    | Rótulo sobre a seta, opcional, como o nome de uma marcação.                                                                                                   |
| `locked`   | booleano            | Trancada: a rota, as pontas, os lados e o estilo não mudam. Selecionar, renomear e anotar seguem livres. A trava é **só da seta**: não vem das pontas.        |

Os campos `fromSide`, `toSide`, `points`, `style`, `name` e `locked` podem faltar no arquivo escrito à mão: entram com
`null`, `[]`, `curve`, `null` e `false`, e a próxima gravação os traz.

**O espaço dos `points` não é gravado: deriva das duas pontas.**

- As duas marcações do **mesmo container** (`containerId` igual e não nulo): os `points` estão em **pixels do container**.
  A rota acompanha o container movido ou redimensionado no canvas sem recálculo, e sobrevive à troca de imagem de
  mesma resolução (se a resolução muda, os pontos são reescalados junto com as marcações).
- Em **qualquer outro caso** (containers diferentes, uma ponta do canvas ou flutuante): os `points` estão em
  **unidades do canvas**.
- Se uma ponta **muda de espaço** (a marcação é solta fora do container, entra em outro, vira flutuante, ou a
  proposta aplicada a move), os `points` são **apagados** e a seta volta à rota padrão. Mover uma ponta dentro do
  espaço dela deixa a rota parada: só o primeiro e o último trecho esticam.

**Âncoras.** Cada ponta prende no **ponto médio** de um lado da marcação (`fromSide`/`toSide`); com o lado `null`, o
lado é o da caixa voltado para o ponto seguinte (o primeiro ponto de passagem, ou o centro da outra ponta; na chegada,
o último ponto de passagem ou o centro da origem), escolhido pelo eixo dominante do vetor do centro ao alvo (empate:
horizontal). A rota desenhada é âncora de saída, pontos de passagem e âncora de chegada, em unidades do canvas.

**Fora da árvore de pertencimento.** A seta não tem `rect`, container nem pai, não é pai nem filha, nenhum arrasto
a carrega e `get_marking_image` não a recorta. O assentar só mexe nela para apagar os `points` de uma ponta que
trocou de espaço.

**Cascata.** Apagar uma marcação apaga as setas presas a ela (como origem ou destino) e as anotações dessas setas;
apagar um container apaga as setas das marcações dele. A confirmação conta as setas, e as anotações delas entram na
contagem de anotações. A trava de uma seta não impede apagar a marcação a que ela está presa.

**Anotações na seta.** `annotations[].markingId` pode ser o id de uma seta; o vínculo entre anotações
(`parentAnnotationId`) continua dentro da mesma dona. O `appliesTo` do tipo na especialização (`marking`, `arrow` ou
ambos) diz onde cada tipo vale; ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md).

**Invariantes novas:** `arrow-endpoint-missing` (a origem ou o destino não é uma marcação existente), `arrow-self`
(origem igual ao destino) e o `duplicate-id` entre seta e marcação ou entre duas setas. A anotação de um id que não é
marcação nem seta continua sendo `missing-marking`. **Reparo:** a seta com ponta inexistente ou ligada a ela mesma é
removida, e as anotações dela saem na rodada seguinte; o id repetido não tem reparo mecânico (o arquivo é recusado).

**Migração v12 → v13.** A migração grava `arrows: []` e **nunca cria uma seta**. Um `mapping.json` v13 gravado antes
das setas (sem `arrows`) abre sem migração, com `[]`.

## Migração

Arquivos v1 são migrados ao abrir: toda imagem recebe `name: null` e toda anotação recebe
`inherit: false` e `parentAnnotationId: null`. Arquivos v2 recebem `markingColor: null` em cada imagem.
Arquivos v3 recebem `specializations: []`, `spec: null` em cada camada, `type: null` e
`values: null` em cada anotação e um `id` novo em cada par. Arquivos v4 recebem `locked: false` em cada
imagem e em cada marcação. Arquivos v5 recebem `revision: 0`. Arquivos v6 recebem `platformRepos: {}`.
Arquivos v7 recebem `source: null` em cada imagem e em cada marcação. Arquivos v8 perdem os valores dos
campos `codeRef`, pelo tipo declarado na cópia da especialização (ver "Campos da v9"). Arquivos v9
recebem `background: null` em cada imagem (ver "Campos da v10"). Arquivos v10 perdem o `urlTemplate` de
cada entrada de `platformRepos`, e a entrada que só o tinha sai (ver "Campos da v11"). Arquivos v11 trocam `images` por `containers` e `imageId` por `containerId` (ver "Campos da v12"). Arquivos v12 perdem `inherit` de cada anotação e ganham `floating: false` em cada marcação, `parentId: null` em cada container e `arrows: []` na raiz (ver "Campos da v13"). Ao salvar, o
arquivo passa a ser v13 (e, no modo pasta, o original vai antes para `backups/`, como em qualquer
migração).
Arquivos de versão mais nova abrem somente para leitura.
