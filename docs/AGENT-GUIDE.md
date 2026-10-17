# Guia do agente (servidor MCP do Mapping)

Este guia é para o agente de IA (Claude Code, Claude Desktop ou outro cliente MCP) que usa o servidor do Mapping. Ele também é servido como o recurso `mapping-docs://AGENT-GUIDE.md`, ao lado de `mapping-docs://FORMAT.md` (o `mapping.json`) e `mapping-docs://SPEC-FORMAT.md` (as especializações).

O Mapping marca **áreas retangulares** em imagens, organiza as informações em **camadas** e as descreve com **anotações** (pares chave-valor livres ou anotações **tipadas** de uma especialização). O servidor lê projetos guardados **em pasta** dentro das raízes configuradas (`--root`). Projetos guardados só no navegador não são alcançáveis.

> **Nesta versão** o servidor **lê**, cria projetos vazios (`create_project`), **mostra imagens** (`get_marking_image`, `get_image_file`), **liga o mapeamento ao código** (`get_code_hints`, `find_by_code`), **propõe alterações** para o usuário revisar (`propose_changes`, `get_proposal`, `get_proposal_review`, `withdraw_proposal`), **casa elementos de uma origem externa** (`source`, `find_by_source`, `find_types_by_source`) **valida especializações** (`validate_specialization`) e **bibliotecas de componentes** (`validate_library`) e **lê os componentes** (`list_components`, `get_component`). **Você nunca grava o projeto**: o `apply_changes` não existe mais.

## Conceitos que importam

- **Coordenadas em pixels da imagem original.** O `rect` de uma marcação (`x`, `y`, `width`, `height`) está sempre nos pixels do arquivo de imagem, com a origem no canto superior esquerdo. `width` e `height` da imagem dizem o limite. Nunca é uma coordenada de tela.
- **Hierarquia.** Uma marcação pode estar dentro de outra (`parent`); a filha cabe inteira no retângulo do pai.
- **Camadas.** Cada anotação pertence a uma camada. Camadas **livres** guardam anotações livres; camadas **de especialização** (com `spec`) guardam as anotações tipadas daquele domínio.
- **Herança.** Uma anotação com `inherit: true` também vale para todos os descendentes da marcação. `get_marking` mostra as herdadas separadas das próprias, com a marcação de origem.
- **Vínculos.** Uma anotação pode ter uma **dona** (`owner`), na mesma marcação e em outra camada (ex: um evento `onClick` vinculado ao `Button`). `linked` lista as vinculadas e `linkTree` mostra a árvore.
- **Referências fortes.** Campos do tipo `ref` apontam para uma tupla, uma linha de tabela ou um campo de outra anotação. Em `refs` você vê para onde cada campo aponta; em `backlinks`, quem aponta para a anotação.
- **Pendências.** Anotação incompleta (`issues`): campo obrigatório vazio, valor inválido, referência quebrada, tipo inexistente etc. São calculadas na leitura, não gravadas.
- **Plataformas e código.** Uma especialização pode declarar **plataformas** e dizer como cada tipo vira código nelas (`code`: componente, arquivo que o define, parâmetros, orientações); `platformRepos` (no projeto) diz onde fica o repositório de cada plataforma. O mapeamento guarda só o que ajuda a **gerar** código, não onde ele foi gerado. Veja "Do mapeamento ao código".
- **Tela em branco.** Uma imagem pode não ter arquivo: `blank: true`, `file: null` e `background` (cor `#RRGGBB`); é onde se monta uma tela com componentes. `get_image_file` nela falha com `blank-image`; use `get_marking_image`. Uma foto não tem `background` nem tamanho editável (`not-blank`).
- **Ordem entre irmãs.** As irmãs (mesma imagem e mesmo `parent`) são desenhadas na ordem da lista: `order` 0 fica por baixo. `move_marking` muda a posição.
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
11. **`find_by_source`** / **`find_types_by_source`** / **`validate_specialization`** / **`validate_library`** — reexportações (casar por origem externa) e criação de especializações e de bibliotecas.
12. **`list_components`** / **`get_component`** — numa especialização `formatVersion` 4, os componentes (documento, campos, exemplos, `code`, `sources`, JSON do componente) sem abrir os arquivos do pacote.

Quando o dev cola uma referência no chat, chame `get_marking` (ou `resolve`) com ela: não é preciso informar o projeto.

## Vendo as imagens

As duas tools de imagem devolvem a **imagem** (conteúdo `image`) e, antes dela, um texto JSON que a descreve. Leia o texto: ele diz o que a imagem mostra.

