# Guia do agente (servidor MCP do Mapping)

Este guia é para o agente de IA (Claude Code, Claude Desktop ou outro cliente MCP) que usa o servidor do Mapping. Ele também é servido como o recurso `mapping-docs://AGENT-GUIDE.md`, ao lado de `mapping-docs://FORMAT.md` (o `mapping.json`) e `mapping-docs://SPEC-FORMAT.md` (as especializações).

O Mapping marca **áreas retangulares** em imagens (ou em containers só com fundo), organiza as informações em **camadas** e as descreve com **anotações** (pares chave-valor livres ou anotações **tipadas** de uma especialização). O servidor lê projetos guardados **em pasta** dentro das raízes configuradas (`--root`). Projetos guardados só no navegador não são alcançáveis.

> **Nesta versão** o servidor **lê**, cria projetos vazios (`create_project`), **mostra imagens** (`get_marking_image`, `get_container_file`) e **entrega cada imagem também por URL local** (`url`, `markdown`), **dá o código de instanciação** de cada tipo mapeado (`get_code_hints`, `find_by_code`), **propõe alterações** para o usuário revisar (`propose_changes`, `get_proposal`, `get_proposal_review`, `withdraw_proposal`), **casa elementos de uma origem externa** (`source`, `find_by_source`, `find_types_by_source`) **valida especializações** (`validate_specialization`) e **bibliotecas de componentes** (`validate_library`) e **lê os componentes** (`list_components`, `get_component`). **Você nunca grava o projeto**: o `apply_changes` não existe mais.

## Conceitos que importam

- **Coordenadas em pixels do container.** O `rect` de uma marcação (`x`, `y`, `width`, `height`) está sempre nos pixels do container, com a origem no canto superior esquerdo: se ele tem arquivo, os pixels da imagem original; se só tem fundo, os do tamanho dele. `width` e `height` do container dizem o limite. Nunca é uma coordenada da janela. O **container** é o objeto de topo do canvas (id, nome, tamanho, posição e um conteúdo: um arquivo de imagem ou uma cor de fundo); a letra `i` das referências `mapping://<projeto>/i/<código>` é o container.
- **Hierarquia.** Uma marcação pode estar dentro de outra (`parent`); a filha cabe inteira no retângulo do pai, e o pai é derivado da geometria (veja "Pertencimento" abaixo).
- **Três mundos, ligados por um deles.** O **visual** é o que se vê e não sabe de nada: o canvas, os containers com suas imagens, os desenhos dos componentes, os post-its e o traço das setas. As **anotações** são os dados: tabelas de valores, uma por camada. As **marcações** ligam os dois: a marcação cobre o botão na imagem (ligação com o visual, por contenção) e atravessa todas as camadas, com uma anotação possível em cada (ligação com os dados). Quem carrega informação é sempre uma marcação; container e desenho são visuais e não levam anotações.
- **A seta é uma marcação que aponta.** Em vez de cobrir uma área, liga duas marcações (`from`, `to`), tem rota e estilo próprios e pode ter anotações por camada, que descrevem a relação (um deep link, um evento disparado). Lê-se com `get_marking` (que devolve `kind: "arrow"`) e anota-se com `create_annotation` passando a referência dela em `marking`. Uma `ref` de campo continua sendo dado apontando para dado: não desenha seta nem aponta para marcação ou container.
- **Espaços.** Uma marcação vive num de dois espaços, e `space` (em `get_marking` e nas linhas de `list_markings`) diz qual: `"container"` (o `rect` em pixels do container, como acima) ou `"canvas"` (a marcação não está dentro de nenhum container; o `rect` está nas **unidades do canvas**, as mesmas do `placement` dos containers, e pode ser negativo). Uma marcação do canvas tem, em `get_marking`, `container: null` e o `path` começando por `Canvas`; a linha de `list_markings` traz `container: "Canvas"` (texto, sem `path`). Não compare `rect` de espaços diferentes.
- **Pertencimento: leia, não calcule.** Quem contém quem é decidido pela geometria na app, ao soltar cada gesto, e fica gravado. Você **lê**: `parent` é a marcação que contém esta (a mais interna); `members` lista os itens cujo pai é esta marcação (`markings` com `ref`, `name` e `rect`; `containers` com `ref` e `name`), com `markingsTotal`/`containersTotal` quando passa do limite; `children` são as filhas diretas no mesmo espaço; o `parent` de um container (em `get_container` e `get_project`) é a marcação do canvas que o contém. **Nunca** calcule interseção de retângulos para descobrir isso, e não tente escolher o pai: `parent` em `create_marking`/`update_marking` é aceito com aviso (`ignored-argument`) e ignorado.
- **Notas e tabelas flutuantes.** Um tipo que declara `floating: true` (a biblioteca de notas: `nota` e `tabela`) cria uma marcação **flutuante** (`floating: true`): vive só no canvas, nunca é filha nem mãe de nada e fica sobre tudo. Não é conteúdo do que está embaixo; é comentário, e a relação dela com as coisas é a seta. Com `near` em `create_marking` (referência de um container ou de uma marcação), ela nasce num lugar livre da margem do alvo.
- **O padrão "flutuante que aponta".** Uma tabela de analytics (ou qualquer nota estruturada) é uma marcação flutuante ligada ao elemento por uma seta; o dado está na anotação **dela**, não na do botão. Para achar: `get_marking` do botão, leia `arrows.outgoing` e `arrows.incoming` (cada uma traz a outra ponta em `to`/`from`), siga a ponta que é flutuante (`floating: true`) e leia as anotações dela. Para criar: `create_marking` com o tipo flutuante e `near` o botão, e `create_arrow` do botão para ela (ou ao contrário), tudo no mesmo lote, com apelidos `$nome`. Tipos com `appliesTo: ["arrow"]` anotam a seta em si; `appliesTo: ["marking"]` só marcações.
- **Camadas.** Cada anotação pertence a uma camada. Camadas **livres** guardam anotações livres; camadas **de especialização** (com `spec`) guardam as anotações tipadas daquele domínio.
- **Alcance da anotação.** Uma anotação vale só para a própria marcação; o contexto vem do `path` e do pai que `get_marking` devolve.
- **Vínculos.** Uma anotação pode ter uma **dona** (`owner`), na mesma marcação e em outra camada (ex: um evento `onClick` vinculado ao `Button`). `linked` lista as vinculadas e `linkTree` mostra a árvore.
- **Referências fortes.** Campos do tipo `ref` apontam para uma tupla, uma linha de tabela ou um campo de outra anotação. Em `refs` você vê para onde cada campo aponta; em `backlinks`, quem aponta para a anotação.
- **Pendências.** Anotação incompleta (`issues`): campo obrigatório vazio, valor inválido, referência quebrada, tipo inexistente etc. São calculadas na leitura, não gravadas.
- **Plataformas e código de instanciação.** O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define (relativo à raiz do `repo` da plataforma), `params` e `values` dizem como passar os campos, `notes` orienta. O repositório (`repo`) é da biblioteca, logo da **especialização**; o projeto só sobrepõe o clone local (`platformRepos[x].localPath`). Você lê o arquivo para saber a assinatura e escreve a chamada na solução; o mapeamento não guarda nada sobre a solução. `get_specialization` e `get_project` repetem isso em `codeHint` quando há plataformas. Veja "Do mapeamento ao código de instanciação".
- **Container com arquivo ou só com fundo.** Todo container tem `file` (o arquivo de imagem em `images/`, ou `null`) e `background` (cor `#RRGGBB`, ou `null`): um tem o arquivo, o outro tem a cor, nunca os dois nem nenhum. O container só com fundo (`file: null`) é onde se monta, por exemplo, uma tela de app, um painel ou um cartão com componentes. `get_container_file` nele falha com `container-without-file`; use `get_marking_image`. Um container com arquivo não tem `background` nem tamanho editáveis (`container-has-file`). No `mapping.json` o container está em `containers` e a marcação aponta para ele por `containerId`.
- **Ordem entre irmãs.** As irmãs (mesmo container e mesmo `parent`) são desenhadas na ordem da lista: `order` 0 fica por baixo. `move_marking` muda a posição.
- **Trava.** `lock.locked` indica marcação trancada; `lock.geometryLocked`, geometria travada (por ela ou por um ancestral trancado). Item trancado não pode ser movido, redimensionado nem excluído.

## Referências

Cada item devolvido traz uma referência no formato

```
mapping://<projeto>/<m|i|a>/<código> (<caminho legível>)
```

- `<projeto>` é o nome da pasta do projeto; `m` marcação, `i` container, `a` anotação, `p` **proposta** (ex: `mapping://cadastro/p/8c1f2d9e`). A letra `i` é o **container** (não mudou, para as referências já coladas continuarem valendo).
- `<código>` são os 8 primeiros caracteres hexadecimais do id (cresce de 4 em 4 se houver colisão).
- O caminho entre parênteses (ex: `cadastro.png › Formulário › Nome`) é só para leitura: o servidor o ignora.

