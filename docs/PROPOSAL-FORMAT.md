# Formato da proposta de alteração (`formatVersion` 1)

Toda alteração feita por um agente chega como uma **proposta**: o usuário revisa as diferenças, aceita ou rejeita em qualquer nível e deixa notas; só o que foi aceito é aplicado ao `mapping.json`. Este documento descreve o arquivo da proposta e as regras da revisão. O formato do projeto está em [`FORMAT.md`](FORMAT.md).

A funcionalidade é genérica: o núcleo não sabe de onde vêm os dados. A validação (zod) e todas as regras ficam em `src/model/` (`proposal.ts`, `proposalChanges.ts`, `proposalReview.ts`, `proposalApply.ts`, `proposalCompare.ts`), como funções puras usadas pela app e pelo servidor MCP.

## Onde fica

```
meu-projeto/
├── mapping.json
├── images/
└── proposals/
    └── 8c1f…/                # id da proposta
        ├── proposal.json
        └── images/           # imagens novas ou trocadas, até serem aceitas
            └── checkout.webp
```

- Uma pasta por proposta, `proposals/<id>/`, com o `proposal.json`. O id só usa `[A-Za-z0-9._-]` e não começa com ponto (vira nome de pasta).
- Imagem nova ou trocada: a mudança traz o caminho definitivo (`images/checkout.webp`) e o arquivo espera em `proposals/<id>/` mais esse caminho (`proposals/<id>/images/checkout.webp`). Ao aplicar, ele é movido para o lugar definitivo.
- As propostas ficam na pasta do projeto, versionadas no git junto com o resto, e vão no zip exportado.

## Exemplo

```json
{
  "format": "mapping-proposal",
  "formatVersion": 1,
  "id": "8c1f2d9e",
  "title": "Checkout a partir do Figma",
  "description": "Telas da página Checkout do arquivo Loja v3.",
  "origin": "Figma: Loja v3 › Checkout",
  "author": "Claude Code",
  "createdAt": "2026-10-09T12:00:00.000Z",
  "baseRevision": 41,
  "supersedes": null,
  "status": "open",
  "revision": 0,
  "operations": [],
  "changes": [
    {
      "id": "c1",
      "kind": "update",
      "entity": "marking",
      "entityId": "3f2a",
      "imageId": "9b1c",
      "markingId": "3f2a",
      "field": "rect",
      "from": { "x": 10, "y": 20, "width": 300, "height": 80 },
      "to": { "x": 10, "y": 32, "width": 300, "height": 80 }
    }
  ],
  "decisions": { "c1": { "state": "rejected", "at": "2026-10-09T12:30:00.000Z" } },
  "notes": [
    {
      "id": "n1",
      "target": { "level": "change", "id": "c1" },
      "text": "A posição antiga estava certa.",
      "at": "2026-10-09T12:30:00.000Z"
    }
  ],
  "applied": {}
}
```

## Campos da raiz

Todos são obrigatórios (o "vazio" é `null`).

| Campo           | Tipo             | Descrição                                                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `format`        | string           | Sempre `"mapping-proposal"`.                                                                           |
| `formatVersion` | `1`              | Versão do formato.                                                                                     |
| `id`            | string           | Id da proposta (nome da pasta em `proposals/`).                                                        |
| `title`         | string           | Título (não vazio).                                                                                    |
| `description`   | string ou `null` | Descrição.                                                                                             |
| `origin`        | string ou `null` | De onde vieram os dados (texto livre).                                                                 |
| `author`        | string ou `null` | Quem enviou (ex: o nome do agente).                                                                    |
| `createdAt`     | string           | Data ISO 8601 (UTC).                                                                                   |
| `baseRevision`  | inteiro ≥ 0      | `revision` do `mapping.json` sobre o qual as mudanças foram calculadas.                                |
| `supersedes`    | string ou `null` | Id da proposta que esta substitui.                                                                     |
| `status`        | string           | `open`, `applied`, `superseded` ou `withdrawn` (ver "Estados").                                        |
| `revision`      | inteiro ≥ 0      | Contador de gravações do arquivo da proposta, com a mesma conferência do `mapping.json` (`FORMAT.md`). |
| `operations`    | array            | As operações enviadas pelo agente, só para referência. A revisão e a aplicação usam as `changes`.      |
| `changes`       | array            | As mudanças (abaixo).                                                                                  |
| `decisions`     | objeto           | Decisão de cada mudança, por id: `{ "state": "accepted" \| "rejected", "at" }`. Ausente = sem decisão. |
| `notes`         | array            | Notas da revisão: `{ id, target: { level, id }, text, at }`.                                           |
| `applied`       | objeto           | Mudanças já efetivadas no projeto, por id: `{ "at" }`. Só uma mudança aceita pode estar aqui.          |

