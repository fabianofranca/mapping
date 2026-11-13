# Formato da proposta de alteração (`formatVersion` 8)

Toda alteração feita por um agente chega como uma **proposta**: o usuário revisa as diferenças, aceita ou rejeita em qualquer nível e deixa notas; só o que foi aceito é aplicado ao `mapping.json`. Este documento descreve o arquivo da proposta e as regras da revisão. O formato do projeto está em [`FORMAT.md`](FORMAT.md).

A funcionalidade é genérica: o núcleo não sabe de onde vêm os dados. A validação (zod) e todas as regras ficam em `src/model/` (`proposal.ts`, `proposalChanges.ts`, `proposalReview.ts`, `proposalApply.ts`, `proposalCompare.ts`, `proposalRevise.ts`), como funções puras usadas pela app e pelo servidor MCP.

## Onde fica

```
meu-projeto/
├── mapping.json
├── images/
└── proposals/
    └── 8c1f…/                # id da proposta
        ├── proposal.json
        ├── images/           # imagens novas ou trocadas, até serem aceitas
        │   └── checkout.webp
        └── specs/            # pacote de biblioteca novo ou atualizado (etapa Biblioteca)
            └── material3/
                ├── material3.spec.json
                ├── components/
                └── …
```

- Uma pasta por proposta, `proposals/<id>/`, com o `proposal.json`. O id só usa `[A-Za-z0-9._-]` e não começa com ponto (vira nome de pasta).
- Container sem arquivo: a criação traz o container inteiro com `file: null` e `background`, sem arquivo para mover; `background` e `size` só existem como campos de `update` quando o container é sem arquivo nos dois lados (com arquivo, o tamanho vem da troca de arquivo, campo `file`).
- Imagem nova ou trocada (container com arquivo): a mudança traz o caminho definitivo (`images/checkout.webp`) e o arquivo espera em `proposals/<id>/` mais esse caminho (`proposals/<id>/images/checkout.webp`). Ao aplicar, ele é movido para o lugar definitivo.
- Pacote de biblioteca (especialização `formatVersion` 4, uma pasta com `components/`, `docs/`, `examples/` e `fonts/`): a mudança é a da especialização de sempre (`entity: "specialization"`, `to = { id, version, file, spec }`), com `to.file` dentro de uma pasta (`specs/material3/material3.spec.json`). Os arquivos do pacote esperam em `proposals/<id>/` mais o caminho definitivo (`proposals/<id>/specs/material3/components/botao.json`). A fonte da verdade da especialização é o `to.spec`: o arquivo dela na pasta da proposta pode faltar e, se vier, é ignorado. Ao aplicar, os arquivos são **copiados** (não movidos) para `specs/<pasta>/`, que a sessão regrava inteira junto com o `mapping.json`; ficam na proposta até ela ser apagada, então desfazer e refazer não mexem neles.
- As propostas ficam na pasta do projeto, versionadas no git junto com o resto, e vão no zip exportado, com os arquivos que esperam a aceitação (imagens em `proposals/<id>/images/` e pacotes em `proposals/<id>/specs/<pasta>/`, binários inclusive; os de mudanças já aplicadas não vão). Ao ler o zip, só entram caminhos desses dois tipos, com id válido e sem `..`.

## Quem grava o quê

- **Servidor MCP** (`propose_changes`, `withdraw_proposal`, `revise_proposal`): cria a pasta e o `proposal.json` (`status: open`, `revision: 0`, sem decisões nem notas, `formatVersion` 4) e, depois, muda o `status` (`superseded` quando uma proposta **aberta** é substituída, `withdrawn` ao ser retirada; uma `applied` substituída não muda) e grava a **revisão do agente** (`revise_proposal`: `changes`, as `decisions` das mudanças trocadas e retiradas, as `notes` das retiradas, `revisions` e `formatVersion` 5; veja "Revisão pelo agente"). Sempre relê o arquivo antes de gravar e grava com `revision + 1`. Nunca grava o `mapping.json`. No campo `operations` o conteúdo `base64` das imagens é trocado por um marcador (a imagem já está em `proposals/<id>/images/`).
- **App**: grava `decisions`, `notes`, `applied` e o `status` à medida que o usuário revisa e aplica, mantendo a `formatVersion` do arquivo (e o `revisions`, se houver); é a única que grava o `mapping.json`.

## Versões do formato

