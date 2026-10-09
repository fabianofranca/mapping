# Guia do agente (servidor MCP do Mapping)

Este guia é para o agente de IA (Claude Code, Claude Desktop ou outro cliente MCP) que usa o servidor do Mapping. Ele também é servido como o recurso `mapping-docs://AGENT-GUIDE.md`, ao lado de `mapping-docs://FORMAT.md` (o `mapping.json`) e `mapping-docs://SPEC-FORMAT.md` (as especializações).

O Mapping marca **áreas retangulares** em imagens, organiza as informações em **camadas** e as descreve com **anotações** (pares chave-valor livres ou anotações **tipadas** de uma especialização). O servidor lê projetos guardados **em pasta** dentro das raízes configuradas (`--root`). Projetos guardados só no navegador não são alcançáveis.

> **Nesta versão** o servidor **lê**, cria projetos vazios (`create_project`), **mostra imagens** (`get_marking_image`, `get_image_file`), **liga o mapeamento ao código** (`get_code_hints`, `find_by_code`, campos `codeRef`), **propõe alterações** para o usuário revisar (`propose_changes`, `get_proposal`, `get_proposal_review`, `withdraw_proposal`), **casa elementos de uma origem externa** (`source`, `find_by_source`, `find_types_by_source`) e **valida especializações** (`validate_specialization`). **Você nunca grava o projeto**: o `apply_changes` não existe mais.

## Conceitos que importam

- **Coordenadas em pixels da imagem original.** O `rect` de uma marcação (`x`, `y`, `width`, `height`) está sempre nos pixels do arquivo de imagem, com a origem no canto superior esquerdo. `width` e `height` da imagem dizem o limite. Nunca é uma coordenada de tela.
- **Hierarquia.** Uma marcação pode estar dentro de outra (`parent`); a filha cabe inteira no retângulo do pai.
- **Camadas.** Cada anotação pertence a uma camada. Camadas **livres** guardam anotações livres; camadas **de especialização** (com `spec`) guardam as anotações tipadas daquele domínio.
- **Herança.** Uma anotação com `inherit: true` também vale para todos os descendentes da marcação. `get_marking` mostra as herdadas separadas das próprias, com a marcação de origem.
- **Vínculos.** Uma anotação pode ter uma **dona** (`owner`), na mesma marcação e em outra camada (ex: um evento `onClick` vinculado ao `Button`). `linked` lista as vinculadas e `linkTree` mostra a árvore.
- **Referências fortes.** Campos do tipo `ref` apontam para uma tupla, uma linha de tabela ou um campo de outra anotação. Em `refs` você vê para onde cada campo aponta; em `backlinks`, quem aponta para a anotação.
- **Pendências.** Anotação incompleta (`issues`): campo obrigatório vazio, valor inválido, referência quebrada, tipo inexistente etc. São calculadas na leitura, não gravadas.
- **Plataformas e código.** Uma especialização pode declarar **plataformas** e dizer como cada tipo vira código nelas (`code`: componente, parâmetros, orientações). O campo `codeRef` de uma anotação guarda **onde ela foi implementada**; `platformRepos` (no projeto) diz onde fica o repositório de cada plataforma. Veja "Do mapeamento ao código".
- **Trava.** `lock.locked` indica marcação trancada; `lock.geometryLocked`, geometria travada (por ela ou por um ancestral trancado). Item trancado não pode ser movido, redimensionado nem excluído.

## Referências

Cada item devolvido traz uma referência no formato

```
mapping://<projeto>/<m|i|a>/<código> (<caminho legível>)
```

- `<projeto>` é o nome da pasta do projeto; `m` marcação, `i` imagem, `a` anotação, `p` **proposta** (ex: `mapping://cadastro/p/8c1f2d9e`).
- `<código>` são os 8 primeiros caracteres hexadecimais do id (cresce de 4 em 4 se houver colisão).
- O caminho entre parênteses (ex: `cadastro.png › Formulário › Nome`) é só para leitura: o servidor o ignora.