## Mudanças

Quem envia a proposta aplica as operações a uma cópia do projeto (com as operações puras de `src/model/`) e compara o antes e o depois entidade por entidade, campo por campo (`computeChanges` / `buildProposal`). Cada mudança guarda o valor **antes** (`from`, no momento da proposta) e o **depois** (`to`).

| Campo       | Descrição                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | `c1`, `c2`… (único na proposta).                                                                                                |
| `kind`      | `create`, `update` ou `remove`.                                                                                                 |
| `entity`    | `specialization`, `platformRepo`, `layer`, `image`, `marking` ou `annotation`.                                                  |
| `entityId`  | Id da entidade; no repositório, o id da plataforma.                                                                             |
| `imageId`   | Imagem em que a mudança aparece na revisão (`null` no grupo Projeto: especializações, repositórios e camadas).                  |
| `markingId` | Item (marcação) em que a mudança aparece: a própria marcação ou a marcação da anotação (`null` nas imagens e no grupo Projeto). |
| `field`     | Campo alterado; `null` na criação, na remoção e na alteração de especialização ou repositório (que levam a entidade inteira).   |
| `from`      | Criação: `null`. Remoção: a entidade inteira. Alteração: o valor do campo antes.                                                |
| `to`        | Criação: a entidade inteira. Remoção: `null`. Alteração: o valor do campo depois.                                               |

- **Criação**: uma mudança com a entidade inteira, no formato do `mapping.json`. O id já é o **definitivo**: notas, dependências e propostas seguintes podem citá-lo.
- **Remoção**: uma mudança por entidade. A cascata do modelo (filhas e anotações de uma marcação, anotações vinculadas, marcações de uma imagem…) aparece como remoções separadas, ligadas por dependência.
- **Alteração**: uma mudança por campo:

| Entidade         | Campos (`field`)                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`          | `name`, `file` (a troca: `{ file, width, height }`), `placement`, `markingColor`, `locked`, `source`                                                                                     |
| `marking`        | `name`, `rect`, `parentId`, `imageId`, `locked`, `source`                                                                                                                                |
| `annotation`     | `name`, `inherit`, `parentAnnotationId`, `markingId`, `layerId`, `values.<key>` (um campo da tipada), `entries.<id>` (um par da livre: `{ key, value }` ou `null` = par ausente), `type` |
| `layer`          | `name`, `color`, `spec`, `position` (índice na lista)                                                                                                                                    |
| `specialization` | — (`field: null`; `from`/`to` = `{ id, version, file, spec }`, com o conteúdo da especialização em `spec`)                                                                               |
| `platformRepo`   | — (`field: null`; `from`/`to` = `{ urlTemplate, localPath }`)                                                                                                                            |

- `values.<key>` ausente vale `null`. Uma tabela (`table`) ou lista de `codeRef` muda inteira, numa mudança só.
- `type` é a **troca de tipo** de uma anotação (ex: tipada convertida em livre ao remover uma especialização): `{ type, values, entries }` mudam juntos, numa mudança só, sem `values.*` nem `entries.*` separados.
- `position` só aparece nas camadas que mudam de **ordem relativa** (criar ou remover outra camada não gera `position`). Numa camada criada pela própria proposta, `from` é `null`.
- Não viram mudança: a ordem dos pares e das marcações dentro da lista, `needsReview` (a revisão é a própria conferência; a criação leva o valor proposto) e `project.updatedAt`.
- Ordem das mudanças: grupo Projeto (especializações, repositórios, camadas), imagens, marcações e anotações; em cada coleção, a ordem do projeto proposto e, no fim, as removidas. Aplicar tudo acrescenta as entidades criadas na mesma ordem do projeto proposto.

## Revisão

### Níveis

**Proposta → Projeto / Imagem → Item → Mudança** (`reviewTree`). O grupo Projeto reúne especializações, repositórios e camadas; cada imagem reúne a própria imagem e os itens dela; um item é uma marcação com tudo que mudou nela (geometria, nome, trava, origem, anotações), e as marcações filhas com mudanças aparecem dentro dela (no ancestral mais próximo que também tem mudanças). A nota usa os mesmos níveis em `target.level` (`proposal`, `project`, `image`, `item`, `change`); `target.id` é `null` em `proposal` e `project`.

### Decisões

- Só a decisão de cada **mudança** é gravada (`decisions`). Decidir num nível (`decide`) vale para todas as mudanças abaixo dele; um nível menor pode contrariar o maior depois.
- Três estados por mudança: aceita, rejeitada ou sem decisão. Um nível mostra **parcial** quando as mudanças abaixo dele divergem, com as contagens (`summarizeDecisions`).
- Mudanças já aplicadas não mudam de decisão (rejeitar só antes de efetivar). Só uma proposta `open` recebe decisões.

### Dependências

Resolvidas sozinhas ao decidir; `decide` devolve quais mudanças mudaram junto (`cascaded`), para a revisão explicar ("3 anotações rejeitadas junto").

1. **Aceitar uma mudança dentro de um item criado aceita a criação dele** e a dos ancestrais criados na mesma proposta (e de tudo que ela cita e foi criado pela proposta: imagem, camada, dona, especialização, alvo de uma referência).
2. **Rejeitar a criação de um item rejeita o que depende dele**: anotações, filhas, vinculadas e referências (`ref`) que apontam para ele.
3. **Aceitar a remoção de um item aceita a remoção do que a cascata do modelo remove** (filhas, anotações, vinculadas…).
4. **Rejeitar a remoção de algo da cascata rejeita a remoção de quem a causa** (não dá para remover o pai e manter a filha).

Limpar a decisão de uma mudança tira a aceitação do que dependia dela.

### Conflitos

Uma mudança é **conflito** quando o projeto mudou depois da proposta: o `from` não bate com o valor atual (`changeStatus`, com o valor atual em `current`), a entidade a alterar sumiu, ou a entidade a criar já existe. Alterar algo criado pela própria proposta não é conflito. O conflito é recalculado contra o projeto atual a cada abertura, sem perder as decisões já tomadas. **Aceitar sobrescreve o valor atual; rejeitar mantém.**

### Item trancado

Mudanças de geometria (`rect` da marcação; `placement` e troca de arquivo de outro tamanho da imagem) ou remoção num item trancado (pela trava própria ou, na geometria, de um ancestral) trazem o aviso "item trancado" (`changeStatus(...).locked`). Aceitar é permitido (a revisão é uma decisão deliberada) e a trava continua ligada depois.

### Validação do conjunto aceito

"Aplicar aceitas" aplica as mudanças aceitas e ainda não aplicadas a uma cópia do projeto e valida o resultado (`validateAccepted`): as invariantes do modelo (`validateProject`), especializações citadas que não ficariam aplicadas (`missing-specialization`) e mudanças que não cabem no projeto atual (`entity-missing`: alteração de algo que sumiu; `entity-exists`: criação de um id que já existe; `field-mismatch`: ex. `values.*` numa anotação que virou livre). Só contam os problemas novos. Cada problema traz as mudanças aceitas envolvidas (`changeIds`: rejeitar uma delas resolve) e as sem decisão nas mesmas entidades (`related`: aceitar uma delas pode resolver, ex. a posição do pai que falta). Com algum problema, aplicar fica bloqueado.

### Aplicar aceitas

`applyAccepted(projeto, proposta, data)` efetiva só as aceitas ainda não aplicadas, numa única alteração do projeto (uma entrada de desfazer para quem chama), e devolve o projeto novo, a proposta com `applied` atualizado, as mudanças aplicadas e as imagens a mover de `proposals/<id>/` para o lugar definitivo. O que está sem decisão continua pendente na mesma proposta; uma nova aplicação depois efetiva o que for aceito em seguida. A aplicação não passa pelas operações do modelo (a trava não impede), mas o resultado passa pelas invariantes.

### Estados

| `status`     | Quando                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`       | Em revisão.                                                                                                                                  |
| `applied`    | Tudo decidido e as aceitas aplicadas (a última aplicação muda o estado sozinha).                                                             |
| `superseded` | Substituída por outra proposta (`supersedes`). Decisões e notas continuam guardadas; as aceitas ainda podem ser aplicadas, as pendentes não. |
| `withdrawn`  | Retirada pelo agente. Nada mais é aplicado.                                                                                                  |