Toda tool que recebe um item (`ref`) aceita: a referência completa (a que o dev cola do app com Ctrl+C), só `m/3f2a9c1e` com `project` informado, ou o id completo. Sem projeto na referência nem em `project`, o servidor procura em todos os projetos das raízes. Se o código for ambíguo, o erro `ambiguous-ref` devolve as candidatas: escolha uma pela referência completa.

## Fluxo típico

1. **`list_projects`** — projetos nas raízes (nome, `path`, contagens, especializações). Se dois projetos têm o mesmo nome, use o `path` (ou o `dir`) no parâmetro `project`.
2. **`get_project(project)`** — containers, camadas, especializações aplicadas e as pendências.
3. **`get_specialization(project, specId)`** — antes de interpretar anotações tipadas, leia o JSON completo da especialização: ele traz as descrições e orientações de cada tipo e campo e, na `formatVersion` 6, os tamanhos prontos de container (`containers`: `id`, `name`, `width`, `height`, `background?`, úteis para o `add_container`); com plataformas, o `codeHint` diz o que é o `code` dos tipos.
4. **`list_markings(project, …)`** — procure marcações por container, camada, tipo de anotação, `incomplete` ou texto (nome, chaves e valores; sem diferenciar acentos nem maiúsculas). A resposta é paginada (`limit`, `offset`; `truncated` e `nextOffset` indicam que há mais).
5. **`get_marking(ref)`** — o detalhe de uma marcação: caminho, container, `rect`, trava, filhas, e as anotações por camada (só as da própria marcação), vínculos, referências de saída e backlinks.
6. **`get_annotation(ref)`** / **`get_container(ref)`** — o detalhe de uma anotação ou de um container (`file`, `background`, o `path` absoluto do arquivo, se existir).
7. **`resolve(ref)`** — quando só há uma referência e não se sabe o que ela é.
8. **`get_marking_image(ref, …)`** — **veja** a marcação (ver "Vendo as imagens").
9. **`get_code_hints(ref, platform)`** / **`find_by_code(…)`** — as chamadas a escrever a partir do mapeamento e, de um arquivo ou símbolo, os tipos que ele instancia (ver "Do mapeamento ao código de instanciação").
10. **`plan_changes`** → **`propose_changes`** → **`get_proposal`** → **`get_proposal_review`** — para alterar o projeto: você propõe, o usuário revisa, você corrige com `supersedes` (ver "Alterando um projeto: propostas para revisão").
11. **`find_by_source`** / **`find_types_by_source`** / **`validate_specialization`** / **`validate_library`** — reexportações (casar por origem externa) e criação de especializações e de bibliotecas.
12. **`list_components`** / **`get_component`** — numa especialização `formatVersion` 4, os componentes (documento, campos, exemplos, `code`, `sources`, JSON do componente) sem abrir os arquivos do pacote.

Quando o dev cola uma referência no chat, chame `get_marking` (ou `resolve`) com ela: não é preciso informar o projeto.

## Vendo as imagens

As duas tools de imagem devolvem a **imagem** (conteúdo `image`) e, antes dela, um texto JSON que a descreve. Leia o texto: ele diz o que a imagem mostra.

- **`get_marking_image(ref, { padding, mode, outlineChildren, maxSize, format })`**
  - `mode: "crop"` (padrão): só o recorte da marcação, nos pixels do container. `padding` (em pixels do container, padrão 0) acrescenta contexto em volta; fica limitado às bordas dele.
  - `mode: "context"`: o container inteiro, com a marcação contornada em magenta (`#FF00FF`). Use para entender **onde** a marcação está.
  - `outlineChildren: true`: contorna as filhas diretas, cada uma com uma cor, e devolve `childrenLegend` (cor → nome → referência → `rect`). Use a legenda para ligar o que você vê às marcações filhas (e a `get_marking` de cada uma). Passando de 24 filhas, as demais não são contornadas (`childrenNotOutlined`).
  - `maxSize` (padrão 1568, entre 64 e 4096) limita o lado maior da imagem devolvida; a imagem nunca é ampliada. Uma marcação pequena sai no tamanho real: use `padding` para ver o entorno.
  - `format`: `png` (padrão, sem perdas: bom para telas e texto), `jpeg` (padrão se o arquivo original é JPEG) ou `webp`.
  - Num **container só com fundo** o recorte é o **desenho simplificado** dos componentes (`drawing: "simplified"`): texto em barras e cores sólidas, sem fontes, gradientes nem sombras. Confira posição, tamanho e hierarquia, não o acabamento.
- **`get_container_file(ref, { maxSize, format })`** — a imagem inteira de um container que tem arquivo, reduzida se passar de `maxSize`. Cabendo e sem pedir outro formato, é o arquivo original. Num container só com fundo falha com `container-without-file`.

**`url` e `markdown`** (nas duas tools, a menos que o servidor rode com `--no-http`) acompanham o conteúdo `image` no texto JSON: `url` é um endereço `http://127.0.0.1:<porta>/<token>/<chave>.<ext>` e `markdown` é `![nome](url)`, pronto para colar. A imagem fica só em memória no servidor e a `url` vale enquanto o processo do servidor MCP roda, só neste computador (ao reiniciar o cliente, as imagens de um chat antigo deixam de carregar). Use quando o seu cliente não mostra a imagem no chat (como o Cursor): cole o `markdown` na resposta para o usuário ver o recorte. Os mesmos bytes dão a mesma URL.

No texto: `container` diz de qual container é o recorte (`ref`, `file`, `background`); `region` é a parte do container que aparece (em pixels do container), `scale` o fator de redução e `markingInOutput` onde a marcação ficou, **em pixels da imagem devolvida** (o contorno de uma filha usa a mesma conversão: `(x - region.x) × scale`). Se o arquivo tiver dimensões diferentes das do `mapping.json`, as coordenadas são ajustadas na proporção e vem um `warning`.

## Alterando um projeto: propostas para revisão

**Você nunca grava o projeto.** Toda alteração (a primeira importação, uma atualização, uma correção) chega ao usuário como uma **proposta**, uma espécie de pull request dentro da ferramenta: ele vê o projeto como ficaria, aceita ou rejeita em qualquer nível (proposta, container, item ou mudança), deixa notas no que rejeitou e aplica o que aceitou. Só a app grava o `mapping.json`.

### O fluxo

1. **Leia o projeto** (`get_project`, `list_markings`, `get_marking`, `get_specialization`). Em reexportações, procure o que já existe com `find_by_source` (ver "Reexportações").
2. **`plan_changes(project, operations[])`** (opcional) valida o lote contra as regras do Mapping (as mesmas da app) **sem gravar nada** e devolve:
   - `valid` e, se houver, `errors` por operação (`index`, `op`, `code`, `message`);
   - `summary`: uma linha legível por operação válida;
   - `changes`: quantos itens serão criados, alterados e excluídos por coleção, e `reviewChanges`: quantas mudanças o usuário terá de revisar;
   - `issues`: pendências antes e depois, e as anotações que ficam incompletas (`new`);
   - `warnings` (só se houver): avisos das operações, como os do validador de um pacote de biblioteca (`library-warning`);
   - `created`: as referências `mapping://` dos itens que serão criados (as definitivas), com o apelido de cada um.
3. **`propose_changes(project, title, operations[], { description?, origin?, author?, supersedes? })`** faz a mesma validação e **grava a proposta** em `proposals/<id>/proposal.json` (imagens novas em `proposals/<id>/images/`). Um lote com qualquer erro não grava nada: corrija e mande o lote inteiro de novo. A resposta traz:
   - `proposal.ref`: a referência `mapping://<projeto>/p/<código>`; guarde-a;
   - `reviewChanges` (criações, alterações, remoções) e `levels`: o resumo por nível (Projeto e uma linha por container em `levels.containers`, com `change` `new`/`removed`/`changed`/`items` e quantos itens e mudanças);
   - `created`: as referências **definitivas** dos itens criados, por apelido. Elas só passam a existir no projeto depois que o usuário aceitar e aplicar;
   - `warnings` (se houver) e `superseded` (com `supersedes`).
4. **Avise o usuário**: a proposta espera a revisão dele na app (janela Propostas). Diga o título, o que a proposta faz e a referência. Não grave mais nada nesse meio-tempo.
5. **Espere a revisão terminar.** Consulte `get_proposal(ref)` (ou `list_proposals`): a revisão terminou quando `progress.complete` é `true`, isto é, **nada pendente (`pending`) nem aceito sem aplicar (`accepted`)**. Se não terminou, avise o usuário e espere; não substitua a proposta antes.
6. **`get_proposal_review(ref)`** devolve só o que importa para a próxima rodada, de forma compacta:
   - `rejected`: as mudanças rejeitadas, cada uma com o alvo (referência), `field`, `from`/`to` e as `notes` do usuário. `via` aponta a criação de que a mudança dependia (rejeitada junto: não é uma decisão separada);
   - `notes`: as notas gerais (proposta, projeto, container, item; o `level` de uma nota de container é `image`, o nome gravado no `proposal.json`), com o alvo;
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