Toda tool que recebe um item (`ref`) aceita: a referência completa (a que o dev cola do app com Ctrl+C), só `m/3f2a9c1e` com `project` informado, ou o id completo. Sem projeto na referência nem em `project`, o servidor procura em todos os projetos das raízes. Se o código for ambíguo, o erro `ambiguous-ref` devolve as candidatas: escolha uma pela referência completa.

## Fluxo típico

1. **`list_projects`** — projetos nas raízes (nome, `path`, contagens, especializações). Se dois projetos têm o mesmo nome, use o `path` (ou o `dir`) no parâmetro `project`.
2. **`get_project(project)`** — imagens, camadas, especializações aplicadas e as pendências.
3. **`get_specialization(project, specId)`** — antes de interpretar anotações tipadas, leia o JSON completo da especialização: ele traz as descrições e orientações de cada tipo e campo.
4. **`list_markings(project, …)`** — procure marcações por imagem, camada, tipo de anotação, `incomplete` ou texto (nome, chaves e valores; sem diferenciar acentos nem maiúsculas). A resposta é paginada (`limit`, `offset`; `truncated` e `nextOffset` indicam que há mais).
5. **`get_marking(ref)`** — o detalhe de uma marcação: caminho, imagem, `rect`, trava, filhas, e as anotações por camada (próprias e herdadas), vínculos, referências de saída e backlinks.
6. **`get_annotation(ref)`** / **`get_image(ref)`** — o detalhe de uma anotação ou de uma imagem (o `path` absoluto do arquivo, se existir).
7. **`resolve(ref)`** — quando só há uma referência e não se sabe o que ela é.
8. **`get_marking_image(ref, …)`** — **veja** a marcação (ver "Vendo as imagens").
9. **`get_code_hints(ref, platform)`** / **`find_by_code(…)`** — do mapeamento para o código e de volta (ver "Do mapeamento ao código").
10. **`plan_changes`** → **`propose_changes`** → **`get_proposal`** → **`get_proposal_review`** — para alterar o projeto: você propõe, o usuário revisa, você corrige com `supersedes` (ver "Alterando um projeto: propostas para revisão").
11. **`find_by_source`** / **`find_types_by_source`** / **`validate_specialization`** — reexportações (casar por origem externa) e criação de especializações.

Quando o dev cola uma referência no chat, chame `get_marking` (ou `resolve`) com ela: não é preciso informar o projeto.

## Vendo as imagens

As duas tools de imagem devolvem a **imagem** (conteúdo `image`) e, antes dela, um texto JSON que a descreve. Leia o texto: ele diz o que a imagem mostra.

- **`get_marking_image(ref, { padding, mode, outlineChildren, maxSize, format })`**
  - `mode: "crop"` (padrão): só o recorte da marcação, nos pixels do arquivo original. `padding` (em pixels da imagem original, padrão 0) acrescenta contexto em volta; fica limitado às bordas da imagem.
  - `mode: "context"`: a imagem inteira, com a marcação contornada em magenta (`#FF00FF`). Use para entender **onde** a marcação está.
  - `outlineChildren: true`: contorna as filhas diretas, cada uma com uma cor, e devolve `childrenLegend` (cor → nome → referência → `rect`). Use a legenda para ligar o que você vê às marcações filhas (e a `get_marking` de cada uma). Passando de 24 filhas, as demais não são contornadas (`childrenNotOutlined`).
  - `maxSize` (padrão 1568, entre 64 e 4096) limita o lado maior da imagem devolvida; a imagem nunca é ampliada. Uma marcação pequena sai no tamanho real: use `padding` para ver o entorno.
  - `format`: `png` (padrão, sem perdas: bom para telas e texto), `jpeg` (padrão se o arquivo original é JPEG) ou `webp`.
- **`get_image_file(ref, { maxSize, format })`** — a imagem inteira, reduzida se passar de `maxSize`. Cabendo e sem pedir outro formato, é o arquivo original.

No texto: `region` é a parte da imagem original que aparece (em pixels da imagem original), `scale` o fator de redução e `markingInOutput` onde a marcação ficou, **em pixels da imagem devolvida** (o contorno de uma filha usa a mesma conversão: `(x - region.x) × scale`). Se o arquivo tiver dimensões diferentes das do `mapping.json`, as coordenadas são ajustadas na proporção e vem um `warning`.