`reviewProgress` conta as aceitas aguardando aplicação e diz se a revisão terminou (`complete`: nada sem decisão nem aceito sem aplicar), que é quando uma proposta deve ser substituída.

### Proposta substituída

Cada mudança da proposta antiga mostra se a nova traz a **mesma** coisa, **outra** coisa ou **não consta** nela (`compareProposals(antiga, nova)`): a comparação é pela entidade e pelo campo (e pelo valor `to`); a criação de imagem ou marcação com `source` também casa pela origem, mesmo recriada com outro id.

## Regras de validade

`parseProposal` / `parseProposalText` validam o arquivo e devolvem os erros com o caminho exato (ex: `changes[3].to.rect.width: …`, `decisions.c9: mudança inexistente`):

- raiz com todos os campos; `format`, `formatVersion`, `status` e datas ISO 8601 válidos; `title` não vazio; `supersedes` diferente do próprio `id`;
- ids de mudança e de nota únicos;
- cada mudança coerente com o `kind` (criação com `from: null`, remoção com `to: null`, alteração com `field` da entidade), com os valores no formato do `mapping.json` (a especialização é validada como em `SPEC-FORMAT.md`), o id da entidade inteira igual a `entityId`, `imageId`/`markingId` preenchidos fora do grupo Projeto;
- `decisions` e `applied` só citam mudanças existentes, e `applied` só mudanças aceitas;
- `target` das notas com `id` `null` em `proposal` e `project`, e citando uma mudança existente em `change`.

## API em `src/model/`

- Formato: `PROPOSAL_FORMAT`, `PROPOSAL_FORMAT_VERSION`, `PROPOSALS_DIR`, `proposalDir`, `proposalFilePath`, `proposalImagePath`, `parseProposal`, `parseProposalText`, `serializeProposal`; tipos `Proposal`, `Change`, `ChangeKind`, `ChangeEntity`, `Decision`, `DecisionState`, `ProposalNote`, `ReviewTarget`, `ReviewLevel`, `ProposalStatus`.
- Mudanças: `computeChanges(antes, depois)`, `buildProposal(antes, depois, { title, … })`.
- Revisão: `proposalIndex` (dependências), `requiredChanges`, `dependentChanges`, `reviewTree`, `summarizeDecisions`, `reviewProgress`, `decide`, `changeStatus`, `changeStatuses`, `addNote`, `editNote`, `removeNote`, `notesOf`, `withdrawProposal`, `supersedeProposal`.
- Aplicação: `acceptedPending`, `validateAccepted`, `applyAccepted`, `previewProject` (a visão "como ficaria"), `patchProject`.
- Comparação: `compareProposals`.
- Leitura para a interface (`proposalView.ts`): `changeType`, `dominantChangeType`, `reviewKey`, `changeTarget`, `changeLayerId`, `changeImageFile`, `filterChanges` (`ReviewFilters`, `NO_FILTERS`), `undecidedChanges`, `acceptedPendingIds`, `leftBehind`, `stepChange`.
- Origens: `findBySource`, `setImageSource`, `setMarkingSource` (`FORMAT.md`, v8) e `findTypesBySource` (`SPEC-FORMAT.md`, `formatVersion` 3).

## Na app

Como a app guarda e confere as propostas (armazenamento, `revision`, desfazer da aplicação, retomada da revisão) está em [`ARCHITECTURE.md`](ARCHITECTURE.md), no item "Propostas de alteração".