Containers e marcações têm um `source` opcional (`{ "system", "id", "url" }`): a identidade do elemento no sistema de origem (ex: `figma` e o id do frame). O núcleo não interpreta `system`; é só um texto que você escolhe e repete.

- **Na primeira importação**, ponha `source` em todo container (`add_container`) e marcação (`create_marking`) criada. Os ids do Mapping são novos; o `source` é o que permite reconhecer os mesmos elementos depois.
- **Na reexportação**, para cada elemento da origem chame `find_by_source({ project, system, id })`: se existe, **atualize** (`update_marking`, `update_container`, `replace_container`) em vez de criar de novo; se não existe, crie com o mesmo `source`. Remova (`delete_*`) só o que sumiu da origem e que o usuário espera ver removido.
- **Proponha só o que mudou.** A proposta já só traz as diferenças campo a campo (nome igual, posição igual = nenhuma mudança; repetir o `rect` atual, ou `move` 0,0, num item trancado também não é mudança e passa), e uma reexportação idêntica é recusada (`no-changes`). Mesmo assim, não reenvie imagens que não mudaram: um `replace_container` com o mesmo conteúdo ainda gera uma mudança de arquivo.
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
- **Aplicar e atualizar vão pela proposta.** `apply_specialization` (primeira vez) e `update_specialization` (versão maior de uma já aplicada) aceitam em `file` a **pasta** do pacote, ou o arquivo da especialização dentro dela (arquivos v1 a v3 continuam indo só pelo arquivo). O servidor valida o pacote com os mesmos níveis de `validate_library` (com a cópia aplicada como `previous` na atualização): **erro** recusa a operação com `invalid-library` (a resposta traz os primeiros erros, com `file` e `path`); **aviso** deixa seguir e volta em `warnings` (`code: "library-warning"`). Os arquivos do pacote, inclusive as fontes, esperam em `proposals/<id>/specs/<pasta>/…`; quando a pessoa aceita e aplica, a app copia a pasta para `specs/<pasta>/`. O servidor nunca grava `specs/` nem o `mapping.json`. Depois de aplicada, `list_components` e `get_component` com `project` + `specId` leem a cópia (`specs/<id>/`), e `get_specialization` lista os arquivos dela em `package`.
- **Ler antes de montar:** para saber como usar um componente, `get_component` devolve o documento, os campos, os exemplos, o `code` e as `sources` do tipo de uma vez.

### Evoluindo uma biblioteca já aplicada

Subir a `version` de uma biblioteca mexe nos projetos que a aplicaram: as anotações já existem, com `values` pelas `key` dos campos. As regras:

- **Prefira mudança aditiva** (tipo, campo opcional, opção de `enum`, componente, documento, exemplo ou fonte novos, ou só o desenho): ela atualiza sem migração e sem diálogo de impacto, e nada se perde.
- **Declare `migrations` para toda quebra** (remover ou renomear tipo, campo ou opção; tornar um campo obrigatório; mudar o `type`). Cada quebra precisa de um passo (`rename-type`, `remove-type`, `rename-field`, `remove-field`, `map-values`, `fill-field`) na entrada que liga a versão aplicada à nova; sem ele a atualização é recusada. Quem **renomeia** declara `rename-*`: sem o passo, o renome é só uma remoção e os valores se perdem.
- **Valide antes de propor:** `validate_library({ path, previous })` com o arquivo da cópia aplicada (`specs/<pasta>/<arquivo>.spec.json` do projeto) em `previous`, e depois `plan_library_update({ project, path })`. Ele não grava nada e responde o que a atualização faria **neste projeto**: `decision` (`apply`, `update` ou `not-newer`), `validation`, `additive`, `refused` com `missingMigrations`, os `steps` (contagens por passo), as `losses`, as `pending`, `brokenRefs` e as camadas novas ou liberadas, com uma `hint` do próximo passo.
- **Nunca apague um tipo em uso sem `convert`.** `remove-type` com `mode: "delete"` apaga as anotações do tipo e as vinculadas a elas: use só com a confirmação explícita da pessoa. Qualquer `losses` no plano (valor apagado, sobrescrito ou trocado pelo padrão, anotação apagada) também pede confirmação **antes** de propor, e a proposta diz o que se perde.
- **A atualização vai pela proposta e pela revisão:** `propose_changes` com `update_specialization` e `file` da pasta nova. A descrição da operação resume a migração (passos, valores alterados, anotações convertidas ou apagadas, valores perdidos, pendências), e a proposta traz também as mudanças de cada anotação migrada (`values.<campo>`), para a pessoa conferir uma a uma.

**Adicionar um componente e uma propriedade** (aditivo): copie a pasta aplicada, suba a `version`, acrescente o tipo (com o `component`, o `doc` e os exemplos dele) e o campo **opcional** novo no tipo existente (e use-o no desenho, para não sobrar aviso); não escreva `migrations`. `validate_library` com `previous` deve dar `valid: true`; `plan_library_update` deve dar `additive: true`, sem `steps`, `losses` nem `pending`; então `propose_changes` com `update_specialization`.

**Renomear um campo** (quebra com migração): suba a `version`, troque a `key` no tipo, no desenho, no `preview` e nos exemplos e declare `{ "from": <aplicada>, "to": <nova>, "steps": [{ "op": "rename-field", "type": "<tipo>", "from": "<chave antiga>", "to": "<chave nova>" }] }`. No `plan_library_update`, o passo mostra quantas anotações e valores seguem o campo novo (`values`) e `losses` deve vir vazio; se vier, confira se o renome está declarado. Referências (`ref`) a campos renomeados são reescritas pelo passo.

### Apelidos

Um item criado no lote pode ser citado nas operações seguintes por um **apelido** (`"as": "$porta"`). Assim marcação, anotação e evento vinculado saem numa chamada só:

```json
[
  {
    "op": "create_marking",
    "as": "$botao",
    "container": "i/3f2a9c1e",
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

Onde uma operação pede um item (`container`, `marking`, `parent`, `annotation`, `owner`, `annotation` de uma referência), vale a referência completa, `m/código`, o id ou o apelido. Camadas: id, nome, `specId/layerId` ou apelido (`create_layer` aceita `as`). Tipos: `specId/typeId`, `typeId` ou o nome do tipo.

### Operações

| `op`                    | Campos                                                                                                                                   | Observações                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_platform_repo`     | `platform`, `localPath`                                                                                                                  | Clone local da plataforma (ver "Repositórios por plataforma"); `null` ou vazio remove. `urlTemplate` falha com `unknown-field`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `remove_platform_repo`  | `platform`                                                                                                                               | Remove o clone local da plataforma.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `create_layer`          | `name`, `color?`, `as?`                                                                                                                  | Camada livre; cor padrão: a próxima da paleta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `update_layer`          | `layer`, `name?`, `color?`                                                                                                               | Camada de especialização não é renomeada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `move_layer`            | `layer`, `index`                                                                                                                         | Reordena (0 = primeira).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `delete_layer`          | `layer`                                                                                                                                  | Exclui as anotações dela e as vinculadas a elas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apply_specialization`  | `file`                                                                                                                                   | Especialização dentro das raízes: o JSON (v1 a v3; a cópia vai para `specs/`) ou, na `formatVersion` 4, a **pasta** do pacote (ou o arquivo da especialização dentro dela); o pacote é validado e a pasta vai na proposta.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `update_specialization` | `file`                                                                                                                                   | Versão maior de uma já aplicada (arquivo ou, na v4, a pasta do pacote). Executa as `migrations` da versão nova nas anotações; quebra sem migração falha com `spec-missing-migrations`. Veja "Evoluindo uma biblioteca já aplicada".                                                                                                                                                                                                                                                                                                                                                                                                          |
| `remove_specialization` | `specId`, `mode`                                                                                                                         | `delete` (apaga camadas e anotações) ou `convert` (viram livres).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `add_container`         | `file` ou `base64`, `fileName?`; ou `width`, `height`, `background`; `name?`, `source?`, `center?`, `as?`                                | Cria um container. **Ou** tem arquivo (`file`/`base64`: PNG, JPEG ou WebP, a largura e a altura vêm do arquivo gravado; mesma otimização da app, abaixo) **ou** só fundo (`width` e `height` de 1 a 20000 px, `background` `#RRGGBB`); os dois grupos juntos falham com `invalid-arguments` ("ambígua") e a falta de campos também. `source`: `{system, id, url?}`. Exemplos: `{ "op": "add_container", "name": "Cadastro", "width": 390, "height": 844, "background": "#FFFFFF", "as": "$cadastro" }` e `{ "op": "add_container", "file": "fontes/tela1.png", "name": "Checkout", "as": "$t1" }`.                                           |
| `update_container`      | `container`, `name?`, `source?`, `x?`, `y?`, `scale?`, `markingColor?`, `locked?`, `markingsLocked?`, `background?`, `width?`, `height?` | `markingsLocked` tranca ou destranca todas as marcações do container. `source: null` limpa a origem. `background`, `width` e `height` só valem num container sem arquivo (com arquivo: `container-has-file`); mudar o tamanho exige que as marcações continuem dentro.                                                                                                                                                                                                                                                                                                                                                                       |
| `replace_container`     | `container`, `file` ou `base64`, `fileName?`, `source?`, `confirmAspectChange?`                                                          | Troca o arquivo de imagem do container. Marcações reescaladas; com outra proporção, exige a confirmação e ficam "a revisar". Omitido, `source` é mantido. Num container sem arquivo falha com `container-without-file`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `delete_container`      | `container`                                                                                                                              | Com as marcações e anotações dele.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `add_image`             | `file` ou `base64`, `fileName?`, `name?`, `source?`, `center?`, `as?`                                                                    | **Antiga**, aceita com aviso (`deprecated-op`: "use add_container com `file`"); o mesmo efeito de `add_container` com arquivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `add_blank_image`       | `width`, `height`, `background`, `name?`, `source?`, `center?`, `as?`                                                                    | **Antiga**, aceita com aviso (`deprecated-op`: "use add_container"); os mesmos campos e o mesmo efeito de `add_container` com fundo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `update_image`          | `image` e os campos de `update_container`                                                                                                | **Antiga**, aceita com aviso: use `update_container` (o argumento `image` virou `container`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `replace_image`         | `image` e os campos de `replace_container`                                                                                               | **Antiga**, aceita com aviso: use `replace_container`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `delete_image`          | `image`                                                                                                                                  | **Antiga**, aceita com aviso: use `delete_container`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `create_marking`        | `container`, `rect?`, `near?`, `name?`, `source?`, `parent?`, `annotation?`, `annotationAs?`, `as?`                                      | `rect` em pixels do container. O argumento antigo `image` ainda vale (com aviso `deprecated-op`); informar os dois falha com `invalid-arguments`. Sem `container`, a marcação nasce no **canvas** (`rect` em unidades do canvas, pode ser negativo); com `container`, ela entra no espaço dele, e o pai é derivado da geometria (a mais interna que a contém). `parent` é aceito com aviso `ignored-argument` e ignorado. `near`: só para tipo flutuante. `annotation: { type, name?, values? }` cria também a anotação tipada; se o tipo tem componente, `rect` é opcional e vale o `minSize` (veja "Montar um container com componentes"). |
| `move_marking`          | `marking`, `index`                                                                                                                       | Posição entre as irmãs (0 = a primeira, desenhada por baixo). Não é geometria: a trava não impede.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `update_marking`        | `marking`, `name?`, `source?`, `rect?`, `move?`, `container?`, `floating?`, `parent?`, `locked?`, `confirmReview?`                       | `rect` redimensiona (as filhas ficam onde estão; numa marcação que desenha um componente, respeita o `minSize` dele); `move: {dx, dy}` desloca com as filhas. `container` (referência, id ou apelido, ou `null` para o canvas), junto de `rect` nos pixels do novo container (no canvas, em unidades do canvas), troca o espaço da marcação; as descendentes ficam onde estão e o assentar recalcula espaço e pai pela geometria. `floating: true` passa a marcação ao canvas como flutuante (exige geometria destrancada); numa flutuante, `container` não nulo falha. `parent` é aceito com aviso e ignorado.                              |
| `delete_marking`        | `marking`                                                                                                                                | Com as descendentes e as anotações.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `create_arrow`          | `from`, `to`, `style?`, `name?`, `as?`                                                                                                   | Cria uma seta entre duas marcações (nunca outra seta nem um container; `arrow-endpoint`, `arrow-self`). `style`: `straight`, `curve` (padrão) ou `elbow`. Nunca `points`: a rota é da pessoa (`invalid-arguments`). A seta é uma marcação que aponta: anota-se como uma marcação (`create_annotation` com a referência dela em `marking`).                                                                                                                                                                                                                                                                                                   |
| `update_arrow`          | `arrow`, `name?`, `style?`, `locked?`                                                                                                    | Recusa `points`. A proposta só leva a criação e a remoção de setas: nome, estilo e trava de uma seta que já existe valem na prévia do lote e vêm com aviso `ignored-argument`; numa seta criada no mesmo lote, a criação já leva os valores finais.                                                                                                                                                                                                                                                                                                                                                                                          |
| `delete_arrow`          | `arrow`                                                                                                                                  | Exclui a seta e as anotações dela (`locked` se trancada). Apagar uma marcação ou um container já leva as setas presas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `create_annotation`     | `marking`, `type?`, `layer?`, `name?`, `entries?`, `values?`, `owner?`, `as?`                                                            | Sem `type`: livre, com `layer` e `entries`. Com `type`: tipada, na camada do tipo, com `values`. `inherit` antigo: aceito e ignorado, com aviso, por uma versão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `update_annotation`     | `annotation`, `name?`, `entries?`, `values?`, `owner?`                                                                                   | `entries` substitui os pares (a mesma chave mantém o id); `values` muda só os campos informados. `inherit` antigo: aceito e ignorado, com aviso, por uma versão.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `delete_annotation`     | `annotation`                                                                                                                             | Com as vinculadas a ela.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Valores tipados** (`values`): por `key` do campo (veja `get_specialization`); `null` limpa.

- Campo `table`: a lista de linhas, que **substitui** a tabela. `{"_id": "…"}` mantém uma linha existente (com as células informadas alteradas); `"_as": "$linha"` dá um apelido à linha, para uma referência no mesmo lote.
- Chave que não é campo do tipo: falha com `unknown-field` (veja os campos em `get_specialization`).
- Campo `ref`: `{"annotation": "$user", "entry": "name"}` (par de anotação livre, pela chave ou id), `{"annotation": "$contato", "key": "atributos", "row": "$linha"}` (linha de tabela, pelo id, apelido ou índice) ou `{"annotation": "…", "key": "id"}` (campo).

**Imagens.** Como na app: a orientação EXIF é aplicada, o lado maior fica em no máximo 2560 px e o arquivo é recodificado em WebP (sem perdas para PNG; com perdas, qualidade 0,85, para fotos), sem metadados. Sem redução nem rotação, o original é mantido se o WebP não ficar menor. `width` e `height` do container com arquivo (e as coordenadas das marcações) são os do arquivo gravado. O nome em `images/` nunca sobrescreve um arquivo existente (`foto-2.webp`…). `file` é relativo à pasta do projeto ou a uma raiz, ou absoluto dentro das raízes.

**Travas.** Item trancado não é movido, redimensionado, trocado nem excluído (`locked`): destranque na mesma operação (`"locked": false` é aplicado primeiro; `true`, por último) ou numa anterior. Nome e anotações seguem livres. Repetir a geometria atual (`rect` igual ao atual, `move: {dx: 0, dy: 0}`) não é mudança e passa mesmo trancado, então a reexportação completa pode repetir o `rect` de tudo.

### Montar um container com componentes

Uma biblioteca (especialização `formatVersion` 4, aplicada pela app ou por proposta) traz componentes: tipos de anotação que a app **desenha** na marcação. Num container sem arquivo, o desenho é o conteúdo (uma tela de app, um painel, um cartão); o agente monta o container por proposta e a pessoa revisa.

1. **Escolha os componentes.** `list_components({ project, specId })` lista os tipos com componente (`size`, `minSize`, se tem slot) e `get_component({ project, specId, type })` traz o documento, os `fields` e os exemplos de `values`. Use os `values` dos exemplos como ponto de partida.
2. **Crie o container.** `add_container` com o tamanho (ex.: 390 × 844 para uma tela de celular; a especialização pode trazer tamanhos prontos em `containers`, veja `get_specialization`) e o `background`; dê o apelido `as` (`"$tela"`). O container só aceita marcações dentro dele.
3. **Crie as instâncias.** `create_marking` com `annotation: { type: "specId/typeId", values: { … } }`. Sem `rect`, a marcação nasce no tamanho inicial do componente, no centro do container, ou dentro do slot do `parent`, depois da última filha. Use `annotationAs` para citar a anotação depois (por exemplo num campo `ref`).
4. **Componente com slot e filhas.** Crie primeiro o componente com slot (a marcação cujo componente tem `slot`, como `Column` ou `Card`) e dê um apelido; depois crie cada filha com `parent: "$pai"`. A filha precisa ficar **inteira dentro do slot** do pai; informe o `rect` da filha quando quiser uma posição específica.
5. **Ordem.** As irmãs são desenhadas na ordem em que foram criadas no lote (a última por cima); `move_marking` reordena quando precisar. Criar na ordem certa dispensa o `move_marking`.
6. **Confira.** `plan_changes` valida; depois `propose_changes` e, com a proposta aplicada (ou numa cópia), `get_marking_image` de cada instância (ou `mode: "context"` do container) mostra o desenho simplificado. Se algo não coube, ajuste `rect` ou `values` e envie outra proposta com `supersedes`.
7. **Proponha e aguarde a revisão.** O fluxo é o de sempre ("Alterando um projeto"): o agente nunca grava o projeto; a pessoa revisa, aceita e aplica.

Regras:

- **O servidor nunca arruma.** Os retângulos dos filhos são os que você informou. Quem recalcula as posições pelo `layout` do slot é a pessoa, com **Arrumar** na app. Posicione as filhas do jeito mais próximo do que o `layout` produziria e diga na descrição da proposta que a pessoa pode usar Arrumar.
- **Componentes de primeiro nível sem `rect` nascem todos no centro do container, sobrepostos.** Para preencher o container, crie um componente com slot `Column` cobrindo-o e ponha os componentes dentro dele, sem `rect` (entram um depois do outro, no eixo do layout), ou passe o `rect` de cada um.
- **Respeite o `minSize`.** Um `rect` menor que o `minSize` do componente falha com `rect-too-small` (a mensagem traz o mínimo); vale também no `update_marking` com `rect`.
- **Não grave nada de desenho.** Cores, formas e textos do componente vêm do pacote da biblioteca e dos `values`; o projeto guarda só a marcação, o `rect` e a anotação tipada.
- **Tipo sem componente** (ou biblioteca não aplicada na app) é uma marcação comum: `rect` é obrigatório e nada é desenhado.
- Uma biblioteca aplicada por proposta (`apply_specialization` com a **pasta** do pacote) traz os componentes como a aplicada pela app; uma especialização v1 a v3 aplicada por arquivo não tem componentes.

## Lendo uma anotação

- Anotação **livre**: `entries` é a lista de pares `{id, key, value}` (os valores são texto).
- Anotação **tipada**: `type` (`specId`, `typeId`, `name`) e `values`, com os valores nativos de JSON (números como número, datas em ISO, tabelas como lista de linhas com `_id`). Os campos `ref` aparecem em `values` como objetos com o id do alvo; o campo `refs` da resposta os resolve em texto (`to: "User.name"`) e na referência da anotação alvo.
- `title` é o rótulo que a app mostra (ex: `Classe · Contato`, `Input · input_nome`).
- **Nota** (anotação do tipo `nota`, da biblioteca de notas): `titulo` (opcional) e `texto`, escritos por uma pessoa num post-it **flutuante** (`floating: true` na marcação: vive no canvas, sem container e sem pai). É **comentário humano**: contexto (por que a tela existe, uma regra de negócio, um recado), não especificação de interface; leia-a para entender, não a transforme em componente nem em código. `create_project` já traz a camada Notas (`notes: false` dispensa).

## Do mapeamento ao código de instanciação

Quando o projeto aplica uma especialização com **plataformas** (veja `platforms` em `get_project`), cada tipo pode dizer **com que código se cria uma instância dele** em cada uma: é o `code` do tipo. O `symbol` é o que se chama (um composable, uma view, uma classe, a função do BFF que gera o JSON da tela); o `path` é o arquivo que define o `symbol`, para você ler a assinatura antes de chamá-lo; `params` e `values` dizem como passar cada campo; `notes` orienta. A tela marcada é a **especificação**; a solução é o que você escreve no repositório da plataforma, com as suas ferramentas. O mapeamento não sabe onde a solução está nem o que você escreveu.

### Fluxo: escrever a solução a partir de uma tela

1. **Receba a referência** `mapping://…/m/…` (o dev a cola do app) e chame **`get_marking(ref, { platform })`** e **`get_marking_image(ref)`**: o primeiro dá as anotações e o `code` de cada tipo; o segundo, o que a tela parece.
2. **`get_code_hints(ref, platform)`** devolve as **chamadas a escrever**, em três partes:
   - `types`: o código de instanciação de cada tipo usado na árvore, **uma vez só**, por `specId/typeId`: `name`, `symbol`, `definition`, `params`, `values` e `notes`. `symbol: null` não aparece aqui: o tipo **não tem `code`** nessa plataforma e vai para `unmappedTypes`;
   - `repos`: por plataforma, o `url` e a `ref` do repositório (da especialização) e o `localPath` do clone local (do projeto); vazio se não houver nenhum dos dois;
   - `tree`: a árvore que espelha a marcação e as descendentes. Cada anotação traz `type` (a chave de `types`), `label`, `layer`, `args`, `values` e `linked`.
3. **Abra a `definition` de cada tipo** que você vai usar. Se `exists` é `true`, leia o arquivo em `localFile` (relativo ao diretório de trabalho do cliente); senão, abra a `url` (o arquivo no repositório da especialização, na `ref` dela). Leia a assinatura do `symbol` antes de chamá-lo.
4. **Escreva as chamadas** na solução, uma por anotação da árvore: `args` é `{ field, name, value }`, com o **nome do parâmetro** no código e o valor **já traduzido** (o enum `primary` vira o `ButtonStyle.Primary`). Campo que não está em `args` não é passado. Respeite as `notes` do tipo (elas costumam dizer detalhes como "use o valor do campo id") e o `linked`: as anotações vinculadas ficam sob a dona (o `onClick` sob o `Button`) e entram na chamada dela do jeito que as `notes` mandarem. `values` são os valores como estão no mapeamento (sem traduzir), com os `ref` resolvidos pelo rótulo do alvo (ex.: `dado: "User.name"`).
5. O servidor **não lê nem grava código**. Se você tem o clone do repositório da plataforma fora do caminho esperado, proponha um `set_platform_repo` com `localPath` (ver "Repositórios por plataforma"); sem clone, a `url` basta.

Exemplo: o `Button` do formulário na plataforma `android` (`get_code_hints("mapping://cadastro/m/2f7c4a1d", "android")`):

```json
{
  "marking": "mapping://cadastro/m/2f7c4a1d (cadastro.png › Formulário › Cadastrar)",
  "platform": { "id": "android", "name": "Android", "language": "kotlin" },
  "repos": {
    "android": {
      "url": "https://github.com/org/app-android",
      "ref": "v3",
      "localPath": "../../.."
    }
  },
  "types": {
    "sdui/button": {
      "name": "Button",
      "symbol": "com.app.ds.DSButton",
      "definition": {
        "path": "app/src/main/java/com/app/ds/DSButton.kt",
        "url": "https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt",
        "ref": "v3",
        "localFile": "app/src/main/java/com/app/ds/DSButton.kt",
        "exists": true
      },
      "params": { "texto": "text", "estilo": "style", "habilitado": "enabled" },
      "values": { "estilo": { "primary": "ButtonStyle.Primary" } },
      "notes": "Use o modifier de testTag com o valor do campo id."
    },
    "sdui/onClick": {
      "name": "onClick",
      "symbol": "com.app.ds.OnClick",
      "definition": null,
      "params": { "acao": "action" },
      "notes": "Associe o evento ao componente dono por meio do parâmetro onClick."
    }
  },
  "tree": {
    "ref": "mapping://cadastro/m/2f7c4a1d (cadastro.png › Formulário › Cadastrar)",
    "name": "Cadastrar",
    "rect": { "x": 40, "y": 900, "width": 300, "height": 80 },
    "annotations": [
      {
        "ref": "a/5b2e91c0",
        "type": "sdui/button",
        "label": "Button btn_cadastrar",
        "layer": "SDUI",
        "args": [
          { "field": "texto", "name": "text", "value": "Cadastrar" },
          { "field": "estilo", "name": "style", "value": "ButtonStyle.Primary" },
          { "field": "habilitado", "name": "enabled", "value": "true" }
        ],
        "values": {
          "id": "btn_cadastrar",
          "texto": "Cadastrar",
          "estilo": "primary",
          "habilitado": "sim"
        },
        "linked": [
          {
            "ref": "a/7d41c2e8",
            "type": "sdui/onClick",
            "label": "onClick submit",
            "layer": "Eventos",
            "args": [{ "field": "acao", "name": "action", "value": "submit" }],
            "values": { "acao": "submit" }
          }
        ]
      }
    ]
  }
}
```

A chamada a escrever sai de `types` (o `symbol` e como passar cada campo) e de `args` (os valores desta instância): `DSButton(text = "Cadastrar", style = ButtonStyle.Primary, enabled = true, onClick = OnClick(action = "submit"))`, com o `testTag` do `id` que as `notes` pedem. O que o exemplo mostra para o `onClick` vale para todo tipo sem `path`: `definition` é `null`, e o `symbol` é tudo o que o `code` diz (aqui, você acha a assinatura no repositório pelo nome). Na plataforma `bff`, o mesmo formulário dá as funções que **geram o JSON da tela** (`com.app.bff.sdui.button`, com o `path` do arquivo que a define), e a chamada a escrever é a dessas funções.

### O `code` de um tipo: o `symbol` e o arquivo que o define

Em `get_marking`, `get_annotation`, `find_by_code` e `get_component`, o `code` do tipo vem por plataforma (`code.<plataforma>`) na **mesma forma** de `types`, sem `name`: `{ symbol, definition, params?, values?, notes? }`. `get_marking(ref, { platform })` mostra só a plataforma pedida.

```json
{
  "android": {
    "symbol": "com.app.ds.DSButton",
    "definition": {
      "path": "app/src/main/java/com/app/ds/DSButton.kt",
      "url": "https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt",
      "ref": "v3",
      "localFile": "app/src/main/java/com/app/ds/DSButton.kt",
      "exists": true
    },
    "params": { "texto": "text", "estilo": "style" }
  }
}
```

- `definition` é o **arquivo que define o `symbol`**, ou `null` quando o `code` não informa `path`.
- `path` é relativo à **raiz do repositório da plataforma**, com `/`. O repositório é da biblioteca: está na especialização (`platforms[].repo`, que `get_specialization` e `get_project` mostram).
- `url` e `ref` vêm do `repo` da especialização: `url` é montada pelo `urlTemplate` dele (`null` sem ele; o caminho não tem linha, então o trecho `#…{line}` do template sai) e `ref` é a revisão da biblioteca a que o `code` corresponde (`null` se não informada).
- `localFile` e `exists` vêm da sobreposição local do projeto. `localFile` é o caminho **relativo ao diretório de trabalho do cliente** (o repositório, no Claude Code), calculado com o `localPath` da plataforma; `exists` diz se o arquivo está lá (o servidor só confere, não o lê). Sem `localPath`, os dois são `null`. Se o `localPath` leva para fora do diretório de trabalho, vêm `null` e `localFileProblem: "outside-workdir"`: por segurança, o servidor não confere (nem revela) o que está fora.
- Num `get_component` por `path` (pacote sem projeto), `localFile` e `exists` são sempre `null`: não há projeto para dizer onde fica o clone.

### `find_by_code`: de um arquivo ou símbolo para o mapeamento

`find_by_code({ project?, path?, symbol? })` responde: **que tipos se instanciam com este arquivo ou símbolo, e onde estão marcados**. Acha os **tipos** das especializações aplicadas cujo `code` tem esse `path` (`code.<plataforma>.path`) ou `symbol` (`code.<plataforma>.symbol`) e as **anotações desses tipos**. Serve para quem está num arquivo da biblioteca e quer saber o que dele aparece nas telas. `path` casa com o caminho inteiro ou com os **últimos segmentos inteiros** (`DSButton.kt` acha `app/…/DSButton.kt`; `Button.kt` não); `symbol`, por igualdade; informando os dois, a **mesma plataforma** precisa casar com ambos. Sem `project`, procura em todos os projetos das raízes. Sem `path` nem `symbol` falha com `missing-query`.

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
          "definition": {
            "path": "app/src/main/java/com/app/ds/DSButton.kt",
            "url": "https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt",
            "ref": "v3",
            "localFile": "app/src/main/java/com/app/ds/DSButton.kt",
            "exists": true
          }
        }
      },
      "annotationCount": 1,
      "annotations": [
        {
          "annotation": "mapping://cadastro/a/5b2e91c0 (cadastro.png › Formulário › Cadastrar › Button btn_cadastrar)",
          "title": "Button btn_cadastrar",
          "marking": "mapping://cadastro/m/2f7c4a1d (cadastro.png › Formulário › Cadastrar)",
          "markingName": "Cadastrar",
          "container": "mapping://cadastro/i/9d0e3b77 (cadastro.png)"
        }
      ]
    }
  ]
}
```

- `total` conta os tipos encontrados; `annotationTotal`, as anotações deles. `code` traz só as plataformas que casaram. Um tipo sem anotações vem com `annotations: []`.
- No máximo 200 anotações voltam, somando todos os tipos (`returned`; `truncated: true` quando houve corte); `annotationCount` de cada tipo é sempre o total dele.

### Repositórios por plataforma

O **repositório é da biblioteca**: cada especialização declara o da própria biblioteca em `platforms[].repo` (`url`, `urlTemplate?`, `ref?`), e é dele que vêm a `url` e a `ref` de toda `definition`. O **projeto só sobrepõe o lugar local**: `platformRepos[<plataforma>].localPath`, a raiz do clone, relativa à pasta do projeto. `get_project` mostra, em cada plataforma, os `repos` das especializações (`specId`, `url`, `urlTemplate?`, `ref?`) e o `localPath` (ou `null`).

- `set_platform_repo { platform, localPath }` informa o clone local (`null` ou vazio remove); `remove_platform_repo { platform }` o remove. `localPath` é relativo à pasta do projeto (ex.: `../../..`). Com `localPath` informado, `definition.localFile` e `exists` passam a aparecer.
- `urlTemplate` no lote **falha com `unknown-field`**: o endereço vem da especialização. Para mudar o repositório de uma biblioteca, atualize a especialização (`platforms[].repo`).
- Plataforma sem clone local **não é problema**: abra a `definition.url`. Não há aviso nem pendência por isso.

```json
[{ "op": "set_platform_repo", "platform": "ios", "localPath": "../../.." }]
```

### O que o servidor nunca faz

Nunca **lê nem grava arquivos de código**: só monta o caminho e confere se o arquivo existe (e só dentro do diretório de trabalho do cliente). Quem lê, cria e edita o código é você, com as suas ferramentas.

### Mudança na versão 0.10.0 (Sugestões no campo de texto)

A especialização `formatVersion` 8 deixa um campo ou coluna `string` trazer `suggestions`, uma lista de textos sugeridos ao digitar (o `get_specialization` devolve a chave; nenhuma tool nova). **É o vocabulário preferido, não uma restrição:** ao preencher um campo `string` com `suggestions`, escreva exatamente como na lista quando o valor couber nela (`Int`, não `int` nem `Integer`), e escreva livremente quando não couber (`String?`, `List<Endereco>`). Texto fora da lista não é erro nem pendência. Para valores fechados o tipo usa `enum`, e aí só vale uma das `options`. Escrevendo uma especialização, veja a skill `spec-author` (quando usar `suggestions`, quando `enum`).

### Mudança na versão 0.9.0 (Marcações espaciais, notas e setas)

O schema do `mapping.json` é o v13. O servidor lê o que o modelo passou a ter:

- **Marcação do canvas.** `create_marking` sem `container` cria uma marcação do canvas (`rect` em unidades do canvas). `get_marking` e as linhas de `list_markings` ganham `space` (`"canvas"` ou `"container"`) e `floating`; `get_marking` ganha `members` (`markings` e `containers` cujo pai é a marcação) e, quando há, `arrows: { outgoing, incoming }`. O `path` de uma marcação do canvas começa por `Canvas`. `list_markings` ganha os filtros `canvas: true` (só as do canvas; não combina com `container`/`image`) e `floating`.
- **Containers.** `get_container` e as entradas de `containers` de `get_project` ganham `parent` (a marcação do canvas que contém o container, ou `null`). `counts` ganha `canvasMarkings`, `floatingMarkings` e `arrows`.
- **`update_marking`** ganha `container` (troca de espaço) e `floating`; `parent` é aceito com aviso e ignorado, em `create_marking` também.
- **Setas.** `create_arrow`, `update_arrow` e `delete_arrow`; `get_marking` com a referência de uma seta; `create_annotation` na seta; `appliesTo` nos tipos (`type-not-applicable`). `get_marking_image` recusa a seta (`arrow`) e a marcação do canvas (`canvas-marking`).
- **Notas.** `create_project` aplica a biblioteca de notas por padrão (`notes: false` dispensa); `near` em `create_marking` posiciona uma marcação flutuante.
- **Sem herança de anotações.** `inherit` foi removido (aceito e ignorado com aviso por uma versão). O contexto vem do `path`, de `parent` e de `members`.
- **Propostas.** `PROPOSAL_FORMAT_VERSION` é 3 (a 2 continua lida): nível `canvas` na revisão, a mudança de espaço, `floating`, `create-arrow` e `delete-arrow`.
- **Fica para depois:** o `rect` em fração do container (para comparar entre telas) e `members` em `get_container` (o conteúdo de um container é `topLevelMarkings`).

### Mudança na versão 0.8.0 (Container)

O objeto de topo do canvas (antes "imagem", mesmo quando não tinha arquivo) é o **container**, nas respostas, nas operações e nos nomes das tools. O schema do `mapping.json` é o v13 (v12 mais a remoção da herança de anotações): a coleção `images` virou `containers` e a marcação aponta por `containerId` (o servidor migra um projeto v11 na leitura, em memória). A letra `i` das referências `mapping://<projeto>/i/<código>` **não mudou**: é o container.