## Alterando um projeto: propostas para revisão

**Você nunca grava o projeto.** Toda alteração (a primeira importação, uma atualização, uma correção) chega ao usuário como uma **proposta**, uma espécie de pull request dentro da ferramenta: ele vê o projeto como ficaria, aceita ou rejeita em qualquer nível (proposta, imagem, item ou mudança), deixa notas no que rejeitou e aplica o que aceitou. Só a app grava o `mapping.json`.

### O fluxo

1. **Leia o projeto** (`get_project`, `list_markings`, `get_marking`, `get_specialization`). Em reexportações, procure o que já existe com `find_by_source` (ver "Reexportações").
2. **`plan_changes(project, operations[])`** (opcional) valida o lote contra as regras do Mapping (as mesmas da app) **sem gravar nada** e devolve:
   - `valid` e, se houver, `errors` por operação (`index`, `op`, `code`, `message`);
   - `summary`: uma linha legível por operação válida;
   - `changes`: quantos itens serão criados, alterados e excluídos por coleção, e `reviewChanges`: quantas mudanças o usuário terá de revisar;
   - `issues`: pendências antes e depois, e as anotações que ficam incompletas (`new`);
   - `warnings` (só se houver): avisos do projeto resultante, como plataforma usada em `codeRef` sem repositório configurado (`missing-repo`);
   - `created`: as referências `mapping://` dos itens que serão criados (as definitivas), com o apelido de cada um.
3. **`propose_changes(project, title, operations[], { description?, origin?, author?, supersedes? })`** faz a mesma validação e **grava a proposta** em `proposals/<id>/proposal.json` (imagens novas em `proposals/<id>/images/`). Um lote com qualquer erro não grava nada: corrija e mande o lote inteiro de novo. A resposta traz:
   - `proposal.ref`: a referência `mapping://<projeto>/p/<código>`; guarde-a;
   - `reviewChanges` (criações, alterações, remoções) e `levels`: o resumo por nível (Projeto e uma linha por imagem, com `change` `new`/`removed`/`changed`/`items` e quantos itens e mudanças);
   - `created`: as referências **definitivas** dos itens criados, por apelido. Elas só passam a existir no projeto depois que o usuário aceitar e aplicar;
   - `warnings` (se houver) e `superseded` (com `supersedes`).
4. **Avise o usuário**: a proposta espera a revisão dele na app (janela Propostas). Diga o título, o que a proposta faz e a referência. Não grave mais nada nesse meio-tempo.
5. **Espere a revisão terminar.** Consulte `get_proposal(ref)` (ou `list_proposals`): a revisão terminou quando `progress.complete` é `true`, isto é, **nada pendente (`pending`) nem aceito sem aplicar (`accepted`)**. Se não terminou, avise o usuário e espere; não substitua a proposta antes.
6. **`get_proposal_review(ref)`** devolve só o que importa para a próxima rodada, de forma compacta:
   - `rejected`: as mudanças rejeitadas, cada uma com o alvo (referência), `field`, `from`/`to` e as `notes` do usuário. `via` aponta a criação de que a mudança dependia (rejeitada junto: não é uma decisão separada);
   - `notes`: as notas gerais (proposta, projeto, imagem, item), com o alvo;
   - `conflicts`: mudanças que ainda valem mas o projeto mudou depois da proposta (o valor atual vem junto);
   - `ready`: se a revisão terminou.
7. **Corrija com uma nova proposta**: leia o projeto atual (o que foi aceito já foi aplicado) e envie `propose_changes` com `supersedes` apontando para a proposta anterior, **só com as correções**: refaça o que foi rejeitado levando em conta as notas, e nada do que foi aceito. A anterior passa a `superseded` e mantém decisões e notas. Repita até o usuário aceitar tudo.

Se a revisão da proposta anterior ainda tinha mudanças sem decisão ou aceitas sem aplicar, a resposta traz o aviso `superseded-incomplete` (quantas ficaram para trás e quantas a nova repete, altera ou deixa de fora): o usuário vê "esta proposta foi substituída por outra". **Evite**: só substitua depois da revisão concluída.