- **`formatVersion` 8** (direção de leitura, schema v20): é a versão que a **criação** e a **revisão do agente** gravam **só quando a proposta usa a direção** (`PROPOSAL_DIRECTION_FORMAT_VERSION` é 8; `proposalUsesDirection(changes)` decide; uma proposta que já está na 8 continua na 8, e a 8 também vale para quem usa a densidade ou o modo do desenho). Traz o campo **`direction`** do container (`update`, valor `"ltr"`, `"rtl"` ou `null`, `null` = volta a seguir o projeto), o `direction` dentro do valor de um container criado ou removido (só quando fixa) e o `direction` (`"ltr"` ou `"rtl"`, só quando fixada) dentro do `from`/`to` da entidade **`project`**, que passa a ser `{ drawingMode: string | null, direction?: "ltr" | "rtl" }`: a entidade é substituída inteira ao aplicar, então a ausência de `direction` no `to` tira a direção do projeto. A forma do arquivo é a da 7, com `revisions` **opcional**. **Por que uma versão nova:** uma app ou um MCP anteriores **descartariam em silêncio** o `direction` dentro do valor de um container criado e dentro da entidade `project` (o zod ignora a chave desconhecida) e aplicariam a proposta sem a direção; com a 8 eles **recusam o arquivo** (`formatVersion` deve ser 1 a 7). Quem a grava tem de lê-la; as versões 1 a 7 continuam lidas e aplicadas como sempre.
- **`formatVersion` 7** (densidade do container, schema v19): é a versão que a **criação** e a **revisão do agente** gravam **só quando a proposta usa a densidade** (`PROPOSAL_DENSITY_FORMAT_VERSION` é 7; `usesDensity(changes)` decide; a 7 também vale para quem usa o modo do desenho). Traz o campo **`density`** do container (`update`, valor número de 0,5 a 8 ou `null`, `null` = volta a 1) e o `density` dentro do valor de um container criado ou removido (só quando declarada). A forma do arquivo é a da 6, com `revisions` **opcional**. **Por que uma versão nova:** uma app ou um MCP anteriores recusariam o campo `density`, mas **descartariam em silêncio** o `density` dentro do valor de um container criado (o zod ignora a chave desconhecida); com a 7 eles **recusam o arquivo** (`formatVersion` deve ser 1 a 6). Quem a grava tem de lê-la; as versões 1 a 6 continuam lidas e aplicadas como sempre.
- **`formatVersion` 6** (modo do desenho, schema v18): é a versão que a **criação** e a **revisão do agente** gravam **só quando a proposta usa o modo do desenho**; sem ele, a criação continua na 4 e a revisão, na 5 (`PROPOSAL_FORMAT_VERSION` continua 4, e `PROPOSAL_DRAWING_MODE_FORMAT_VERSION` é 6; `usesDrawingMode(changes)` decide). Traz: a entidade **`project`** (`entityId` `"project"`, só `update`, `field` `null`, `from`/`to` = `{ drawingMode: string | null }`; é do grupo Projeto, `imageId` e `markingId` nulos), o campo **`drawingMode`** do container (`update`, valor `string | null`, `null` = volta a seguir o projeto) e o `drawingMode` dentro do valor de um container criado ou removido (só quando fixa). A forma do arquivo é a da 5, com `revisions` **opcional** (a revisão do agente numa proposta 6 continua 6 e grava o histórico). **Por que uma versão nova:** uma app ou um MCP anteriores recusariam a entidade `project` e o campo `drawingMode` (erro de leitura, nunca aplicação parcial), mas **descartariam em silêncio** o `drawingMode` dentro do valor de um container criado (o zod ignora a chave desconhecida) e aplicariam a proposta sem o modo; com a 6 eles **recusam o arquivo** (`formatVersion` deve ser 1 a 5). A 6 tem de ser lida por quem a grava; as versões 1 a 5 continuam lidas e aplicadas como sempre.
- **`formatVersion` 5** (revisão pelo agente): é a versão que a **revisão do agente** (`revise_proposal`) grava. A forma do arquivo é a da 4, com um campo a mais na raiz, **`revisions`**, o histórico das revisões do agente, da mais antiga para a mais nova (veja "Histórico das revisões"). **Só a revisão do agente grava a 5:** a criação (`propose_changes`) continua gravando a 4; a app, ao regravar decisões e notas, mantém a versão do arquivo; uma proposta 4 vira 5 na primeira revisão. **Por que uma versão nova:** uma app antiga em cache leria a proposta revisada sem a marca e descartaria o `revisions` ao regravar; pior, revisando ao mesmo tempo que o agente, refaria a decisão da pessoa sobre um conteúdo que ela não viu. Com a 5, a app antiga **recusa o arquivo** (`formatVersion` deve ser 1, 2, 3 ou 4) e nunca o sobrescreve (a regra de hoje para arquivo que mudou e ficou ilegível). Um servidor MCP antigo lista a proposta em `broken`. As versões 1 a 4 continuam lidas e aplicadas como sempre.
- **`formatVersion` 4** (posição da marcação criada): é a versão que a **criação** (`propose_changes`) grava. A forma do arquivo é a da 3, com um campo a mais, **`insertBefore`**, só na mudança de criação de marcação (veja "Posição da marcação criada"). **Por que uma versão nova, e não um campo opcional na 3:** uma app antiga em cache leria a 3, descartaria o campo ao regravar as decisões e aplicaria a proposta com a hierarquia invertida, sem aviso; com a 4 ela **recusa o arquivo** (`formatVersion` deve ser 1, 2 ou 3). A 4 tem de ser lida pela app e pelo servidor MCP na mesma versão que a grava. As versões 1 a 3 continuam lidas e aplicadas como sempre: um `insertBefore` que apareça nelas é ignorado, e quem as regrava (a app, ao registrar as decisões) mantém a versão do arquivo.
- **Schema v14 (papéis e documentos externos) não sobe a versão.** Continua `formatVersion` 4. O campo `parentRole` da anotação (na mudança de campo e dentro da anotação inteira de criação e remoção) e a entidade `docRepo` só existem em projeto v14, e uma app ou um MCP anteriores abrem o projeto v14 **só para leitura** (`readOnly`; a app bloqueia "Aplicar aceitas" (`read-only`) e o MCP recusa o lote), então nenhum leitor aplica a proposta sem entender o projeto v14. A proposta mora na pasta do projeto e é lida junto com o `mapping.json` (`loadProposals` na app, `proposalStore` no MCP); uma proposta com `docRepo` ou `parentRole` num leitor antigo dá erro de leitura da proposta, nunca uma aplicação parcial. Uma proposta escrita antes da v14 (a criação de anotação sem `parentRole`) é lida como sem papel (`parentRole: null`). Um `parentRole` vazio na mudança de campo é erro de leitura.
- **`formatVersion` 3** (sem herança e com o pertencimento por geometria, schema v13): foi a versão gravada até a posição da marcação criada. A forma do arquivo é a da 2, com: `inherit` fora dos campos de `annotation` (na mudança e nas anotações inteiras de criação e remoção); a marcação do canvas (`containerId` nulo) e o nível **`canvas`** da revisão; a mudança composta **`space`**; **`floating`** comparado; **`parentId` fora da comparação** (veja "Marcação do canvas e pertencimento"); e a entidade **`arrow`** (a seta), só com criação e remoção (veja "Seta").
- **Proposta antiga com `parentId`.** Uma proposta de `formatVersion` 1 ou 2 com mudança do campo `parentId` de marcação é lida com essa mudança **descartada**, com a decisão, a aplicação e a nota presa a ela (a nota passa ao nível da proposta), e a leitura devolve um aviso (`warnings`). O pai agora é sempre recalculado pela geometria ao aplicar. As criações e remoções antigas de marcação sem `floating` são lidas como `floating: false`. Mudanças separadas de `containerId` e de `rect` de uma mesma marcação (o jeito de antes de trocar de espaço) **continuam aplicando**, cada uma por si e como estão; o assentar que vem logo depois refaz o espaço e o pai pela geometria (se só uma das duas for aceita, o resultado é o que a geometria dá, não necessariamente o da proposta).
- **Proposta antiga com `inherit`.** Uma proposta de `formatVersion` 1 ou 2 com mudança do campo `inherit` é lida com essa mudança **descartada**: a decisão e a aplicação dela vão junto, e uma nota presa a ela passa ao nível da proposta. O campo `inherit` das anotações inteiras de criação e remoção também é removido. A leitura devolve um aviso (`warnings`; no MCP, `proposal_review` mostra `warnings` com `code: 'proposal-field-ignored'`; na app, o aviso vai ao Diagnóstico).
- **`formatVersion` 2** (container): era a versão gravada até o schema v12. A forma do arquivo é a mesma da 1; muda o vocabulário das `operations` enviadas pelo agente (guardadas só para referência). As do lote do servidor MCP 0.8.0 são `add_container` (com arquivo: `file` ou `base64`; ou só com fundo: `width`, `height`, `background`; mais `name?`, `source?`, `center?`, `as?`), `update_container`, `replace_container` e `delete_container` (argumento `container`), e `create_marking` com `container`.
- **`formatVersion` 1**: continua **lida** e aplicada. Uma proposta antiga com `add_image`, `add_blank_image`, `update_image`, `replace_image` ou `delete_image` nas `operations` vale como está (as `operations` são só referência; a revisão e a aplicação usam as `changes`).
- **As operações antigas são aceitas com aviso.** No lote (`plan_changes`/`propose_changes`) `add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image` e o argumento `image` de `create_marking` têm o mesmo efeito das novas, mas o resultado traz em `warnings` um aviso `deprecated-op` ("add_blank_image é antiga: use add_container", e assim por diante). As propostas novas saem com `formatVersion` 4 e nascem das operações novas. A aceitação das antigas dura uma versão do servidor.
- **Os nomes gravados não mudaram com o schema v12.** O `proposal.json` continua chamando o container de `image` nos nomes que já existiam: `entity: "image"`, o cabeçalho `imageId` da mudança (o container em que ela aparece), o nível `image` do `reviewTree` e dos `target` das notas, e os campos `file`/`background`/`size`/`placement`/`markingColor` do container. A única troca está nos valores da **marcação**: no `mapping.json` v12 ela aponta para o container por `containerId` (era `imageId`), e então a criação e a remoção de marcação levam `containerId` no valor inteiro, e a alteração do campo é `field: "containerId"`. A leitura aceita as propostas gravadas antes (formato 1 ou 2) com `imageId` dentro do valor da marcação e as passa a `containerId` sozinha.