- **Tools.** `get_container` e `get_container_file` substituem `get_image` e `get_image_file`. As antigas continuam registradas por uma versão e respondem como as novas, com `warnings: [{ code: "deprecated-tool", tool, message }]` na resposta. `get_marking_image` fica (devolve um recorte de imagem).
- **Operações do lote.** `add_container` aceita `file`/`base64` (a largura e a altura vêm do arquivo) **ou** `width`/`height`/`background`; `update_container`, `replace_container` e `delete_container` (argumento `container`) substituem `update_image`, `replace_image` e `delete_image` (argumento `image`). `create_marking` e o filtro de `list_markings` pedem `container`. As antigas (`add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image`, o argumento `image`) seguem aceitas por uma versão: o `plan_changes` e o `propose_changes` as aplicam e devolvem em `warnings` um aviso `{ code: "deprecated-op", op: <índice>, message }` dizendo o que usar. Em `list_markings` o filtro antigo `image` traz `warnings: [{ code: "deprecated-argument" }]`.
- **Formas das respostas.** `image`/`images` viraram `container`/`containers` onde falam do container: `get_project` (`containers`, e `counts.containers` em `list_projects`), `list_markings` e `get_marking` (`container`), `resolve` (`kind: "container"`, `container` na marcação), `find_by_code` e `find_by_source` (`container`; `kind: "container"`), `get_marking_image` (`container: { ref, file, background }`), as contagens de `plan_changes` (`changes.containers`), `created[].kind` (`container`) e `levels.containers` de `get_proposal`. O campo `blank: true` saiu: o container só com fundo mostra `file: null` e `background`. Em `get_proposal`, `entity: "image"` e o `level: "image"` das notas continuam, porque são nomes gravados no `proposal.json`.
- **Códigos de erro.** `blank-image` virou `container-without-file` e `not-blank`, `container-has-file` (veja "Erros").
- **Propostas.** O `proposal.json` é gravado com `formatVersion` 3 (as de formato 1 e 2 continuam lidas) e os nomes dos campos de antes; só a marcação grava `containerId` (em vez de `imageId`) nos valores. Uma proposta gravada antes (formato 1 ou 2, com `add_image`, `add_blank_image` ou `imageId` nos valores da marcação) ainda é lida e aplicada.
- **Container no lugar de tela.** `add_container` substitui `add_blank_image`; `get_specialization` devolve `containers` (tamanhos prontos) quando a especialização tem `formatVersion` 6.