`withdraw_proposal(ref)` retira uma proposta **aberta** (por exemplo, se você enviou a errada e o usuário ainda não revisou). `list_proposals(project, status?)` mostra as propostas do projeto com o progresso de cada uma.

### O que o usuário revisa

- **Mudanças.** O servidor aplica as operações a uma cópia do projeto e compara entidade por entidade, campo por campo: uma criação é uma mudança com a entidade inteira; uma remoção, uma mudança (a cascata do modelo aparece como remoções separadas); uma alteração, **uma mudança por campo** (`name`, `rect`, `locked`, `source`, cada chave de `values`, cada par de `entries`…), com o valor antes (`from`) e depois (`to`).
- **Dependências** resolvidas sozinhas ao decidir: aceitar uma mudança dentro de um item criado aceita a criação dele; rejeitar a criação de um item rejeita o que depende dele (anotações, filhas, referências). Por isso uma rejeição pode trazer outras "junto" (`via`).
- **Conflito.** Se o projeto mudou depois da proposta (o usuário editou à mão), a mudança vem marcada `conflict`, com o valor atual. **Item trancado:** mudanças de geometria ou remoção em item trancado vêm com `locked`; aceitar é permitido e a trava continua ligada.
- **Estados** (`get_proposal`): cada mudança está `pending`, `accepted`, `rejected` ou `applied`. A proposta está `open`, `applied` (tudo decidido e aceitas aplicadas), `superseded` ou `withdrawn`. `get_proposal` aceita `state` (inclusive `conflict`), `limit` e `offset` para propostas grandes.

Um lote que não altera nada (a reexportação coincide com o projeto) é recusado com `no-changes`: não há o que propor.

As operações são aplicadas **em ordem**, cada uma sobre o resultado da anterior.

### Reexportações: casar por `source` e propor só o que mudou

Imagens e marcações têm um `source` opcional (`{ "system", "id", "url" }`): a identidade do elemento no sistema de origem (ex: `figma` e o id do frame). O núcleo não interpreta `system`; é só um texto que você escolhe e repete.

- **Na primeira importação**, ponha `source` em toda imagem (`add_image`) e marcação (`create_marking`) criada. Os ids do Mapping são novos; o `source` é o que permite reconhecer os mesmos elementos depois.
- **Na reexportação**, para cada elemento da origem chame `find_by_source({ project, system, id })`: se existe, **atualize** (`update_marking`, `update_image`, `replace_image`) em vez de criar de novo; se não existe, crie com o mesmo `source`. Remova (`delete_*`) só o que sumiu da origem e que o usuário espera ver removido.
- **Proponha só o que mudou.** A proposta já só traz as diferenças campo a campo (nome igual, posição igual = nenhuma mudança), e uma reexportação idêntica é recusada (`no-changes`). Mesmo assim, não reenvie imagens que não mudaram: um `replace_image` com o mesmo conteúdo ainda gera uma mudança de arquivo.
- `find_by_source` também lista em `proposed` as propostas **abertas** que ainda vão criar um elemento com essa origem: espere a revisão (ou use `supersedes`) em vez de duplicá-lo.
- **Especializações com `sources`** (`formatVersion` 3): `find_types_by_source({ project, system, id?, name? })` devolve o tipo de anotação que corresponde ao elemento de origem (ex: o componente `DS/Button`), pelo `id` (mais forte) ou pelo `name`, com as propriedades de origem dos campos e como os valores se traduzem (`Primary` → `primary`). Use-o para escolher o `type` e preencher `values` sem deduzir pelo nome.

### Criando especializações: gerar, validar, corrigir

`validate_specialization({ path })` (arquivo dentro das raízes) ou `validate_specialization({ text })` (o JSON) valida uma especialização **sem aplicá-la a projeto algum**. Os erros são **os mesmos da importação da app**, cada um com o caminho exato (ex: `layers[0].annotationTypes[2].fields[1].sources[0].values.Primary: …`); corrija o trecho apontado e valide de novo. `valid: true` pode vir com `warnings` (plataforma declarada e não usada, tipo sem `code`, `format` antigo): não impedem a importação, mas costumam ser descuido. Só então aplique com `apply_specialization` num `propose_changes`.

### Apelidos