- **`get_marking_image(ref, { padding, mode, outlineChildren, maxSize, format })`**
  - `mode: "crop"` (padrão): só o recorte da marcação, nos pixels do arquivo original. `padding` (em pixels da imagem original, padrão 0) acrescenta contexto em volta; fica limitado às bordas da imagem.
  - `mode: "context"`: a imagem inteira, com a marcação contornada em magenta (`#FF00FF`). Use para entender **onde** a marcação está.
  - `outlineChildren: true`: contorna as filhas diretas, cada uma com uma cor, e devolve `childrenLegend` (cor → nome → referência → `rect`). Use a legenda para ligar o que você vê às marcações filhas (e a `get_marking` de cada uma). Passando de 24 filhas, as demais não são contornadas (`childrenNotOutlined`).
  - `maxSize` (padrão 1568, entre 64 e 4096) limita o lado maior da imagem devolvida; a imagem nunca é ampliada. Uma marcação pequena sai no tamanho real: use `padding` para ver o entorno.
  - `format`: `png` (padrão, sem perdas: bom para telas e texto), `jpeg` (padrão se o arquivo original é JPEG) ou `webp`.
  - Numa **tela em branco** o recorte é o **desenho simplificado** dos componentes (`drawing: "simplified"`): texto em barras e cores sólidas, sem fontes, gradientes nem sombras. Confira posição, tamanho e hierarquia, não o acabamento.
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
   - `warnings` (só se houver): avisos do projeto resultante, como plataforma em que algum tipo aponta um arquivo (`code.<plataforma>.path`) sem repositório configurado (`missing-repo`);
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
7. **Corrija com uma nova proposta**: leia o projeto atual (o que foi aceito já foi aplicado) e envie `propose_changes` com `supersedes` apontando para a proposta anterior, **só com as correções**: refaça o que foi rejeitado levando em conta as notas, e nada do que foi aceito. A anterior **já aplicada** (o caso normal, com a revisão concluída) continua `applied`: é histórico e não muda de status; a resposta traz `superseded: { status: "applied", note }` e a app mostra nela "Aplicada · substituída por <título da nova>", com **Abrir a nova** (o vínculo é o `supersedes` da nova). Só uma anterior ainda **aberta** passa a `superseded` (mantendo decisões e notas). Repita até o usuário aceitar tudo.

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
- **Proponha só o que mudou.** A proposta já só traz as diferenças campo a campo (nome igual, posição igual = nenhuma mudança; repetir o `rect` atual, ou `move` 0,0, num item trancado também não é mudança e passa), e uma reexportação idêntica é recusada (`no-changes`). Mesmo assim, não reenvie imagens que não mudaram: um `replace_image` com o mesmo conteúdo ainda gera uma mudança de arquivo.
- `find_by_source` também lista em `proposed` as propostas **abertas** que ainda vão criar um elemento com essa origem: espere a revisão (ou use `supersedes`) em vez de duplicá-lo.
- **Especializações com `sources`** (`formatVersion` 3): `find_types_by_source({ project, system, id?, name? })` devolve o tipo de anotação que corresponde ao elemento de origem (ex: o componente `DS/Button`), pelo `id` (mais forte) ou pelo `name`, com as propriedades de origem dos campos e como os valores se traduzem (`Primary` → `primary`). Use-o para escolher o `type` e preencher `values` sem deduzir pelo nome.

### Criando especializações: gerar, validar, corrigir

`validate_specialization({ path })` (arquivo dentro das raízes) ou `validate_specialization({ text })` (o JSON) valida uma especialização **sem aplicá-la a projeto algum**. Os erros são **os mesmos da importação da app**, cada um com o caminho exato (ex: `layers[0].annotationTypes[2].fields[1].sources[0].values.Primary: …`); corrija o trecho apontado e valide de novo. `valid: true` pode vir com `warnings` (plataforma declarada e não usada, tipo sem `code`, `format` antigo): não impedem a importação, mas costumam ser descuido. Só então aplique com `apply_specialization` num `propose_changes`.

O método completo para escrever uma especialização (leitura do formato, inventário da origem, camadas, tipos, campos, relações, `code`, `sources`, versão, validação e entrega) está na skill `spec-author` do repositório do Mapping (`.claude/skills/spec-author/SKILL.md`), feita para ser copiada para o repositório do código mapeado.

### Escrevendo uma biblioteca (pacote `formatVersion` 4)

Uma **biblioteca** é uma especialização v4 e a **pasta** dela: a especialização na raiz, um arquivo por componente em `components/`, um documento `.md` por componente em `docs/`, exemplos nomeados (`examples` no tipo, e o JSON de um nó de sistema externo em `examples/`) e a lista de fontes em `fonts` (com os arquivos em `fonts/` ou, se não puderem ir, um `LEIA-ME.txt` dizendo quais são). Os formatos estão em `mapping-docs://SPEC-FORMAT.md` ("Biblioteca: o pacote") e `mapping-docs://COMPONENT-FORMAT.md`; o método completo, na skill `spec-author`. Regras que o agente precisa ter na cabeça:

- **Todo caminho citado fica dentro da pasta**, relativo ao arquivo da especialização, sem `..`. O que não é citado e é `.json` ou `.md` vira aviso ("arquivo não referenciado").
- **O que é aditivo e o que é quebra** (contrato de versão). _Aditivo_: tipo novo, campo **opcional** novo, opção nova de `enum`, componente, documento, exemplo ou fonte novos, trocar só o desenho (template). _Quebra_: remover ou renomear tipo, campo ou opção de `enum`; tornar um campo obrigatório (inclusive um campo novo que já nasce obrigatório); mudar o `type` de um campo. Atualizar uma biblioteca já aplicada: mantenha o `id`, suba a `version`, preserve ids de tipo e `key` de campo e **só declare `migrations`** (`from`, `to`, passos `rename-type`, `remove-type`, `rename-field`, `remove-field`, `map-values`, `fill-field`) quando houver quebra; sem a migração o validador recusa o pacote quando você passa a versão anterior em `previous`.
- **Gerar, validar, corrigir:** escreva o pacote, rode `validate_library({ path })` (com `previous` quando é uma atualização), corrija cada erro pelo `file` e `path` dele e valide de novo, até `valid: true`. **Erro impede usar; aviso deixa usar** (fonte ausente do pacote, conteúdo maior que a caixa, arquivo sem uso): explique na entrega o que ficou. Use `level: 1` ou `2` para iterar rápido e feche com o nível 3 (padrão), que instancia cada componente e passa os exemplos de sistema externo pela declaração.
- **Quem aplica é a app.** `apply_specialization` e `update_specialization` em `propose_changes` recusam a v4 (`package-spec-unsupported`): a proposta só leva o arquivo da especialização, e a pasta é copiada pela app em Especializações (pasta ou zip). Entregue a pasta validada e diga à pessoa para aplicá-la lá. Depois de aplicada, `list_components` e `get_component` com `project` + `specId` leem a cópia (`specs/<id>/`), e `get_specialization` lista os arquivos dela em `package`.
- **Ler antes de montar:** para saber como usar um componente, `get_component` devolve o documento, os campos, os exemplos, o `code` e as `sources` do tipo de uma vez.

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

| `op`                    | Campos                                                                                                                               | Observações                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_platform_repo`     | `platform`, `urlTemplate?`, `localPath?`                                                                                             | Repositório da plataforma (ver "Do mapeamento ao código"). Campo omitido mantém; `null` remove.                                                                                                                                                                                                                         |
| `remove_platform_repo`  | `platform`                                                                                                                           | Remove a configuração do repositório da plataforma.                                                                                                                                                                                                                                                                     |
| `create_layer`          | `name`, `color?`, `as?`                                                                                                              | Camada livre; cor padrão: a próxima da paleta.                                                                                                                                                                                                                                                                          |
| `update_layer`          | `layer`, `name?`, `color?`                                                                                                           | Camada de especialização não é renomeada.                                                                                                                                                                                                                                                                               |
| `move_layer`            | `layer`, `index`                                                                                                                     | Reordena (0 = primeira).                                                                                                                                                                                                                                                                                                |
| `delete_layer`          | `layer`                                                                                                                              | Exclui as anotações dela e as vinculadas a elas.                                                                                                                                                                                                                                                                        |
| `apply_specialization`  | `file`                                                                                                                               | JSON da especialização dentro das raízes; a cópia vai para `specs/`.                                                                                                                                                                                                                                                    |
| `update_specialization` | `file`                                                                                                                               | Versão maior de uma já aplicada.                                                                                                                                                                                                                                                                                        |
| `remove_specialization` | `specId`, `mode`                                                                                                                     | `delete` (apaga camadas e anotações) ou `convert` (viram livres).                                                                                                                                                                                                                                                       |
| `add_image`             | `file` ou `base64`, `fileName?`, `name?`, `source?`, `center?`, `as?`                                                                | PNG, JPEG ou WebP. Mesma otimização da app (abaixo). `source`: `{system, id, url?}`.                                                                                                                                                                                                                                    |
| `add_blank_image`       | `width`, `height`, `background`, `name?`, `source?`, `center?`, `as?`                                                                | Tela em branco (sem arquivo), de 1 a 20000 px por lado; `background` é `#RRGGBB`.                                                                                                                                                                                                                                       |
| `update_image`          | `image`, `name?`, `source?`, `x?`, `y?`, `scale?`, `markingColor?`, `locked?`, `markingsLocked?`, `background?`, `width?`, `height?` | `markingsLocked` tranca ou destranca todas as marcações da imagem. `source: null` limpa a origem. `background`, `width` e `height` só valem numa tela em branco (foto: `not-blank`); mudar o tamanho exige que as marcações continuem dentro.                                                                           |
| `replace_image`         | `image`, `file` ou `base64`, `fileName?`, `source?`, `confirmAspectChange?`                                                          | Marcações reescaladas; com outra proporção, exige a confirmação e ficam "a revisar". Omitido, `source` é mantido.                                                                                                                                                                                                       |
| `delete_image`          | `image`                                                                                                                              | Com as marcações e anotações dela.                                                                                                                                                                                                                                                                                      |
| `create_marking`        | `image`, `rect?`, `name?`, `source?`, `parent?`, `annotation?`, `annotationAs?`, `as?`                                               | `rect` em pixels da imagem. Sem `parent`, o pai é a marcação mais interna que contém o retângulo (como na app); `null` = primeiro nível. `annotation: { type, name?, values? }` cria também a anotação tipada; se o tipo tem componente, `rect` é opcional e vale o `minSize` (veja "Montar uma tela com componentes"). |
| `move_marking`          | `marking`, `index`                                                                                                                   | Posição entre as irmãs (0 = a primeira, desenhada por baixo). Não é geometria: a trava não impede.                                                                                                                                                                                                                      |
| `update_marking`        | `marking`, `name?`, `source?`, `rect?`, `move?`, `parent?`, `locked?`, `confirmReview?`                                              | `rect` redimensiona (as filhas ficam onde estão; numa marcação que desenha um componente, respeita o `minSize` dele); `move: {dx, dy}` desloca com as filhas.                                                                                                                                                           |
| `delete_marking`        | `marking`                                                                                                                            | Com as descendentes e as anotações.                                                                                                                                                                                                                                                                                     |
| `create_annotation`     | `marking`, `type?`, `layer?`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`, `as?`                                            | Sem `type`: livre, com `layer` e `entries`. Com `type`: tipada, na camada do tipo, com `values`.                                                                                                                                                                                                                        |
| `update_annotation`     | `annotation`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`                                                                   | `entries` substitui os pares (a mesma chave mantém o id); `values` muda só os campos informados.                                                                                                                                                                                                                        |
| `delete_annotation`     | `annotation`                                                                                                                         | Com as vinculadas a ela.                                                                                                                                                                                                                                                                                                |