| Antigo (aceito com aviso por uma versão) | Use                                                 |
| ---------------------------------------- | --------------------------------------------------- |
| `get_image`                              | `get_container`                                     |
| `get_image_file`                         | `get_container_file`                                |
| `add_image`                              | `add_container` com `file` (ou `base64`)            |
| `add_blank_image`                        | `add_container` com `width`, `height`, `background` |
| `update_image` (`image`)                 | `update_container` (`container`)                    |
| `replace_image` (`image`)                | `replace_container` (`container`)                   |
| `delete_image` (`image`)                 | `delete_container` (`container`)                    |
| `create_marking` com `image`             | `create_marking` com `container`                    |
| filtro `image` de `list_markings`        | filtro `container`                                  |

### Mudança na versão 0.7.0

- **`url` e `markdown` em `get_marking_image` e `get_image_file` (hoje `get_container_file`)**: cada imagem também é entregue por um servidor HTTP local (127.0.0.1, porta aleatória, token, só em memória), para clientes que não mostram o conteúdo `image` (como o Cursor). Cole o `markdown` na resposta. Com `--no-http` as respostas vêm sem `url`/`markdown`.
- Nomes das tools inalterados. Use a 0.7.0 com a app da mesma época (schema v11, sem mudança).

### Mudança na versão 0.6.0