Um item criado no lote pode ser citado nas operações seguintes por um **apelido** (`"as": "$porta"`). Assim marcação, anotação e evento vinculado saem numa chamada só:

```json
[
  {
    "op": "create_marking",
    "as": "$botao",
    "image": "i/3f2a9c1e",
    "rect": { "x": 40, "y": 900, "width": 300, "height": 80 },
    "name": "Entrar"
  },
  {
    "op": "create_annotation",
    "as": "$btn",
    "marking": "$botao",
    "type": "sdui/button",
    "values": { "id": "btn_entrar", "texto": "Entrar" }
  },
  {
    "op": "create_annotation",
    "marking": "$botao",
    "type": "onClick",
    "owner": "$btn",
    "values": { "acao": "submit" }
  }
]
```

Onde uma operação pede um item (`image`, `marking`, `parent`, `annotation`, `owner`, `annotation` de uma referência), vale a referência completa, `m/código`, o id ou o apelido. Camadas: id, nome, `specId/layerId` ou apelido (`create_layer` aceita `as`). Tipos: `specId/typeId`, `typeId` ou o nome do tipo.

### Operações

| `op`                    | Campos                                                                                           | Observações                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `set_platform_repo`     | `platform`, `urlTemplate?`, `localPath?`                                                         | Repositório da plataforma (ver "Do mapeamento ao código"). Campo omitido mantém; `null` remove.                                          |
| `remove_platform_repo`  | `platform`                                                                                       | Remove a configuração do repositório da plataforma.                                                                                      |
| `create_layer`          | `name`, `color?`, `as?`                                                                          | Camada livre; cor padrão: a próxima da paleta.                                                                                           |
| `update_layer`          | `layer`, `name?`, `color?`                                                                       | Camada de especialização não é renomeada.                                                                                                |
| `move_layer`            | `layer`, `index`                                                                                 | Reordena (0 = primeira).                                                                                                                 |
| `delete_layer`          | `layer`                                                                                          | Exclui as anotações dela e as vinculadas a elas.                                                                                         |
| `apply_specialization`  | `file`                                                                                           | JSON da especialização dentro das raízes; a cópia vai para `specs/`.                                                                     |
| `update_specialization` | `file`                                                                                           | Versão maior de uma já aplicada.                                                                                                         |
| `remove_specialization` | `specId`, `mode`                                                                                 | `delete` (apaga camadas e anotações) ou `convert` (viram livres).                                                                        |
| `add_image`             | `file` ou `base64`, `fileName?`, `name?`, `source?`, `center?`, `as?`                            | PNG, JPEG ou WebP. Mesma otimização da app (abaixo). `source`: `{system, id, url?}`.                                                     |
| `update_image`          | `image`, `name?`, `source?`, `x?`, `y?`, `scale?`, `markingColor?`, `locked?`, `markingsLocked?` | `markingsLocked` tranca ou destranca todas as marcações da imagem. `source: null` limpa a origem.                                        |
| `replace_image`         | `image`, `file` ou `base64`, `fileName?`, `source?`, `confirmAspectChange?`                      | Marcações reescaladas; com outra proporção, exige a confirmação e ficam "a revisar". Omitido, `source` é mantido.                        |
| `delete_image`          | `image`                                                                                          | Com as marcações e anotações dela.                                                                                                       |
| `create_marking`        | `image`, `rect`, `name?`, `source?`, `parent?`, `as?`                                            | `rect` em pixels da imagem. Sem `parent`, o pai é a marcação mais interna que contém o retângulo (como na app); `null` = primeiro nível. |
| `update_marking`        | `marking`, `name?`, `source?`, `rect?`, `move?`, `parent?`, `locked?`, `confirmReview?`          | `rect` redimensiona (as filhas ficam onde estão); `move: {dx, dy}` desloca com as filhas.                                                |
| `delete_marking`        | `marking`                                                                                        | Com as descendentes e as anotações.                                                                                                      |
| `create_annotation`     | `marking`, `type?`, `layer?`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`, `as?`        | Sem `type`: livre, com `layer` e `entries`. Com `type`: tipada, na camada do tipo, com `values`.                                         |
| `update_annotation`     | `annotation`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`                               | `entries` substitui os pares (a mesma chave mantém o id); `values` muda só os campos informados.                                         |
| `delete_annotation`     | `annotation`                                                                                     | Com as vinculadas a ela.                                                                                                                 |