## Exemplo

```json
{
  "format": "mapping-proposal",
  "formatVersion": 4,
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

Todos são obrigatórios (o "vazio" é `null`), **menos `revisions`**, que só existe na `formatVersion` 5 (obrigatório) e 6 (opcional).

| Campo           | Tipo             | Descrição                                                                                                                                                             |
| --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | string           | Sempre `"mapping-proposal"`.                                                                                                                                          |
| `formatVersion` | `1` a `6`        | Versão do formato. A 4 é a da criação, a 5, a da revisão do agente e a 6, a de quem usa o modo do desenho; as anteriores continuam lidas (veja "Versões do formato"). |
| `id`            | string           | Id da proposta (nome da pasta em `proposals/`).                                                                                                                       |
| `title`         | string           | Título (não vazio).                                                                                                                                                   |
| `description`   | string ou `null` | Descrição.                                                                                                                                                            |
| `origin`        | string ou `null` | De onde vieram os dados (texto livre).                                                                                                                                |
| `author`        | string ou `null` | Quem enviou (ex: o nome do agente).                                                                                                                                   |
| `createdAt`     | string           | Data ISO 8601 (UTC).                                                                                                                                                  |
| `baseRevision`  | inteiro ≥ 0      | `revision` do `mapping.json` sobre o qual as mudanças foram calculadas.                                                                                               |
| `supersedes`    | string ou `null` | Id da proposta que esta substitui.                                                                                                                                    |
| `status`        | string           | `open`, `applied`, `superseded` ou `withdrawn` (ver "Estados").                                                                                                       |
| `revision`      | inteiro ≥ 0      | Contador de gravações do arquivo da proposta, com a mesma conferência do `mapping.json` (`FORMAT.md`).                                                                |
| `operations`    | array            | As operações enviadas pelo agente, só para referência. A revisão e a aplicação usam as `changes`.                                                                     |
| `changes`       | array            | As mudanças (abaixo).                                                                                                                                                 |
| `decisions`     | objeto           | Decisão de cada mudança, por id: `{ "state": "accepted" \| "rejected", "at" }`. Ausente = sem decisão.                                                                |
| `notes`         | array            | Notas da revisão: `{ id, target: { level, id }, text, at }`.                                                                                                          |
| `applied`       | objeto           | Mudanças já efetivadas no projeto, por id: `{ "at" }`. Só uma mudança aceita pode estar aqui.                                                                         |
| `revisions`     | array            | O histórico das revisões do agente (abaixo). **Só na `formatVersion` 5**, onde é obrigatório; antes dela não existe.                                                  |

### Histórico das revisões (`revisions`)

Na `formatVersion` 5, cada revisão do agente acrescenta uma entrada ao fim de `revisions` (a mais antiga primeiro). O histórico é só registro: a revisão e a aplicação usam as `changes`, e o `baseRevision` da raiz continua sendo o da criação.

```json
"revisions": [
  {
    "at": "2026-11-07T10:00:00.000Z",
    "baseRevision": 43,
    "operations": [],
    "changed": { "c3": { "to": "Título da tela", "state": "rejected" } },
    "added": ["c9"],
    "dropped": [
      { "change": { "id": "c4", "kind": "update", "…": "…" }, "state": null, "notes": ["n2"] }
    ]
  }
]
```

| Campo          | Descrição                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`           | Data ISO 8601 (UTC) da revisão.                                                                                                                                        |
| `baseRevision` | `revision` do `mapping.json` sobre o qual a revisão foi calculada.                                                                                                     |
| `operations`   | As operações do lote da revisão, só para referência (o `base64` das imagens é trocado pelo marcador, como na raiz).                                                    |
| `changed`      | Por id de mudança trocada: `{ to, state }`, o `to` e a decisão **de antes** desta revisão. `state` é `"rejected"` ou `null` (sem decisão); uma aceita nunca é trocada. |
| `added`        | Os ids das mudanças novas.                                                                                                                                             |
| `dropped`      | As mudanças retiradas: `{ change, state, notes }`, a mudança inteira como era, a decisão de antes e os ids das notas dela que passaram ao nível da proposta.           |