- **O `code` ganhou uma forma só.** Em `get_marking`, `get_annotation`, `find_by_code` e `get_component`, cada plataforma traz `{ symbol, definition, params?, values?, notes? }`; o arquivo que define o `symbol` (`path`, `url`, `ref`, `localFile`, `exists`) está dentro de `definition`, que é `null` sem `path`. Antes, esses campos ficavam soltos na entrada.
- **`get_code_hints` separa o tipo da instância.** A resposta é `{ marking, platform, repos, types, unmappedTypes?, hint?, tree }`: o código de instanciação de cada tipo vem uma vez em `types`, e a árvore traz por anotação só o que é da instância: `type`, `args` (antes `params`), `values` e `linked`, sem arquivo.
- **O repositório passou para a especialização** (`platforms[].repo`); `get_project` o mostra em `repos` e `get_specialization` devolve o JSON inteiro. `set_platform_repo` só aceita `localPath` e `platformRepos` guarda só ele. O aviso `missing-repo` não existe mais.
- Use a 0.6.0 com a app da mesma época (schema v11); um projeto v10 é migrado na leitura, em memória.

### Mudança na versão 0.4.0

O campo `codeRef` (onde a instância foi implementada) saiu do formato: as respostas não trazem mais `codeRefs`, `find_by_code` procura pelo `code` dos tipos e um valor para esse campo no lote falha com `unknown-field`. Projetos antigos são migrados na leitura (schema v9, ver o `FORMAT.md`) e uma especialização antiga com o campo é aceita com o aviso `ignored-field` em `validate_specialization`. Uma proposta antiga com mudança nesse campo aparece na revisão como uma mudança que não cabe no projeto: o usuário a rejeita; reenvie sem ela.

## Erros

As falhas voltam como `isError` com um JSON `{"error": {"code", "message", …}}`. Num lote (`plan_changes`, `propose_changes`), o erro de cada operação vem em `errors`, com o mesmo `code`, sem parar as outras. A lista abaixo é **completa** para os códigos próprios do servidor (o registro fica em `mcp/errors.ts`, e um teste confere que todo código dele está aqui). Os demais são **regras do modelo** (`locked`, `rect-out-of-image`, `owner-required`, `duplicate-key`…): a `message` explica o que corrigir.

**Projetos, raízes e caminhos**

| `code`                             | Significado                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-not-found`                | Projeto inexistente nas raízes.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ambiguous-project`                | Nome de projeto repetido: a resposta lista as candidatas; use o `path` de `list_projects`.                                                                                                                                                                                                                                                                                                                                                    |
| `project-mismatch`                 | A referência é de um projeto e `project` indica outro.                                                                                                                                                                                                                                                                                                                                                                                        |
| `invalid-project`                  | O `mapping.json` não passa na validação ou não pôde ser lido (a resposta traz o motivo).                                                                                                                                                                                                                                                                                                                                                      |
| `read-only`                        | O `mapping.json` é de uma versão de schema mais nova que este servidor: atualize o `mapping-mcp.js`.                                                                                                                                                                                                                                                                                                                                          |
| `spec-unavailable`                 | A cópia da especialização em `specs/` está ausente ou inválida.                                                                                                                                                                                                                                                                                                                                                                               |
| `outside-roots`                    | Caminho com `..`, absoluto fora das raízes ou link simbólico que sai delas.                                                                                                                                                                                                                                                                                                                                                                   |
| `path-not-found`                   | O caminho informado (arquivo de origem, especialização) não existe em nenhuma raiz.                                                                                                                                                                                                                                                                                                                                                           |
| `invalid-path`                     | Caminho vazio ou inválido; em `find_by_code`, caminho de código que não é relativo à raiz do repositório.                                                                                                                                                                                                                                                                                                                                     |
| `not-a-file`                       | O caminho é uma pasta (ou outra coisa que não um arquivo).                                                                                                                                                                                                                                                                                                                                                                                    |
| `file-too-large`                   | Arquivo lido grande demais (origem do lote, especialização ou `proposal.json` acima de 64 MB).                                                                                                                                                                                                                                                                                                                                                |
| `root-required`                    | `create_project` com caminho relativo e mais de uma raiz: informe `root`.                                                                                                                                                                                                                                                                                                                                                                     |
| `unknown-root`                     | `root` não é nenhuma das raízes (a resposta lista `roots`), ou é um nome de pasta que mais de uma raiz tem: use o caminho, como em `roots` ou no `--root`.                                                                                                                                                                                                                                                                                    |
| `already-exists`, `nested-project` | `create_project`: a pasta já tem um projeto, ou fica dentro de outro projeto (projetos não se aninham).                                                                                                                                                                                                                                                                                                                                       |
| `invalid-name`                     | `create_project` com nome vazio. Também é regra do modelo (nome vazio ou inválido).                                                                                                                                                                                                                                                                                                                                                           |
| `package-too-large`                | `validate_library`: pasta com arquivos demais (mais de 2000) ou textos somando mais de 32 MB; aponte a pasta do pacote. Em `apply_specialization`/`update_specialization`: o pacote passa de 500 arquivos ou 64 MB (o limite da app).                                                                                                                                                                                                         |
| `invalid-arguments`                | Combinação de argumentos inválida: `validate_specialization` precisa de exatamente um de `path` ou `text`; `list_components`/`get_component` precisam de `project` + `specId` ou de `path`; `create_project` com `path` absoluto fora da raiz indicada em `root`; `add_container` com `file`/`base64` **e** `width`/`height`/`background` (ambígua) ou sem nenhum dos dois grupos; `create_marking` com `container` e `image`, ou sem nenhum. |