**Valores tipados** (`values`): por `key` do campo (veja `get_specialization`); `null` limpa.

- Campo `table`: a lista de linhas, que **substitui** a tabela. `{"_id": "…"}` mantém uma linha existente (com as células informadas alteradas); `"_as": "$linha"` dá um apelido à linha, para uma referência no mesmo lote.
- Campo `codeRef`: a lista completa de entradas `{"platform", "path", "symbol?", "line?", "_id?"}` (ver "Do mapeamento ao código").
- Campo `ref`: `{"annotation": "$user", "entry": "name"}` (par de anotação livre, pela chave ou id), `{"annotation": "$contato", "key": "atributos", "row": "$linha"}` (linha de tabela, pelo id, apelido ou índice) ou `{"annotation": "…", "key": "id"}` (campo).

**Imagens.** Como na app: a orientação EXIF é aplicada, o lado maior fica em no máximo 2560 px e o arquivo é recodificado em WebP (sem perdas para PNG; com perdas, qualidade 0,85, para fotos), sem metadados. Sem redução nem rotação, o original é mantido se o WebP não ficar menor. `width` e `height` da imagem (e as coordenadas das marcações) são os do arquivo gravado. O nome em `images/` nunca sobrescreve um arquivo existente (`foto-2.webp`…). `file` é relativo à pasta do projeto ou a uma raiz, ou absoluto dentro das raízes.

**Travas.** Item trancado não é movido, redimensionado, trocado nem excluído (`locked`): destranque na mesma operação (`"locked": false` é aplicado primeiro; `true`, por último) ou numa anterior. Nome e anotações seguem livres.

## Lendo uma anotação

- Anotação **livre**: `entries` é a lista de pares `{id, key, value}` (os valores são texto).
- Anotação **tipada**: `type` (`specId`, `typeId`, `name`) e `values`, com os valores nativos de JSON (números como número, datas em ISO, tabelas como lista de linhas com `_id`). Os campos `ref` aparecem em `values` como objetos com o id do alvo; o campo `refs` da resposta os resolve em texto (`to: "User.name"`) e na referência da anotação alvo.
- `title` é o rótulo que a app mostra (ex: `Classe · Contato`, `Input · input_nome`).

## Do mapeamento ao código

Quando o projeto aplica uma especialização com **plataformas** (veja `platforms` em `get_project`), dá para implementar o que foi mapeado e registrar onde.

### Fluxo: implementar uma tela

1. **Receba a referência** `mapping://…/m/…` (o dev a cola do app) e chame **`get_marking(ref, { platform })`** e **`get_marking_image(ref)`**: o primeiro dá as anotações e os `codeRefs` existentes; o segundo, o que a tela parece.
2. **`get_code_hints(ref, platform)`** devolve a **planta de código**: uma árvore que espelha a marcação e as descendentes. Em cada marcação, as anotações tipadas com:
   - `symbol`: o componente ou tipo da plataforma (`null` = o tipo **não tem mapeamento** nessa plataforma; a resposta lista esses tipos em `unmappedTypes`);
   - `params`: `{ field, name, value }` — o parâmetro no código e o valor **já traduzido** (o enum `primary` vira o `ButtonStyle.Primary` do código). Campo que não está em `params` não é passado;
   - `notes`: a orientação da especialização (leia: ela costuma dizer detalhes como "use o valor do campo id");
   - `values`: os valores como estão no mapeamento (sem traduzir), com os `ref` resolvidos pelo rótulo do alvo (ex: `dado: "User.name"`);
   - `linked`: as anotações vinculadas, sob a dona (o `onClick` sob o `Button`);
   - `codeRefs`: onde essa instância já foi implementada nessa plataforma.
3. **Implemente** no repositório com as suas ferramentas. O servidor **não lê nem grava código**: use os `localFile` para achar os arquivos.
4. **Registre onde implementou** com `propose_changes`: um `update_annotation` do `codeRef` (e, se faltar, um `set_platform_repo`), como abaixo. O usuário revisa e aplica como qualquer proposta.