## Mudanças

Quem envia a proposta aplica as operações a uma cópia do projeto (com as operações puras de `src/model/`) e compara o antes e o depois entidade por entidade, campo por campo (`computeChanges` / `buildProposal`). Cada mudança guarda o valor **antes** (`from`, no momento da proposta) e o **depois** (`to`).

| Campo          | Descrição                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `c1`, `c2`… (único na proposta).                                                                                                                                                                                                                                                                                        |
| `kind`         | `create`, `update` ou `remove`.                                                                                                                                                                                                                                                                                         |
| `entity`       | `specialization`, `platformRepo`, `docRepo`, `project` (o modo do desenho, `formatVersion` 6), `layer`, `image` (o **container**: o nome ficou no formato), `marking`, `arrow` (a seta) ou `annotation`.                                                                                                                |
| `entityId`     | Id da entidade; no repositório de código, o id da plataforma; no de documentos, o id do `docRepos` da especialização.                                                                                                                                                                                                   |
| `imageId`      | Container em que a mudança aparece na revisão. `null` com `markingId` nulo: o grupo Projeto (especializações, repositórios e camadas); `null` com `markingId`: uma marcação do canvas (e as anotações dela), o grupo **Canvas**.                                                                                        |
| `markingId`    | Item (marcação ou seta) em que a mudança aparece: a própria marcação, a própria seta, ou a dona da anotação (`null` nos containers e no grupo Projeto).                                                                                                                                                                 |
| `field`        | Campo alterado; `null` na criação, na remoção e na alteração de especialização ou repositório (que levam a entidade inteira).                                                                                                                                                                                           |
| `from`         | Criação: `null`. Remoção: a entidade inteira. Alteração: o valor do campo antes.                                                                                                                                                                                                                                        |
| `to`           | Criação: a entidade inteira. Remoção: `null`. Alteração: o valor do campo depois.                                                                                                                                                                                                                                       |
| `insertBefore` | Só na **criação de marcação** (`formatVersion` 4), opcional: o id da marcação da base antes da qual a criada entra no array `markings`, ou `null` (veja "Posição da marcação criada"). Em qualquer outra mudança, ou com valor que não é id nem `null`, a leitura dá erro com o caminho (`changes[3].insertBefore: …`). |

- **Criação**: uma mudança com a entidade inteira, no formato do `mapping.json`. O id já é o **definitivo**: notas, dependências e propostas seguintes podem citá-lo.
- **Remoção**: uma mudança por entidade. A cascata do modelo (filhas e anotações de uma marcação, anotações vinculadas, marcações de um container…) aparece como remoções separadas, ligadas por dependência.
- **Alteração**: uma mudança por campo:

| Entidade            | Campos (`field`)                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image` (container) | `name`, `file` (a troca: `{ file, width, height }`), `background` (cor `#RRGGBB`) e `size` (`{ width, height }`) só no container sem arquivo, `placement`, `markingColor`, `locked`, `source`                                       |
| `marking`           | `name`, `space` (`{ containerId, rect }`, a troca de espaço), `rect` (sem troca de espaço), `floating`, `locked`, `source`, `position` (índice entre as irmãs); `containerId` sozinho só em proposta antiga                         |
| `annotation`        | `name`, `parentAnnotationId`, `parentRole` (v14: o id do papel na dona, ou `null`), `markingId`, `layerId`, `values.<key>` (um campo da tipada), `entries.<id>` (um par da livre: `{ key, value }` ou `null` = par ausente), `type` |
| `layer`             | `name`, `color`, `spec`, `position` (índice na lista)                                                                                                                                                                               |
| `specialization`    | — (`field: null`; `from`/`to` = `{ id, version, file, spec }`, com o conteúdo da especialização em `spec`)                                                                                                                          |
| `docRepo`           | — (`field: null`; `from`/`to` = `{ localPath }`, o clone local do repositório de documentos, v14; como o `platformRepo`, só em projeto v14)                                                                                         |
| `platformRepo`      | — (`field: null`; `from`/`to` = `{ localPath }`, a sobreposição local do clone; a leitura ignora o `urlTemplate` de propostas antigas)                                                                                              |

- `values.<key>` ausente vale `null`. Uma tabela (`table`) muda inteira, numa mudança só.
- `type` é a **troca de tipo** de uma anotação (ex: tipada convertida em livre ao remover uma especialização): `{ type, values, entries }` mudam juntos, numa mudança só, sem `values.*` nem `entries.*` separados.
- `position` só aparece nas camadas que mudam de **ordem relativa** (criar ou remover outra camada não gera `position`). Numa camada criada pela própria proposta, `from` é `null`.
- `position` da marcação é o índice entre as **irmãs** (mesmo espaço, o container ou o canvas, e mesmo `parentId`; 0 = a primeira, desenhada por baixo) e também só aparece quando a ordem relativa das irmãs muda: criar ou remover outra marcação não gera `position`, e a marcação criada que já nasce na ordem do projeto proposto (no lugar que o `insertBefore` dá, ou no fim) também não. Se a criada precisa ficar antes de alguma irmã, ela leva `position` com `from` `null`. Aplicar reordena como a ação de reordenar da app (índice preso ao intervalo válido) e há conflito se o `from` não bate com a posição atual. Os `position` de um **mesmo grupo de irmãs** são aplicados **juntos**: as reposicionadas saem do grupo e voltam em ordem crescente de `to`, cada uma no índice `to` entre as irmãs (preso ao intervalo); uma `position` sozinha (aceitação parcial) dá o mesmo de uma reordenação isolada.
- Não viram mudança: o `parentId` (derivado, veja "Marcação do canvas e pertencimento"), a ordem dos pares dentro da lista, `needsReview` (a revisão é a própria conferência; a criação leva o valor proposto) e `project.updatedAt`.
- Ordem das mudanças: grupo Projeto (especializações, repositórios de código e de documentos, camadas), containers, marcações, setas e anotações; em cada coleção, a ordem do projeto proposto e, no fim, as removidas. Aplicar tudo acrescenta as entidades criadas na mesma ordem do projeto proposto (a marcação, no lugar do `insertBefore`).