**Referências e itens**

| `code`                                                 | Significado                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-ref`                                          | Referência mal formada.                                                                                                                                                                                                            |
| `not-found`                                            | Sem item correspondente (referência, camada ou container por nome). Também é regra do modelo.                                                                                                                                      |
| `ambiguous-ref`                                        | O código curto ou o id casa com mais de um item (a resposta lista as candidatas).                                                                                                                                                  |
| `arrow`                                                | `get_marking_image` recebeu a referência de uma seta: ela é uma linha, não tem imagem. A `hint` manda pedir a imagem da marcação de origem ou de destino.                                                                          |
| `canvas-marking`                                       | `get_marking_image` recebeu uma marcação do canvas (sem container): não há imagem para recortar. A `hint` manda usar `get_container_file` dos containers sob ela ou `get_marking_image` de uma marcação de dentro de um container. |
| `ambiguous-image`, `ambiguous-layer`, `ambiguous-type` | Nome de container (o código se manteve), de camada ou de tipo de anotação que casa com mais de um: use o id (ou `specId`/`typeId`).                                                                                                |
| `unknown-type`                                         | Tipo de anotação (`type` de `create_annotation`) que não existe nas especializações aplicadas (a resposta lista até 50 em `types`, como `specId/typeId`). Também é regra do modelo.                                                |
| `wrong-kind`                                           | A referência é de outro tipo (ex: anotação passada a `get_marking`).                                                                                                                                                               |
| `missing-query`                                        | `find_by_code` sem `path` nem `symbol`; `find_by_source` e `find_types_by_source` sem o que procurar.                                                                                                                              |
| `unknown-platform`                                     | Plataforma não declarada pelas especializações aplicadas (a resposta lista as válidas).                                                                                                                                            |

**Containers e imagens**

| `code`                               | Significado                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image-file-missing`                 | O arquivo da imagem não existe (ou aponta para fora das raízes).                                                                                                    |
| `container-without-file`             | `get_container_file` ou `replace_container` num container sem arquivo (só com fundo): use `get_marking_image`; não há arquivo para devolver nem para trocar.        |
| `container-has-file`                 | `update_container` com `background`, `width` ou `height` num container que tem arquivo: só o container sem arquivo tem fundo e tamanho editáveis (regra do modelo). |
| `unsupported-image`, `invalid-image` | O arquivo não é PNG, JPEG nem WebP, ou está corrompido.                                                                                                             |
| `image-too-large`                    | Arquivo maior que 64 MB (16 MB em `base64`) ou imagem com mais de 40 megapixels.                                                                                    |
| `encode-failed`                      | Falha ao codificar a imagem em WebP (a origem provavelmente está corrompida).                                                                                       |
| `marking-outside-image`              | O retângulo da marcação não toca o container: não há o que recortar.                                                                                                |
| `invalid-image-source`               | `add_container` (com arquivo) e `replace_container`: informe `file` ou `base64`, exatamente um.                                                                     |
| `invalid-base64`                     | Conteúdo `base64` vazio ou inválido.                                                                                                                                |

**Lote (`plan_changes`, `propose_changes`)**

| `code`                               | Significado                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unknown-alias`, `alias-unavailable` | Apelido não criado antes no lote, ou criado por uma operação que falhou.                                                                                                                                                       |
| `duplicate-alias`, `invalid-alias`   | Apelido repetido no lote; ou `_as` de uma linha de tabela que não é um apelido (`$linha`).                                                                                                                                     |
| `layer-required`                     | Anotação livre sem `layer` (ou informe `type` para uma tipada).                                                                                                                                                                |
| `invalid-value`                      | Tabela que não é uma lista de linhas, ou linha que não é objeto. Também é regra do modelo (valor incompatível com o campo).                                                                                                    |
| `invalid-ref-value`                  | Valor de um campo `ref` que não é `{ "annotation": … }`.                                                                                                                                                                       |
| `invalid-spec`                       | `apply_specialization`/`update_specialization` com um arquivo de especialização inválido (`errors` traz o caminho de cada erro).                                                                                               |
| `invalid-library`                    | `apply_specialization`/`update_specialization` com um pacote v4 que tem erro na validação (os mesmos níveis de `validate_library`); `errors` traz os primeiros, com `file` e `path`, e `moreErrors` o resto. Aviso não impede. |
| `spec-missing-migrations`            | `update_specialization` de uma biblioteca v4 cuja versão nova quebra sem `migrations` (regra do modelo): `missingMigrations` lista cada quebra (`message` e `path`). Declare os passos e confira com `plan_library_update`.    |
| `spec-already-applied`               | A especialização já está aplicada (numa versão menor, use `update_specialization`). Também é regra do modelo.                                                                                                                  |
| `nothing-to-change`                  | `set_platform_repo` sem `localPath`.                                                                                                                                                                                           |
| `unknown-field`                      | Chave que não é campo do tipo (`values`), ou campo que não existe mais no formato: `codeRef` (0.4.0) e `urlTemplate` em `set_platform_repo` (0.6.0: o endereço do repositório vem da especialização).                          |

**Propostas**

| `code`               | Significado                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-title`      | `propose_changes` sem título.                                                                                                                                                         |
| `no-changes`         | `propose_changes`: as operações não alteram nada (reexportação idêntica).                                                                                                             |
| `revision-conflict`  | `propose_changes`: o projeto mudou enquanto a proposta era calculada (envie de novo). Ao substituir ou retirar: o `proposal.json` não parava de mudar (a app está gravando decisões). |
| `proposal-not-found` | Proposta inexistente no projeto.                                                                                                                                                      |
| `invalid-proposal`   | O `proposal.json` da proposta está ilegível.                                                                                                                                          |
| `image-exists`       | `propose_changes`: outro processo criou o arquivo de uma imagem (ou de um pacote de biblioteca) na pasta da proposta enquanto ela era gravada. Nada foi gravado; envie de novo.       |
| `not-open`           | `withdraw_proposal` numa proposta que não está aberta.                                                                                                                                |

**Inesperado**: `internal-error` é uma falha que o servidor não previu (a pilha vai para o stderr do servidor). Repita uma vez; se persistir, relate com a mensagem.

**Avisos** (vêm em `warnings`, sem `isError`: a operação foi feita; `plan_changes`/`propose_changes` os põem na resposta, e as tools de leitura, na própria resposta):

| `code`                  | Significado                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `library-warning`       | `apply_specialization`/`update_specialization` de pacote v4: aviso do validador (`file`, `path`, `message`; no máximo 20 por resposta); não impede nada, mas costuma ser descuido.                                                               |
| `deprecated-op`         | `plan_changes`/`propose_changes` com uma operação antiga (`add_image`, `add_blank_image`, `update_image`, `replace_image`, `delete_image`) ou o argumento `image` de `create_marking`: foi aplicada; `op` é o índice e `message` diz o que usar. |
| `deprecated-tool`       | `get_image` ou `get_image_file`: a resposta é a da tool nova, com este aviso (`tool` e `message`).                                                                                                                                               |
| `deprecated-argument`   | `list_markings` com o filtro antigo `image`: foi aplicado; use `container`.                                                                                                                                                                      |
| `superseded-incomplete` | `propose_changes` com `supersedes`: a anterior ainda tinha mudanças sem decisão ou aceitas sem aplicar.                                                                                                                                          |
| `supersede-failed`      | `propose_changes` com `supersedes`: a nova proposta foi gravada, mas a anterior não pôde ser marcada como substituída. **Não reenvie**: avise o usuário.                                                                                         |

## Boas práticas

- Prefira `list_markings` com filtros a abrir marcação por marcação; use `incomplete: true` para achar o que falta preencher.
- As respostas são compactas de propósito. Para um projeto grande, pagine em vez de pedir tudo.
- Para ver uma marcação, use `get_marking_image`: a tool já recorta no arquivo original, com os mesmos pixels do `rect`. Um `padding` pequeno (10 a 40 px) dá contexto; `mode: "context"` mostra o lugar da marcação no container. Comece com o `maxSize` padrão: imagens maiores gastam mais do seu contexto.
- Não edite o `mapping.json` nem os arquivos de `proposals/` à mão: proponha pelo lote (`propose_changes`). As regras (contenção das filhas, trava, referências) vivem no modelo, e uma edição por fora pode deixar o projeto inválido. A decisão do usuário (aceitar, rejeitar, notas) é dele: você só lê (`get_proposal`, `get_proposal_review`).
- Junte as alterações relacionadas numa proposta só (com apelidos): é uma revisão e um único ponto para conferir o `summary`. Propostas enormes cansam quem revisa: prefira uma proposta por tela ou por assunto.
- Teste com `plan_changes` quando o lote for grande ou arriscado, mas lembre que ele não envia nada ao usuário.
- Se a app estiver aberta no mesmo projeto, ela percebe a proposta nova em poucos segundos.