**Valores tipados** (`values`): por `key` do campo (veja `get_specialization`); `null` limpa.

- Campo `table`: a lista de linhas, que **substitui** a tabela. `{"_id": "…"}` mantém uma linha existente (com as células informadas alteradas); `"_as": "$linha"` dá um apelido à linha, para uma referência no mesmo lote.
- Chave que não é campo do tipo: falha com `unknown-field` (veja os campos em `get_specialization`).
- Campo `ref`: `{"annotation": "$user", "entry": "name"}` (par de anotação livre, pela chave ou id), `{"annotation": "$contato", "key": "atributos", "row": "$linha"}` (linha de tabela, pelo id, apelido ou índice) ou `{"annotation": "…", "key": "id"}` (campo).

**Imagens.** Como na app: a orientação EXIF é aplicada, o lado maior fica em no máximo 2560 px e o arquivo é recodificado em WebP (sem perdas para PNG; com perdas, qualidade 0,85, para fotos), sem metadados. Sem redução nem rotação, o original é mantido se o WebP não ficar menor. `width` e `height` da imagem (e as coordenadas das marcações) são os do arquivo gravado. O nome em `images/` nunca sobrescreve um arquivo existente (`foto-2.webp`…). `file` é relativo à pasta do projeto ou a uma raiz, ou absoluto dentro das raízes.

**Travas.** Item trancado não é movido, redimensionado, trocado nem excluído (`locked`): destranque na mesma operação (`"locked": false` é aplicado primeiro; `true`, por último) ou numa anterior. Nome e anotações seguem livres. Repetir a geometria atual (`rect` igual ao atual, `move: {dx: 0, dy: 0}`) não é mudança e passa mesmo trancado, então a reexportação completa pode repetir o `rect` de tudo.

### Montar uma tela com componentes

Uma biblioteca (especialização `formatVersion` 4, aplicada **pela app**) traz componentes: tipos de anotação que a app **desenha** na marcação. Numa tela em branco, o desenho é a tela; o agente monta a tela por proposta e a pessoa revisa.

1. **Escolha os componentes.** `list_components({ project, specId })` lista os tipos com componente (`size`, `minSize`, se é container) e `get_component({ project, specId, type })` traz o documento, os `fields` e os exemplos de `values`. Use os `values` dos exemplos como ponto de partida.
2. **Crie a tela.** `add_blank_image` com o tamanho (ex.: 390 × 844 num celular) e o `background`; dê o apelido `as` (`"$tela"`). A tela só aceita marcações dentro dela.
3. **Crie as instâncias.** `create_marking` com `annotation: { type: "specId/typeId", values: { … } }`. Sem `rect`, a marcação nasce no tamanho inicial do componente, no centro da imagem, ou dentro do slot do `parent`, depois da última filha. Use `annotationAs` para citar a anotação depois (por exemplo num campo `ref`).
4. **Container e filhas.** Crie primeiro o container (a marcação cujo componente tem slot) e dê um apelido; depois crie cada filha com `parent: "$container"`. A filha precisa ficar **inteira dentro do slot** do container; informe o `rect` da filha quando quiser uma posição específica.
5. **Ordem.** As irmãs são desenhadas na ordem em que foram criadas no lote (a última por cima); `move_marking` reordena quando precisar. Criar na ordem certa dispensa o `move_marking`.
6. **Confira.** `plan_changes` valida; depois `propose_changes` e, com a proposta aplicada (ou numa cópia), `get_marking_image` de cada instância (ou `mode: "context"` da tela) mostra o desenho simplificado. Se algo não coube, ajuste `rect` ou `values` e envie outra proposta com `supersedes`.
7. **Proponha e aguarde a revisão.** O fluxo é o de sempre ("Alterando um projeto"): o agente nunca grava o projeto; a pessoa revisa, aceita e aplica.