### `codeRefs`: onde já foi implementado

Em `get_marking`, `get_annotation`, `get_code_hints` e `find_by_code`, cada entrada vem resolvida:

```json
{
  "field": "implementacao",
  "id": "7c1f…",
  "platform": "android",
  "path": "app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "symbol": "CadastroScreen",
  "line": null,
  "url": "https://github.com/org/app-android/blob/main/app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "localFile": "app/src/main/java/com/app/cadastro/CadastroScreen.kt",
  "exists": true
}
```

- `path` é relativo à **raiz do repositório da plataforma**, com `/`.
- `url` vem do `urlTemplate` da plataforma (`null` sem ele).
- `localFile` é o caminho **relativo ao diretório de trabalho do cliente** (o repositório, no Claude Code), calculado com o `localPath` da plataforma; `exists` diz se o arquivo está lá. Sem `localPath`, os dois são `null`. Se o `localPath` leva para fora do diretório de trabalho, vêm `null` e `localFileProblem: "outside-workdir"`: por segurança, o servidor não confere (nem revela) o que está fora.
- Os campos `codeRef` **saem de `values`** nessas respostas e aparecem só em `codeRefs`. `get_marking(ref, { platform })` filtra `codeRefs` e `code` por plataforma. O `code` de uma anotação tipada é o mapeamento do tipo por plataforma (`symbol`, `params`, `values`, `notes`), como na especialização.

### `find_by_code`: do código para o mapeamento

`find_by_code({ project?, path?, symbol? })` acha as entradas de `codeRef` que apontam para um arquivo ou símbolo, com as referências `mapping://` da marcação e da anotação. `path` casa com o caminho inteiro ou com os **últimos segmentos inteiros** (`CadastroScreen.kt` acha `app/…/CadastroScreen.kt`; `Screen.kt` não); `symbol`, por igualdade; informando os dois, ambos precisam casar. Sem `project`, procura em todos os projetos das raízes. Sem `path` nem `symbol` falha com `missing-query`. Use para ir de "estou mexendo neste arquivo" para "o que o design diz sobre ele".

### Registrando o `codeRef`

O valor de um campo `codeRef` é a **lista completa** de entradas, em `values` de `create_annotation` ou `update_annotation`:

```json
[
  {
    "op": "update_annotation",
    "annotation": "mapping://cadastro/a/d00bb3f3",
    "values": {
      "implementacao": [
        { "_id": "7c1f…" },
        {
          "platform": "android",
          "path": "app/src/main/java/com/app/cadastro/CadastroViewModel.kt",
          "symbol": "CadastroViewModel",
          "line": 42
        }
      ]
    }
  },
  {
    "op": "set_platform_repo",
    "platform": "ios",
    "urlTemplate": "https://github.com/org/app-ios/blob/main/{path}#L{line}",
    "localPath": "../../.."
  }
]
```