### Posição da marcação criada

O pai de uma marcação sai da geometria, e o empate (retângulos iguais, ou candidatas de mesma área a pai) é decidido pela relação atual e, no empate novo, pela ordem do array `markings` (`settleHierarchy`). Por isso a criação carrega o lugar do array em que a marcação entra: **`insertBefore`** é o id de uma marcação **da base** (que, por estar no proposto, a proposta não remove) e a criada entra antes dela. Ausente ou `null`, a criada vai para o fim. O que a âncora **garante**: no array que o aplicador monta (a ordem da base, com as criadas nas âncoras), os empates do assentar saem como no projeto proposto, e as criadas com a mesma âncora entram na ordem do proposto.

- **Por que a âncora é uma marcação da base:** cada mudança é decidida à parte, e uma criada pode ser rejeitada; a marcação da base só some se a remoção dela for aceita, e aí a criada vai para o fim. Uma âncora que não existe na base (ou na lista, ao aplicar) não é erro de leitura: a criada vai para o fim.
- **Aplicação** (`patchProject`): a criada entra antes da âncora, se ela estiver na lista depois das remoções, e no fim se não estiver; várias criadas com a mesma âncora ficam na ordem das mudanças, que é a do projeto proposto. Tudo isso acontece **antes** do assentar e dos `position`, então o desempate é o do projeto proposto.
- **Cálculo** (`computeChanges`): escolhe a âncora de cada criada e emite o `position` sobre o mesmo array que o aplicador monta, já assentado, então só sai o `position` que falta: o envolver (`wrap_items`) não traz `position` para a criada nem para a envolvida, e duas criadas antes da mesma âncora não trazem um `position` a mais.
- **Garantia:** aplicar todas as mudanças dá os **mesmos `parentId`** (marcações e containers) e a **mesma ordem entre irmãs** do projeto proposto, com ou sem reordenação (`position` vindo de `move_marking` ou `reorderMarking`) no lote. A ordem global do array `markings` fora das irmãs (o lugar de uma filha entre marcações de outros grupos) pode diferir.
- **Limite conhecido (#625):** se, no mesmo lote, um empate entre marcações que já existiam na base foi decidido por um passo intermediário que a proposta não registra (uma marcação redimensionada e depois outra que chega à mesma área, ou um `move_marking` antes de duas marcações ficarem com o mesmo retângulo), o aplicado segue a relação da base, ou a ordem da base, e pode ter outro pai; é raro (cerca de 1 lote em 1.000 num fuzz de lotes aleatórios), a visão Proposto já mostra o que vai ser aplicado e, nesse caso, confira com `get_marking` depois de aplicar.

### Marcação do canvas e pertencimento

A marcação com `containerId: null` é a **marcação do canvas**: o `rect` dela está em unidades do canvas (inteiras, sem o limite `≥ 0`) e a criação e a remoção levam a marcação inteira como sempre (`containerId: null`, `floating`).

- **`space`: a troca de espaço é uma mudança só.** Quando a marcação muda de container, ou entra ou sai do canvas, a mudança é `field: "space"` com `from` e `to` iguais a `{ containerId, rect }` (`containerId` nulo = o canvas; o `rect` está nas unidades do espaço dele). O revisor aceita ou rejeita o espaço inteiro, nunca "metade" (o container sem o `rect` ou o contrário), como a troca de arquivo do container (`file` = `{ file, width, height }`). Com a troca, não há mudança `rect` separada; sem a troca, o `rect` é o campo `rect` de sempre. As marcações descendentes que vão junto trazem cada uma a própria `space`.
- **`floating`** (booleano) é comparado como qualquer campo da marcação. Uma marcação flutuante vive sempre no canvas e fica fora do pertencimento; ligar a flutuação costuma vir junto de uma `space`.
- **`parentId` não é comparado**, nem o `parentId` do container: o pai vem sempre do assentar (`settleHierarchy`), nunca da proposta. Aceitar uma geometria e rejeitar "o pai" deixou de existir. O `parentId` continua dentro do valor inteiro de uma criação ou remoção de marcação, só como informação (e para a revisão aninhar os itens); ao aplicar, o assentar o recalcula.
- **Assentar depois de aplicar.** O projeto resultante de "Aplicar aceitas" (e o "como ficaria" da visão Proposto) passa por `settleHierarchy` logo depois de aplicar as mudanças e antes de reordenar as irmãs (`position`) e de conferir as invariantes: cada marcação não flutuante vai para o espaço que a geometria dá (container que a contém inteira, senão o canvas, com o `rect` convertido), e o pai de toda marcação e de todo container é recalculado. Daí o resultado poder diferir do proposto quando só parte das mudanças é aceita, sem nunca ficar inconsistente.
- **`parent` nas operações.** As operações do lote que citam `parent` (por exemplo `create_marking`) aceitam o campo e o **ignoram com aviso**: o pai é derivado. `create_marking` sem `container` cria a marcação do canvas.

### Seta

A seta (`arrow`, schema v13: ver [`FORMAT.md`](FORMAT.md), "Campos da v13 (setas)") é uma marcação que aponta e **só se cria e se remove** numa proposta: `create-arrow` e `delete-arrow` são as mudanças `kind: "create"` e `kind: "remove"` com `entity: "arrow"`, como as de marcação.

- **Valor.** `{ id, from, to, fromSide, toSide, style, name, locked }`, no formato do `mapping.json` **sem `points`**: a rota é só da pessoa e nunca vem de proposta. Um `points` que alguém escreva à mão é ignorado ao aplicar, e a seta criada nasce sempre com `points: []`. Os opcionais que faltam entram com o padrão do formato (`null`, `curve`, `false`).
- **Cabeçalho.** `markingId` é o **id da seta** (igual a `entityId`) e `imageId` é o container da marcação de **origem** (`null` = a origem é do canvas): na revisão, a seta é um item dentro do container (ou do grupo Canvas) e, quando a marcação de origem também tem mudanças, aparece dentro dela. As anotações da seta usam as mudanças de anotação de sempre, com `markingId` = id da seta e o mesmo `imageId`.
- **Nenhum campo de uma seta que já existe é proposto** (estilo, nome, trava, pontas, lados e rota). Uma mudança `update` de `entity: "arrow"` num arquivo é **ignorada na leitura, com aviso** (`warnings`), junto com a decisão, a aplicação e a nota presa a ela, como o `parentId` de uma proposta antiga.
- **Dependências.** Criar a seta exige a criação das marcações novas que são pontas dela (e as anotações dela exigem a seta); rejeitar a criação de uma marcação rejeita as setas e as anotações delas. Aceitar a remoção de uma marcação aceita a remoção das setas presas a ela (a cascata do modelo), e rejeitar a remoção de uma dessas setas rejeita a da marcação. Aceitar a remoção da marcação sem a da seta deixaria a seta sem ponta: o conjunto é recusado (`arrow-endpoint-missing`).
- **Conflito.** Remover a seta é conflito se ela mudou depois da proposta, **menos a rota**: os `points` não entram na comparação. Criar uma seta com um id que já existe é conflito, como em qualquer entidade.
- **Aplicar.** A seta que já existia perde os `points` se uma ponta troca de espaço pela aplicação (mudança `space` de uma marcação, ou o assentar). A visão Proposto desenha as setas propostas (as não rejeitadas).
- **Comparação de propostas.** A seta criada é achada pelo caminho legível (`origem → destino › nome`, com as pontas pelo caminho delas), então a mesma seta com outro id gerado conta como a mesma mudança.

## Revisão

### Níveis

**Proposta → Projeto / Canvas / Container → Item → Mudança** (`reviewTree`). O grupo Projeto reúne especializações, repositórios e camadas; o grupo **Canvas** (`level: "canvas"`, irmão dos containers, entre o Projeto e eles) reúne os itens das marcações do canvas (mudanças com `imageId` nulo e `markingId`); cada container (nível `image` no arquivo) reúne o próprio container e os itens dele; um item é uma marcação (ou uma seta) com tudo que mudou nela (espaço, geometria, nome, trava, origem, anotações), e as marcações filhas com mudanças aparecem dentro dela (no ancestral mais próximo, no mesmo espaço, que também tem mudanças). A nota usa os mesmos níveis em `target.level` (`proposal`, `project`, `canvas`, `image`, `item`, `change`); `target.id` é `null` em `proposal`, `project` e `canvas`. O filtro da revisão por container tem a opção **Canvas** (`CANVAS_FILTER`), e o caminho legível de uma marcação criada na comparação de propostas é "Canvas › pai › nome" quando ela é do canvas.

### Decisões

- Só a decisão de cada **mudança** é gravada (`decisions`). Decidir num nível (`decide`) vale para todas as mudanças abaixo dele; um nível menor pode contrariar o maior depois.
- Três estados por mudança: aceita, rejeitada ou sem decisão. Um nível mostra **parcial** quando as mudanças abaixo dele divergem, com as contagens (`summarizeDecisions`).
- Mudanças já aplicadas não mudam de decisão (rejeitar só antes de efetivar). Só uma proposta `open` recebe decisões.

### Dependências

Resolvidas sozinhas ao decidir; `decide` devolve quais mudanças mudaram junto (`cascaded`), para a revisão explicar ("3 anotações rejeitadas junto").

1. **Aceitar uma mudança dentro de um item criado aceita a criação dele** e a dos ancestrais criados na mesma proposta (e de tudo que ela cita e foi criado pela proposta: container, camada, dona, especialização, alvo de uma referência).
2. **Rejeitar a criação de um item rejeita o que depende dele**: anotações, filhas, vinculadas e referências (`ref`) que apontam para ele.
3. **Aceitar a remoção de um item aceita a remoção do que a cascata do modelo remove** (filhas, anotações, vinculadas…).
4. **Rejeitar a remoção de algo da cascata rejeita a remoção de quem a causa** (não dá para remover o pai e manter a filha).

Limpar a decisão de uma mudança tira a aceitação do que dependia dela.

### Conflitos

Uma mudança é **conflito** quando o projeto mudou depois da proposta: o `from` não bate com o valor atual (`changeStatus`, com o valor atual em `current`), a entidade a alterar sumiu, ou a entidade a criar já existe. Alterar algo criado pela própria proposta não é conflito. O conflito é recalculado contra o projeto atual a cada abertura, sem perder as decisões já tomadas. **Aceitar sobrescreve o valor atual; rejeitar mantém.**

### Item trancado

Mudanças de geometria (`rect` ou `space` da marcação; `placement` e troca de arquivo de outro tamanho do container) ou remoção num item trancado (pela trava própria ou, na geometria, de um ancestral) trazem o aviso "item trancado" (`changeStatus(...).locked`). Aceitar é permitido (a revisão é uma decisão deliberada) e a trava continua ligada depois.

### Validação do conjunto aceito

"Aplicar aceitas" aplica as mudanças aceitas e ainda não aplicadas a uma cópia do projeto e valida o resultado (`validateAccepted`): as invariantes do modelo (`validateProject`), especializações citadas que não ficariam aplicadas (`missing-specialization`) e mudanças que não cabem no projeto atual (`entity-missing`: alteração de algo que sumiu; `entity-exists`: criação de um id que já existe; `field-mismatch`: ex. `values.*` numa anotação que virou livre, ou `values.<key>` com valor novo numa chave que não é campo do tipo, como o campo `codeRef` que saiu do formato na v9 numa proposta antiga; limpar uma chave fora do tipo, `to: null`, não é conflito: a chave sai de `values`, como no `remove-field` e no `rename-field` de uma migração da mesma proposta). Só contam os problemas novos. Cada problema traz as mudanças aceitas envolvidas (`changeIds`: rejeitar uma delas resolve) e as sem decisão nas mesmas entidades (`related`: aceitar uma delas pode resolver, ex. a posição do pai que falta). Com algum problema, aplicar fica bloqueado.

### Aplicar aceitas

`applyAccepted(projeto, proposta, data)` efetiva só as aceitas ainda não aplicadas, numa única alteração do projeto (uma entrada de desfazer para quem chama), e devolve o projeto novo, a proposta com `applied` atualizado, as mudanças aplicadas, as imagens a mover de `proposals/<id>/` para o lugar definitivo (`files`) e os pacotes de biblioteca a copiar de `proposals/<id>/specs/<pasta>/` para `specs/<pasta>/` (`packages`: `specId`, `version`, `dir`, `from`, `file` e `spec`). Antes de entregar o pacote à sessão, a app o lê, monta o arquivo da especialização a partir de `to.spec` e o valida pelos três níveis da biblioteca, com a versão aplicada como anterior (contrato de versão): sem arquivo nenhum a aplicação falha com `package-missing`, e pacote inválido com `package-invalid`; nos dois casos nada muda. O que está sem decisão continua pendente na mesma proposta; uma nova aplicação depois efetiva o que for aceito em seguida. A aplicação não passa pelas operações do modelo (a trava não impede), mas o resultado passa pelas invariantes.

### Estados

| `status`     | Quando                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`       | Em revisão.                                                                                                                                  |
| `applied`    | Tudo decidido e as aceitas aplicadas (a última aplicação muda o estado sozinha). Ao ser substituída, continua `applied` (é histórico).       |
| `superseded` | Aberta e substituída por outra (`supersedes`). Decisões e notas continuam guardadas; as aceitas ainda podem ser aplicadas, as pendentes não. |
| `withdrawn`  | Retirada pelo agente. Nada mais é aplicado.                                                                                                  |

`reviewProgress` conta as aceitas aguardando aplicação e diz se a revisão terminou (`complete`: nada sem decisão nem aceito sem aplicar), que é quando uma proposta deve ser substituída.

### Proposta substituída

Cada mudança da proposta antiga mostra se a nova traz a **mesma** coisa, **outra** coisa ou **não consta** nela (`compareProposals(antiga, nova)`): a mudança correspondente é achada pela origem (criação de container ou marcação com `source`, mesmo recriada com outro id), depois pela entidade e pelo campo e, nas criações que sobraram, pelo caminho legível (container › pai › nome; na anotação, marcação › camada › tipo › nome), uma a uma e na ordem. O valor `to` é comparado com os ids gerados por cada proposta trocados pelo caminho.

Uma proposta **aplicada** substituída continua `applied`: a app deriva do `supersedes` da nova o "Aplicada · substituída por <título>", com **Abrir a nova**.

### Revisão pelo agente

O agente corrige a proposta **aberta** na própria proposta, sem criar outra (`revise_proposal`; `prepareRevision` e `reviseProposal`, em `proposalRevise.ts`). A revisão grava a `formatVersion` 5 e acrescenta uma entrada a `revisions`.

- **Quando pode.** Proposta `open` e com `applied` vazio. Com mudança já aplicada, o erro é `proposal-applied` (a dica é `propose_changes` com `supersedes`); fora de `open`, `not-open`.
- **`drop`.** Os ids das mudanças a retirar. Segue as dependências do `proposalIndex`: retirar a criação de um item retira o que depende dela, e retirar uma remoção da cascata retira a remoção de quem a causa. Id que não existe: `change-not-found`.
- **O lote roda sobre o proposto inteiro** depois do `drop`: o projeto atual com todas as mudanças que ficaram, sem decisão, aceitas e rejeitadas. Por isso o agente edita pelo id definitivo um item que a proposta cria, mesmo rejeitado. Se o proposto inteiro não cabe no projeto atual: `proposal-not-applicable`, com os problemas e os ids.
- **Classificação.** Cada mudança do resultado cai em uma de quatro:
  - **intocada**: idêntica (id, `from`, `to`, `insertBefore`, decisão e notas);
  - **trocada**: mantém o id, o `from` e as notas, recebe o `to` novo, perde a decisão e ganha a marca "Revisada";
  - **nova**: recebe o próximo `c<n>` livre (nunca um id já usado, nem o de uma retirada), o `from` do projeto atual, nenhuma decisão e a marca;
  - **retirada**: está no `drop`, ou o lote desfez o efeito dela; sai de `changes` com a decisão.
- **Congelamento.** Trocar ou retirar uma mudança **aceita** (inclusive pelas dependências) recusa a chamada inteira, sem gravar nada: `change-frozen`, com os ids.
- **Decisões.** Só as das trocadas e das retiradas mudam. Dependentes rejeitadas junto continuam rejeitadas (o item aparece Parcial).
- **Como as trocadas são achadas, sem heurística.** Pela chave da mudança: entidade, id e campo na alteração; entidade e tipo (`create` ou `remove`) na criação e na remoção. `prepareRevision` monta o proposto inteiro; o efeito líquido é `computeChanges(atual, resultado)` e o que o lote mexeu é `computeChanges(proposto, resultado)`. Para cada mudança que ficou: o efeito líquido tem a chave com o mesmo `to` → intocada (na criação de marcação e de container, o `parentId`, que é derivado, fica fora da comparação); com outro `to` → trocada; sem a chave → retirada se o lote mexeu nela, intocada se não mexeu (o projeto mudou por fora). "Mexeu" conta por família de campo: na marcação, `rect`, `space` e `containerId` são uma família; na anotação, `type`, `values.*` e `entries.*`; na criação e na remoção, qualquer mudança da entidade. Um `position` que o efeito líquido não pede mais é sempre retirado: quais irmãs levam `position` depende do grupo inteiro. As mudanças do efeito líquido sem par são as novas. A ordem de `changes` é a do efeito líquido (a do projeto proposto, que a aplicação segue ao acrescentar as criadas). Por fim, se aplicar tudo não dá os pais e a ordem entre irmãs do resultado com as âncoras antigas, a criação de marcação cujo `insertBefore` precisa mudar vira **trocada** (o lugar no array é parte do efeito dela; aceita, ela recusa com `change-frozen`). O `compareProposals` não serve aqui, porque os ids criados se mantêm.
- **Garantias.**
  - **Fidelidade:** aplicar todas as mudanças da proposta revisada ao projeto atual, sem conflito, dá o mesmo que aplicar o lote sobre o proposto inteiro (mesmos valores, `parentId` e ordem entre irmãs), com o limite #625 de "Posição da marcação criada".
  - As intocadas ficam byte a byte iguais na serialização canônica.
  - Revisão sem efeito: `no-changes`.
  - Conflito: as intocadas e as trocadas mantêm o `from` de quando foram propostas, e o conflito com o projeto atual aparece como hoje.
  - Provado por um fuzz com semente fixa (`tests/model/proposalReviseFuzz.test.ts`, 1.000 casos ou mais).
- **Nota de mudança retirada.** Passa ao nível da proposta (`target: { level: "proposal", id: null }`), com o texto e a data iguais, e o id entra em `dropped[].notes`. Na revisão ela aparece nas notas da proposta com "Da mudança retirada: <resumo da mudança>".
- **A marca "Revisada"** (modelo, `proposalRevisions.ts`). Aparece quando a mudança está sem decisão e consta em `changed` ou `added` de alguma revisão. Decidir tira a marca da tela (o registro fica no arquivo); limpar a decisão a traz de volta. O "antes da revisão" vem da revisão mais nova que trocou a mudança.
- **Fora da revisão.**
  - Pacote de biblioteca novo ou trocado: `revise-unsupported`, vai numa proposta nova. Retirar uma mudança de pacote que já está na proposta pode, e os arquivos dela saem da pasta.
  - Trocar título, descrição ou origem.
  - O agente decidir ou escrever nota.

## Regras de validade

`parseProposal` / `parseProposalText` validam o arquivo e devolvem os erros com o caminho exato (ex: `changes[3].to.rect.width: …`, `decisions.c9: mudança inexistente`):

- raiz com todos os campos; `format`, `formatVersion`, `status` e datas ISO 8601 válidos; `title` não vazio; `supersedes` diferente do próprio `id`;
- ids de mudança e de nota únicos;
- cada mudança coerente com o `kind` (criação com `from: null`, remoção com `to: null`, alteração com `field` da entidade), com os valores no formato do `mapping.json` (a especialização é validada como em `SPEC-FORMAT.md`), o id da entidade inteira igual a `entityId`, `imageId` (o container) preenchido na imagem e nulo só no grupo Projeto e nas marcações do canvas, `markingId` preenchido nas marcações e anotações;
- `decisions` e `applied` só citam mudanças existentes, e `applied` só mudanças aceitas;
- `target` das notas com `id` `null` em `proposal`, `project` e `canvas`, e citando uma mudança existente em `change`.

Na `formatVersion` 6 ou mais, `revisions` é opcional (e vale o que segue se existir); `project` só aceita `update` com `entityId` `"project"`; `drawingMode` segue `[a-z0-9][a-z0-9-]*`; `direction` (container e `project`) é `ltr` ou `rtl`.

Na `formatVersion` 5, mais:

- `revisions` obrigatório (e ausente nas versões anteriores, com erro e caminho); `at` ISO 8601 em cada revisão;
- `changed.<id>.state` só `"rejected"` ou `null`;
- um id de `dropped` nunca volta a `changes` (`revisions[0].dropped[0].change.id: …`);
- um id de `added` aparece uma só vez no histórico inteiro;
- `dropped[].change` é validado como uma mudança;
- o resto é histórico e pode citar mudança ou nota que já não existe.

## API em `src/model/`

- Formato: `PROPOSAL_FORMAT`, `PROPOSAL_FORMAT_VERSION`, `PROPOSAL_FORMAT_VERSIONS`, `PROPOSAL_REVISED_FORMAT_VERSION`, `PROPOSALS_DIR`, `proposalDir`, `proposalFilePath`, `proposalImagePath`, `parseProposal`, `parseProposalText`, `serializeProposal`; tipos `Proposal`, `Change`, `ChangeKind`, `ChangeEntity`, `Decision`, `DecisionState`, `ProposalNote`, `ReviewTarget`, `ReviewLevel`, `ProposalStatus`, `ProposalRevision`, `RevisionDropped`, `RevisedPriorState`.
- Mudanças: `computeChanges(antes, depois)`, `buildProposal(antes, depois, { title, … })`.
- Revisão: `proposalIndex` (dependências), `requiredChanges`, `dependentChanges`, `reviewTree`, `summarizeDecisions`, `reviewProgress`, `decide`, `changeStatus`, `changeStatuses`, `addNote`, `editNote`, `removeNote`, `notesOf`, `withdrawProposal`, `supersedeProposal`.
- Revisão pelo agente: `prepareRevision`, `reviseProposal` (`proposalRevise.ts`; tipos `ReviseArgs`, `ReviseSummary`, `ReviseError`, `ReviseErrorCode`).
- Marca da revisão (`proposalRevisions.ts`): `revisionMark`, `revisionMarks`, `visibleRevisedChanges`, `latestRevisionSummary`, `droppedNoteOrigin`; tipo `RevisionMark`.
- Aplicação: `acceptedPending`, `validateAccepted`, `applyAccepted`, `previewProject` (a visão "como ficaria"), `patchProject`.
- Comparação: `compareProposals`.
- Leitura para a interface (`proposalView.ts`): `changeType`, `dominantChangeType`, `reviewKey`, `changeTarget`, `changeLayerId`, `changeImageFile`, `filterChanges` (`ReviewFilters`, `NO_FILTERS`), `undecidedChanges`, `acceptedPendingIds`, `leftBehind`, `stepChange`.
- Origens: `findBySource`, `setImageSource`, `setMarkingSource` (`FORMAT.md`, v8) e `findTypesBySource` (`SPEC-FORMAT.md`, `formatVersion` 3).

## Na app

Como a app guarda e confere as propostas (armazenamento, `revision`, desfazer da aplicação, retomada da revisão) está em [`ARCHITECTURE.md`](ARCHITECTURE.md), no item "Propostas de alteração".