Regras:

- **O servidor nunca arruma.** Os retângulos dos filhos são os que você informou. Quem recalcula as posições pelo `layout` do slot é a pessoa, com **Arrumar** na app. Posicione as filhas do jeito mais próximo do que o `layout` produziria e diga na descrição da proposta que a pessoa pode usar Arrumar.
- **Componentes de primeiro nível sem `rect` nascem todos no centro da tela, sobrepostos.** Para uma tela inteira, crie um container `Column` cobrindo a tela e ponha os componentes dentro dele, sem `rect` (entram um depois do outro, no eixo do layout), ou passe o `rect` de cada um.
- **Respeite o `minSize`.** Um `rect` menor que o `minSize` do componente falha com `rect-too-small` (a mensagem traz o mínimo); vale também no `update_marking` com `rect`.
- **Não grave nada de desenho.** Cores, formas e textos do componente vêm do pacote da biblioteca e dos `values`; o projeto guarda só a marcação, o `rect` e a anotação tipada.
- **Tipo sem componente** (ou biblioteca não aplicada na app) é uma marcação comum: `rect` é obrigatório e nada é desenhado.
- Uma biblioteca aplicada só por proposta (`apply_specialization`) não traz componentes: a pasta do pacote (`formatVersion` 4) é aplicada pela app.

## Lendo uma anotação

- Anotação **livre**: `entries` é a lista de pares `{id, key, value}` (os valores são texto).
- Anotação **tipada**: `type` (`specId`, `typeId`, `name`) e `values`, com os valores nativos de JSON (números como número, datas em ISO, tabelas como lista de linhas com `_id`). Os campos `ref` aparecem em `values` como objetos com o id do alvo; o campo `refs` da resposta os resolve em texto (`to: "User.name"`) e na referência da anotação alvo.
- `title` é o rótulo que a app mostra (ex: `Classe · Contato`, `Input · input_nome`).

## Do mapeamento ao código

Quando o projeto aplica uma especialização com **plataformas** (veja `platforms` em `get_project`), dá para implementar o que foi mapeado. O mapeamento e a especialização guardam só o que ajuda a **gerar** o código (o componente de cada tipo, o arquivo que o define, os parâmetros e as orientações), não onde o código gerado ficou.

### Fluxo: implementar uma tela

1. **Receba a referência** `mapping://…/m/…` (o dev a cola do app) e chame **`get_marking(ref, { platform })`** e **`get_marking_image(ref)`**: o primeiro dá as anotações e o `code` de cada tipo; o segundo, o que a tela parece.
2. **`get_code_hints(ref, platform)`** devolve a **planta de código**: uma árvore que espelha a marcação e as descendentes. Em cada marcação, as anotações tipadas com:
   - `symbol`: o componente ou tipo da plataforma (`null` = o tipo **não tem mapeamento** nessa plataforma; a resposta lista esses tipos em `unmappedTypes`);
   - `path`, `url`, `localFile`, `exists` (quando a especialização informa o arquivo): **em que arquivo o `symbol` está** (relativo à raiz do repositório da plataforma), o endereço no repositório e o arquivo local (ver abaixo); leia esse arquivo para ver a assinatura do componente antes de usá-lo;
   - `params`: `{ field, name, value }` — o parâmetro no código e o valor **já traduzido** (o enum `primary` vira o `ButtonStyle.Primary` do código). Campo que não está em `params` não é passado;
   - `notes`: a orientação da especialização (leia: ela costuma dizer detalhes como "use o valor do campo id");
   - `values`: os valores como estão no mapeamento (sem traduzir), com os `ref` resolvidos pelo rótulo do alvo (ex: `dado: "User.name"`);
   - `linked`: as anotações vinculadas, sob a dona (o `onClick` sob o `Button`).
3. **Implemente** no repositório com as suas ferramentas. O servidor **não lê nem grava código**: use os `localFile` para achar os arquivos dos componentes.
4. Se faltar o repositório de uma plataforma (o `url` e o `localFile` vêm `null`), proponha um `set_platform_repo` com `propose_changes` (ver abaixo). Não há o que registrar sobre o código gerado.

### O `code` de um tipo: o arquivo do componente

Em `get_marking` e `get_annotation`, cada anotação tipada traz o `code` do tipo por plataforma (`symbol`, `path`, `params`, `values`, `notes`), como na especialização; `get_marking(ref, { platform })` mostra só a plataforma pedida. Quando há `path`, o arquivo vem resolvido ao lado dele (como em `get_code_hints`):

