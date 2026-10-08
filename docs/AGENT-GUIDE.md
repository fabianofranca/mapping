# Guia do agente (servidor MCP do Mapping)

Este guia é para o agente de IA (Claude Code, Claude Desktop ou outro cliente MCP) que usa o servidor do Mapping. Ele também é servido como o recurso `mapping-docs://AGENT-GUIDE.md`, ao lado de `mapping-docs://FORMAT.md` (o `mapping.json`) e `mapping-docs://SPEC-FORMAT.md` (as especializações).

O Mapping marca **áreas retangulares** em imagens, organiza as informações em **camadas** e as descreve com **anotações** (pares chave-valor livres ou anotações **tipadas** de uma especialização). O servidor lê projetos guardados **em pasta** dentro das raízes configuradas (`--root`). Projetos guardados só no navegador não são alcançáveis.

> **Nesta versão** o servidor **lê**, cria projetos vazios (`create_project`), **mostra imagens** (`get_marking_image`, `get_image_file`) e **altera** projetos em lote com prévia (`plan_changes` + `apply_changes`).

## Conceitos que importam

- **Coordenadas em pixels da imagem original.** O `rect` de uma marcação (`x`, `y`, `width`, `height`) está sempre nos pixels do arquivo de imagem, com a origem no canto superior esquerdo. `width` e `height` da imagem dizem o limite. Nunca é uma coordenada de tela.
- **Hierarquia.** Uma marcação pode estar dentro de outra (`parent`); a filha cabe inteira no retângulo do pai.
- **Camadas.** Cada anotação pertence a uma camada. Camadas **livres** guardam anotações livres; camadas **de especialização** (com `spec`) guardam as anotações tipadas daquele domínio.
- **Herança.** Uma anotação com `inherit: true` também vale para todos os descendentes da marcação. `get_marking` mostra as herdadas separadas das próprias, com a marcação de origem.
- **Vínculos.** Uma anotação pode ter uma **dona** (`owner`), na mesma marcação e em outra camada (ex: um evento `onClick` vinculado ao `Button`). `linked` lista as vinculadas e `linkTree` mostra a árvore.
- **Referências fortes.** Campos do tipo `ref` apontam para uma tupla, uma linha de tabela ou um campo de outra anotação. Em `refs` você vê para onde cada campo aponta; em `backlinks`, quem aponta para a anotação.
- **Pendências.** Anotação incompleta (`issues`): campo obrigatório vazio, valor inválido, referência quebrada, tipo inexistente etc. São calculadas na leitura, não gravadas.
- **Trava.** `lock.locked` indica marcação trancada; `lock.geometryLocked`, geometria travada (por ela ou por um ancestral trancado). Item trancado não pode ser movido, redimensionado nem excluído.

## Referências

Cada item devolvido traz uma referência no formato

```
mapping://<projeto>/<m|i|a>/<código> (<caminho legível>)
```

- `<projeto>` é o nome da pasta do projeto; `m` marcação, `i` imagem, `a` anotação.
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

## Alterando um projeto: lote com prévia

Toda alteração passa por duas chamadas:

1. **`plan_changes(project, operations[])`** valida o lote inteiro contra as regras do Mapping (as mesmas da app) **sem gravar nada** e devolve:
   - `valid` e, se houver, `errors` por operação (`index`, `op`, `code`, `message`);
   - `summary`: uma linha legível por operação válida (mostre ao dev antes de gravar quando a mudança for grande);
   - `changes`: quantos itens serão criados, alterados e excluídos por coleção;
   - `issues`: pendências antes e depois, e as anotações que ficam incompletas (`new`);
   - `created`: as referências `mapping://` dos itens que serão criados (as definitivas), com o apelido de cada um;
   - `planId` (só se o lote for válido), que vale **10 minutos** e só para a revisão atual do projeto.
2. **`apply_changes(planId)`** grava tudo de uma vez: imagens novas, cópias de `specs/` e o `mapping.json` com `revision + 1`. Se o arquivo mudou desde o plano (a app ou outro processo gravou, ou alguém editou à mão), a gravação é recusada com `revision-conflict`: **releia e gere um novo plano**. Um plano só é aplicado uma vez.