- Cada entrada tem `platform` (declarada pela especialização do tipo e, se o campo restringe, em `platforms` do campo), `path`, e opcionalmente `symbol` e `line` (inteiro ≥ 1). O `path` é normalizado (`\` vira `/`), relativo, sem `.`, `..` nem `/` no começo.
- `_id` mantém uma entrada existente (as propriedades omitidas ficam como estão; copie o `id` de `codeRefs`). Sem `_id`, a entrada é nova. **Entradas que você não repete são removidas**: para acrescentar uma, envie todas as existentes com o `_id` mais a nova (o resumo mostra `+N, -N entrada(s)`: confira). Parta de `get_annotation`, que traz todas as entradas; `get_marking` com `platform` esconde as das outras plataformas. `null` ou `[]` limpa.
- `set_platform_repo { platform, urlTemplate?, localPath? }` configura o repositório da plataforma (campo omitido mantém; `null` remove; sem nenhum dos dois, a configuração sai). `remove_platform_repo { platform }` a remove. `urlTemplate` precisa ser `http(s)://…` com `{path}` (`{line}` é opcional); `localPath` é relativo à pasta do projeto (ex: `../../..`).
- Plataforma usada em algum `codeRef` sem repositório configurado é só um **aviso** (`warnings`, em `get_project` e `plan_changes`); entrada com plataforma não permitida ou sem caminho deixa a anotação **incompleta** (`issues`).

### O que o servidor nunca faz

Nunca **lê nem grava arquivos de código**: só monta o caminho e confere se o arquivo existe (e só dentro do diretório de trabalho do cliente). Quem lê, cria e edita o código é você, com as suas ferramentas; o servidor guarda no `mapping.json` apenas **onde** você implementou.

## Erros

As falhas voltam como `isError` com um JSON `{"error": {"code", "message", …}}`. Os códigos que você mais verá:

| `code`                                           | Significado                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `project-not-found`, `ambiguous-project`         | Projeto inexistente, ou nome repetido (a resposta lista as candidatas).              |
| `invalid-ref`, `not-found`, `ambiguous-ref`      | Referência mal formada, sem item correspondente, ou com mais de um.                  |
| `wrong-kind`                                     | A referência é de outro tipo (ex: anotação passada a `get_marking`).                 |
| `outside-roots`                                  | Caminho com `..`, absoluto fora das raízes ou link simbólico que sai delas.          |
| `invalid-project`                                | O `mapping.json` não passa na validação (a resposta traz o motivo).                  |
| `spec-unavailable`                               | A cópia da especialização em `specs/` está ausente ou inválida.                      |
| `image-file-missing`                             | O arquivo da imagem não existe (ou aponta para fora das raízes).                     |
| `unsupported-image`, `invalid-image`             | O arquivo não é PNG, JPEG nem WebP, ou está corrompido.                              |
| `image-too-large`                                | Arquivo maior que 64 MB ou imagem com mais de 100 megapixels.                        |
| `marking-outside-image`                          | O retângulo da marcação não toca a imagem: não há o que recortar.                    |
| `revision-conflict`                              | `propose_changes`: o projeto mudou enquanto a proposta era calculada. Envie de novo. |
| `no-changes`                                     | `propose_changes`: as operações não alteram nada (reexportação idêntica).            |
| `proposal-not-found`, `not-open`                 | Proposta inexistente; ou `withdraw_proposal` numa proposta que não está aberta.      |
| `invalid-arguments`                              | `validate_specialization` precisa de exatamente um de `path` ou `text`.              |
| `unknown-alias`, `alias-unavailable`             | Apelido não criado antes no lote, ou criado por uma operação que falhou.             |
| `unknown-platform`, `platform-not-allowed`       | Plataforma não declarada pelas especializações, ou não permitida no campo `codeRef`. |
| `missing-query`                                  | `find_by_code` sem `path` nem `symbol`.                                              |
| `locked`, `rect-out-of-image`, `owner-required`… | Regras do modelo: a `message` explica o que corrigir.                                |

## Boas práticas

- Prefira `list_markings` com filtros a abrir marcação por marcação; use `incomplete: true` para achar o que falta preencher.
- As respostas são compactas de propósito. Para um projeto grande, pagine em vez de pedir tudo.
- Para ver uma marcação, use `get_marking_image`: a tool já recorta no arquivo original, com os mesmos pixels do `rect`. Um `padding` pequeno (10 a 40 px) dá contexto; `mode: "context"` mostra o lugar da marcação na imagem. Comece com o `maxSize` padrão: imagens maiores gastam mais do seu contexto.
- Não edite o `mapping.json` nem os arquivos de `proposals/` à mão: proponha pelo lote (`propose_changes`). As regras (contenção das filhas, trava, referências) vivem no modelo, e uma edição por fora pode deixar o projeto inválido. A decisão do usuário (aceitar, rejeitar, notas) é dele: você só lê (`get_proposal`, `get_proposal_review`).
- Junte as alterações relacionadas numa proposta só (com apelidos): é uma revisão e um único ponto para conferir o `summary`. Propostas enormes cansam quem revisa: prefira uma proposta por tela ou por assunto.
- Teste com `plan_changes` quando o lote for grande ou arriscado, mas lembre que ele não envia nada ao usuário.
- Se a app estiver aberta no mesmo projeto, ela percebe a proposta nova em poucos segundos.