```json
{
  "android": {
    "symbol": "com.app.ds.DSButton",
    "path": "app/src/main/java/com/app/ds/DSButton.kt",
    "url": "https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt",
    "localFile": "app/src/main/java/com/app/ds/DSButton.kt",
    "exists": true,
    "params": { "texto": "text", "estilo": "style" }
  }
}
```

- `path` é relativo à **raiz do repositório da plataforma**, com `/`.
- `url` vem do `urlTemplate` da plataforma (`null` sem ele); o caminho não tem linha, então o trecho `#…{line}` do template sai.
- `localFile` é o caminho **relativo ao diretório de trabalho do cliente** (o repositório, no Claude Code), calculado com o `localPath` da plataforma; `exists` diz se o arquivo está lá (o servidor só confere, não o lê). Sem `localPath`, os dois são `null`. Se o `localPath` leva para fora do diretório de trabalho, vêm `null` e `localFileProblem: "outside-workdir"`: por segurança, o servidor não confere (nem revela) o que está fora.

### `find_by_code`: do código para o mapeamento

`find_by_code({ project?, path?, symbol? })` acha os **tipos** das especializações aplicadas cujo `code` aponta para um arquivo (`code.<plataforma>.path`) ou símbolo (`code.<plataforma>.symbol`), e as **anotações desses tipos**: "estou neste arquivo: que tipos o usam e em que marcações". `path` casa com o caminho inteiro ou com os **últimos segmentos inteiros** (`DSButton.kt` acha `app/…/DSButton.kt`; `Button.kt` não); `symbol`, por igualdade; informando os dois, a **mesma plataforma** precisa casar com ambos. Sem `project`, procura em todos os projetos das raízes. Sem `path` nem `symbol` falha com `missing-query`.

```json
{
  "query": { "path": "DSButton.kt" },
  "searched": ["cadastro"],
  "total": 1,
  "annotationTotal": 1,
  "returned": 1,
  "matches": [
    {
      "project": "cadastro",
      "type": { "specId": "sdui", "typeId": "button", "name": "Button" },
      "code": {
        "android": {
          "symbol": "com.app.ds.DSButton",
          "path": "app/src/main/java/com/app/ds/DSButton.kt",
          "url": "…",
          "localFile": "…",
          "exists": true
        }
      },
      "annotationCount": 1,
      "annotations": [
        {
          "annotation": "mapping://cadastro/a/5b2e91c0 (cadastro.png › Formulário › Cadastrar › Button btn_cadastrar)",
          "title": "Button btn_cadastrar",
          "marking": "mapping://cadastro/m/2f7c4a1d (cadastro.png › Formulário › Cadastrar)",
          "markingName": "Cadastrar",
          "image": "mapping://cadastro/i/9d0e3b77 (cadastro.png)"
        }
      ]
    }
  ]
}
```

- `total` conta os tipos encontrados; `annotationTotal`, as anotações deles. `code` traz só as plataformas que casaram. Um tipo sem anotações vem com `annotations: []`.
- No máximo 200 anotações voltam, somando todos os tipos (`returned`; `truncated: true` quando houve corte); `annotationCount` de cada tipo é sempre o total dele.

### Repositórios por plataforma

- `set_platform_repo { platform, urlTemplate?, localPath? }` configura o repositório da plataforma (campo omitido mantém; `null` remove; sem nenhum dos dois, a configuração sai). `remove_platform_repo { platform }` a remove. `urlTemplate` precisa ser `http(s)://…` com `{path}` (`{line}` é aceito e sai, porque o caminho não tem linha); `localPath` é relativo à pasta do projeto (ex: `../../..`).

```json
[
  {
    "op": "set_platform_repo",
    "platform": "ios",
    "urlTemplate": "https://github.com/org/app-ios/blob/main/{path}",
    "localPath": "../../.."
  }
]
```

- Plataforma em que algum tipo das especializações aplicadas tem `path`, sem repositório configurado, é só um **aviso** (`warnings`, em `get_project`, `plan_changes` e `propose_changes`, com `types`: quantos tipos apontam arquivos nela).

### O que o servidor nunca faz

Nunca **lê nem grava arquivos de código**: só monta o caminho e confere se o arquivo existe (e só dentro do diretório de trabalho do cliente). Quem lê, cria e edita o código é você, com as suas ferramentas.

### Mudança na versão 0.4.0

O campo `codeRef` (onde a instância foi implementada) saiu do formato: as respostas não trazem mais `codeRefs`, `find_by_code` procura pelo `code` dos tipos e um valor para esse campo no lote falha com `unknown-field`. Projetos antigos são migrados na leitura (schema v9, ver o `FORMAT.md`) e uma especialização antiga com o campo é aceita com o aviso `ignored-field` em `validate_specialization`. Uma proposta antiga com mudança nesse campo aparece na revisão como uma mudança que não cabe no projeto: o usuário a rejeita; reenvie sem ela.

## Erros