Um lote com qualquer erro não gera `planId`: corrija as operações e mande o lote inteiro de novo. As operações são aplicadas **em ordem**, cada uma sobre o resultado da anterior.

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

| `op`                    | Campos                                                                                    | Observações                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `create_layer`          | `name`, `color?`, `as?`                                                                   | Camada livre; cor padrão: a próxima da paleta.                                                                                           |
| `update_layer`          | `layer`, `name?`, `color?`                                                                | Camada de especialização não é renomeada.                                                                                                |
| `move_layer`            | `layer`, `index`                                                                          | Reordena (0 = primeira).                                                                                                                 |
| `delete_layer`          | `layer`                                                                                   | Exclui as anotações dela e as vinculadas a elas.                                                                                         |
| `apply_specialization`  | `file`                                                                                    | JSON da especialização dentro das raízes; a cópia vai para `specs/`.                                                                     |
| `update_specialization` | `file`                                                                                    | Versão maior de uma já aplicada.                                                                                                         |
| `remove_specialization` | `specId`, `mode`                                                                          | `delete` (apaga camadas e anotações) ou `convert` (viram livres).                                                                        |
| `add_image`             | `file` ou `base64`, `fileName?`, `name?`, `center?`, `as?`                                | PNG, JPEG ou WebP. Mesma otimização da app (abaixo).                                                                                     |
| `update_image`          | `image`, `name?`, `x?`, `y?`, `scale?`, `markingColor?`, `locked?`, `markingsLocked?`     | `markingsLocked` tranca ou destranca todas as marcações da imagem.                                                                       |
| `replace_image`         | `image`, `file` ou `base64`, `fileName?`, `confirmAspectChange?`                          | Marcações reescaladas; com outra proporção, exige a confirmação e ficam "a revisar".                                                     |
| `delete_image`          | `image`                                                                                   | Com as marcações e anotações dela.                                                                                                       |
| `create_marking`        | `image`, `rect`, `name?`, `parent?`, `as?`                                                | `rect` em pixels da imagem. Sem `parent`, o pai é a marcação mais interna que contém o retângulo (como na app); `null` = primeiro nível. |
| `update_marking`        | `marking`, `name?`, `rect?`, `move?`, `parent?`, `locked?`, `confirmReview?`              | `rect` redimensiona (as filhas ficam onde estão); `move: {dx, dy}` desloca com as filhas.                                                |
| `delete_marking`        | `marking`                                                                                 | Com as descendentes e as anotações.                                                                                                      |
| `create_annotation`     | `marking`, `type?`, `layer?`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`, `as?` | Sem `type`: livre, com `layer` e `entries`. Com `type`: tipada, na camada do tipo, com `values`.                                         |
| `update_annotation`     | `annotation`, `name?`, `entries?`, `values?`, `owner?`, `inherit?`                        | `entries` substitui os pares (a mesma chave mantém o id); `values` muda só os campos informados.                                         |
| `delete_annotation`     | `annotation`                                                                              | Com as vinculadas a ela.                                                                                                                 |

**Valores tipados** (`values`): por `key` do campo (veja `get_specialization`); `null` limpa.

- Campo `table`: a lista de linhas, que **substitui** a tabela. `{"_id": "…"}` mantém uma linha existente (com as células informadas alteradas); `"_as": "$linha"` dá um apelido à linha, para uma referência no mesmo lote.
- Campo `ref`: `{"annotation": "$user", "entry": "name"}` (par de anotação livre, pela chave ou id), `{"annotation": "$contato", "key": "atributos", "row": "$linha"}` (linha de tabela, pelo id, apelido ou índice) ou `{"annotation": "…", "key": "id"}` (campo).

**Imagens.** Como na app: a orientação EXIF é aplicada, o lado maior fica em no máximo 2560 px e o arquivo é recodificado em WebP (sem perdas para PNG; com perdas, qualidade 0,85, para fotos), sem metadados. Sem redução nem rotação, o original é mantido se o WebP não ficar menor. `width` e `height` da imagem (e as coordenadas das marcações) são os do arquivo gravado. O nome em `images/` nunca sobrescreve um arquivo existente (`foto-2.webp`…). `file` é relativo à pasta do projeto ou a uma raiz, ou absoluto dentro das raízes.

**Travas.** Item trancado não é movido, redimensionado, trocado nem excluído (`locked`): destranque na mesma operação (`"locked": false` é aplicado primeiro; `true`, por último) ou numa anterior. Nome e anotações seguem livres.

## Lendo uma anotação

- Anotação **livre**: `entries` é a lista de pares `{id, key, value}` (os valores são texto).
- Anotação **tipada**: `type` (`specId`, `typeId`, `name`) e `values`, com os valores nativos de JSON (números como número, datas em ISO, tabelas como lista de linhas com `_id`). Os campos `ref` aparecem em `values` como objetos com o id do alvo; o campo `refs` da resposta os resolve em texto (`to: "User.name"`) e na referência da anotação alvo.
- `title` é o rótulo que a app mostra (ex: `Classe · Contato`, `Input · input_nome`).

## Erros

As falhas voltam como `isError` com um JSON `{"error": {"code", "message", …}}`. Os códigos que você mais verá:

| `code`                                           | Significado                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `project-not-found`, `ambiguous-project`         | Projeto inexistente, ou nome repetido (a resposta lista as candidatas).     |
| `invalid-ref`, `not-found`, `ambiguous-ref`      | Referência mal formada, sem item correspondente, ou com mais de um.         |
| `wrong-kind`                                     | A referência é de outro tipo (ex: anotação passada a `get_marking`).        |
| `outside-roots`                                  | Caminho com `..`, absoluto fora das raízes ou link simbólico que sai delas. |
| `invalid-project`                                | O `mapping.json` não passa na validação (a resposta traz o motivo).         |
| `spec-unavailable`                               | A cópia da especialização em `specs/` está ausente ou inválida.             |
| `image-file-missing`                             | O arquivo da imagem não existe (ou aponta para fora das raízes).            |
| `unsupported-image`, `invalid-image`             | O arquivo não é PNG, JPEG nem WebP, ou está corrompido.                     |
| `image-too-large`                                | Arquivo maior que 64 MB ou imagem com mais de 100 megapixels.               |
| `marking-outside-image`                          | O retângulo da marcação não toca a imagem: não há o que recortar.           |
| `revision-conflict`                              | `apply_changes`: o projeto mudou desde o plano. Releia e gere outro plano.  |
| `plan-not-found`                                 | `apply_changes`: plano inexistente, já aplicado ou expirado (10 min).       |
| `unknown-alias`, `alias-unavailable`             | Apelido não criado antes no lote, ou criado por uma operação que falhou.    |
| `locked`, `rect-out-of-image`, `owner-required`… | Regras do modelo: a `message` explica o que corrigir.                       |

## Boas práticas

- Prefira `list_markings` com filtros a abrir marcação por marcação; use `incomplete: true` para achar o que falta preencher.
- As respostas são compactas de propósito. Para um projeto grande, pagine em vez de pedir tudo.
- Para ver uma marcação, use `get_marking_image`: a tool já recorta no arquivo original, com os mesmos pixels do `rect`. Um `padding` pequeno (10 a 40 px) dá contexto; `mode: "context"` mostra o lugar da marcação na imagem. Comece com o `maxSize` padrão: imagens maiores gastam mais do seu contexto.
- Não edite o `mapping.json` à mão: altere pelo lote (`plan_changes` + `apply_changes`). As regras (contenção das filhas, trava, referências) vivem no modelo, e uma edição por fora pode deixar o projeto inválido.
- Junte as alterações relacionadas num lote só (com apelidos): é uma gravação, uma revisão e um único ponto para conferir o `summary`.
- Se a app estiver aberta no mesmo projeto, ela recarrega sozinha depois do `apply_changes` (ou pergunta, se o dev tiver alterações ainda não gravadas).