As falhas voltam como `isError` com um JSON `{"error": {"code", "message", …}}`. Num lote (`plan_changes`, `propose_changes`), o erro de cada operação vem em `errors`, com o mesmo `code`, sem parar as outras. A lista abaixo é **completa** para os códigos próprios do servidor (o registro fica em `mcp/errors.ts`, e um teste confere que todo código dele está aqui). Os demais são **regras do modelo** (`locked`, `rect-out-of-image`, `owner-required`, `duplicate-key`…): a `message` explica o que corrigir.

**Projetos, raízes e caminhos**

| `code`                             | Significado                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-not-found`                | Projeto inexistente nas raízes.                                                                                                                                                                                                                                   |
| `ambiguous-project`                | Nome de projeto repetido: a resposta lista as candidatas; use o `path` de `list_projects`.                                                                                                                                                                        |
| `project-mismatch`                 | A referência é de um projeto e `project` indica outro.                                                                                                                                                                                                            |
| `invalid-project`                  | O `mapping.json` não passa na validação ou não pôde ser lido (a resposta traz o motivo).                                                                                                                                                                          |
| `read-only`                        | O `mapping.json` é de uma versão de schema mais nova que este servidor: atualize o `mapping-mcp.js`.                                                                                                                                                              |
| `spec-unavailable`                 | A cópia da especialização em `specs/` está ausente ou inválida.                                                                                                                                                                                                   |
| `outside-roots`                    | Caminho com `..`, absoluto fora das raízes ou link simbólico que sai delas.                                                                                                                                                                                       |
| `path-not-found`                   | O caminho informado (arquivo de origem, especialização) não existe em nenhuma raiz.                                                                                                                                                                               |
| `invalid-path`                     | Caminho vazio ou inválido; em `find_by_code`, caminho de código que não é relativo à raiz do repositório.                                                                                                                                                         |
| `not-a-file`                       | O caminho é uma pasta (ou outra coisa que não um arquivo).                                                                                                                                                                                                        |
| `file-too-large`                   | Arquivo lido grande demais (origem do lote, especialização ou `proposal.json` acima de 64 MB).                                                                                                                                                                    |
| `root-required`                    | `create_project` com caminho relativo e mais de uma raiz: informe `root`.                                                                                                                                                                                         |
| `unknown-root`                     | `root` não é nenhuma das raízes (a resposta lista `roots`), ou é um nome de pasta que mais de uma raiz tem: use o caminho, como em `roots` ou no `--root`.                                                                                                        |
| `already-exists`, `nested-project` | `create_project`: a pasta já tem um projeto, ou fica dentro de outro projeto (projetos não se aninham).                                                                                                                                                           |
| `invalid-name`                     | `create_project` com nome vazio. Também é regra do modelo (nome vazio ou inválido).                                                                                                                                                                               |
| `package-too-large`                | `validate_library`: pasta com arquivos demais (mais de 2000) ou textos somando mais de 32 MB; aponte a pasta do pacote.                                                                                                                                           |
| `package-spec-unsupported`         | `apply_specialization`/`update_specialization` com uma especialização `formatVersion` 4: o pacote é aplicado pela app, não por proposta.                                                                                                                          |
| `invalid-arguments`                | Combinação de argumentos inválida: `validate_specialization` precisa de exatamente um de `path` ou `text`; `list_components`/`get_component` precisam de `project` + `specId` ou de `path`; `create_project` com `path` absoluto fora da raiz indicada em `root`. |

**Referências e itens**

| `code`                                                 | Significado                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-ref`                                          | Referência mal formada.                                                                                                                                                             |
| `not-found`                                            | Sem item correspondente (referência, camada ou imagem por nome). Também é regra do modelo.                                                                                          |
| `ambiguous-ref`                                        | O código curto ou o id casa com mais de um item (a resposta lista as candidatas).                                                                                                   |
| `ambiguous-image`, `ambiguous-layer`, `ambiguous-type` | Nome de imagem, de camada ou de tipo de anotação que casa com mais de um: use o id (ou `specId`/`typeId`).                                                                          |
| `unknown-type`                                         | Tipo de anotação (`type` de `create_annotation`) que não existe nas especializações aplicadas (a resposta lista até 50 em `types`, como `specId/typeId`). Também é regra do modelo. |
| `wrong-kind`                                           | A referência é de outro tipo (ex: anotação passada a `get_marking`).                                                                                                                |
| `missing-query`                                        | `find_by_code` sem `path` nem `symbol`; `find_by_source` e `find_types_by_source` sem o que procurar.                                                                               |
| `unknown-platform`                                     | Plataforma não declarada pelas especializações aplicadas (a resposta lista as válidas).                                                                                             |

**Imagens**

| `code`                               | Significado                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `image-file-missing`                 | O arquivo da imagem não existe (ou aponta para fora das raízes).                                                                    |
| `blank-image`                        | `get_image_file` ou `replace_image` numa tela em branco (sem arquivo): use `get_marking_image`; a tela não tem arquivo para trocar. |
| `unsupported-image`, `invalid-image` | O arquivo não é PNG, JPEG nem WebP, ou está corrompido.                                                                             |
| `image-too-large`                    | Arquivo maior que 64 MB (16 MB em `base64`) ou imagem com mais de 40 megapixels.                                                    |
| `encode-failed`                      | Falha ao codificar a imagem em WebP (a origem provavelmente está corrompida).                                                       |
| `marking-outside-image`              | O retângulo da marcação não toca a imagem: não há o que recortar.                                                                   |
| `invalid-image-source`               | `add_image`/`replace_image`: informe `file` ou `base64`, exatamente um.                                                             |
| `invalid-base64`                     | Conteúdo `base64` vazio ou inválido.                                                                                                |

**Lote (`plan_changes`, `propose_changes`)**

| `code`                               | Significado                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `unknown-alias`, `alias-unavailable` | Apelido não criado antes no lote, ou criado por uma operação que falhou.                                                    |
| `duplicate-alias`, `invalid-alias`   | Apelido repetido no lote; ou `_as` de uma linha de tabela que não é um apelido (`$linha`).                                  |
| `layer-required`                     | Anotação livre sem `layer` (ou informe `type` para uma tipada).                                                             |
| `invalid-value`                      | Tabela que não é uma lista de linhas, ou linha que não é objeto. Também é regra do modelo (valor incompatível com o campo). |
| `invalid-ref-value`                  | Valor de um campo `ref` que não é `{ "annotation": … }`.                                                                    |
| `invalid-spec`                       | `apply_specialization`/`update_specialization` com um arquivo de especialização inválido.                                   |
| `spec-already-applied`               | A especialização já está aplicada (numa versão menor, use `update_specialization`). Também é regra do modelo.               |
| `nothing-to-change`                  | `set_platform_repo` sem `urlTemplate` nem `localPath`.                                                                      |

**Propostas**

| `code`               | Significado                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-title`      | `propose_changes` sem título.                                                                                                                                                         |
| `no-changes`         | `propose_changes`: as operações não alteram nada (reexportação idêntica).                                                                                                             |
| `revision-conflict`  | `propose_changes`: o projeto mudou enquanto a proposta era calculada (envie de novo). Ao substituir ou retirar: o `proposal.json` não parava de mudar (a app está gravando decisões). |
| `proposal-not-found` | Proposta inexistente no projeto.                                                                                                                                                      |
| `invalid-proposal`   | O `proposal.json` da proposta está ilegível.                                                                                                                                          |
| `image-exists`       | `propose_changes`: outro processo criou o arquivo de uma imagem na pasta da proposta enquanto ela era gravada. Nada foi gravado; envie de novo.                                       |
| `not-open`           | `withdraw_proposal` numa proposta que não está aberta.                                                                                                                                |

**Inesperado**: `internal-error` é uma falha que o servidor não previu (a pilha vai para o stderr do servidor). Repita uma vez; se persistir, relate com a mensagem.

**Avisos** (vêm em `warnings`, sem `isError`: a operação foi feita):

| `code`                  | Significado                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-repo`          | Plataforma em que algum tipo das especializações aplicadas tem `code.<plataforma>.path`, sem repositório configurado (`types`: quantos tipos).           |
| `superseded-incomplete` | `propose_changes` com `supersedes`: a anterior ainda tinha mudanças sem decisão ou aceitas sem aplicar.                                                  |
| `supersede-failed`      | `propose_changes` com `supersedes`: a nova proposta foi gravada, mas a anterior não pôde ser marcada como substituída. **Não reenvie**: avise o usuário. |

## Boas práticas

- Prefira `list_markings` com filtros a abrir marcação por marcação; use `incomplete: true` para achar o que falta preencher.
- As respostas são compactas de propósito. Para um projeto grande, pagine em vez de pedir tudo.
- Para ver uma marcação, use `get_marking_image`: a tool já recorta no arquivo original, com os mesmos pixels do `rect`. Um `padding` pequeno (10 a 40 px) dá contexto; `mode: "context"` mostra o lugar da marcação na imagem. Comece com o `maxSize` padrão: imagens maiores gastam mais do seu contexto.
- Não edite o `mapping.json` nem os arquivos de `proposals/` à mão: proponha pelo lote (`propose_changes`). As regras (contenção das filhas, trava, referências) vivem no modelo, e uma edição por fora pode deixar o projeto inválido. A decisão do usuário (aceitar, rejeitar, notas) é dele: você só lê (`get_proposal`, `get_proposal_review`).
- Junte as alterações relacionadas numa proposta só (com apelidos): é uma revisão e um único ponto para conferir o `summary`. Propostas enormes cansam quem revisa: prefira uma proposta por tela ou por assunto.
- Teste com `plan_changes` quando o lote for grande ou arriscado, mas lembre que ele não envia nada ao usuário.
- Se a app estiver aberta no mesmo projeto, ela percebe a proposta nova em poucos segundos.
