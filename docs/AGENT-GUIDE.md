# Guia do agente (servidor MCP do Mapping)

Este guia é para o agente de IA (Claude Code, Claude Desktop ou outro cliente MCP) que usa o servidor do Mapping. Ele também é servido como o recurso `mapping-docs://AGENT-GUIDE.md`, ao lado de `mapping-docs://FORMAT.md` (o `mapping.json`) e `mapping-docs://SPEC-FORMAT.md` (as especializações).

O Mapping marca **áreas retangulares** em imagens, organiza as informações em **camadas** e as descreve com **anotações** (pares chave-valor livres ou anotações **tipadas** de uma especialização). O servidor lê projetos guardados **em pasta** dentro das raízes configuradas (`--root`). Projetos guardados só no navegador não são alcançáveis.

> **Nesta versão** o servidor só **lê** (e cria projetos vazios com `create_project`). As tools de imagem (`get_marking_image`, `get_image_file`) e de escrita em lote (`plan_changes`, `apply_changes`) ainda não existem.

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

Quando o dev cola uma referência no chat, chame `get_marking` (ou `resolve`) com ela: não é preciso informar o projeto.

## Lendo uma anotação

- Anotação **livre**: `entries` é a lista de pares `{id, key, value}` (os valores são texto).
- Anotação **tipada**: `type` (`specId`, `typeId`, `name`) e `values`, com os valores nativos de JSON (números como número, datas em ISO, tabelas como lista de linhas com `_id`). Os campos `ref` aparecem em `values` como objetos com o id do alvo; o campo `refs` da resposta os resolve em texto (`to: "User.name"`) e na referência da anotação alvo.
- `title` é o rótulo que a app mostra (ex: `Classe · Contato`, `Input · input_nome`).

## Erros

As falhas voltam como `isError` com um JSON `{"error": {"code", "message", …}}`. Os códigos que você mais verá:

| `code`                                      | Significado                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `project-not-found`, `ambiguous-project`    | Projeto inexistente, ou nome repetido (a resposta lista as candidatas).     |
| `invalid-ref`, `not-found`, `ambiguous-ref` | Referência mal formada, sem item correspondente, ou com mais de um.         |
| `wrong-kind`                                | A referência é de outro tipo (ex: anotação passada a `get_marking`).        |
| `outside-roots`                             | Caminho com `..`, absoluto fora das raízes ou link simbólico que sai delas. |
| `invalid-project`                           | O `mapping.json` não passa na validação (a resposta traz o motivo).         |
| `spec-unavailable`                          | A cópia da especialização em `specs/` está ausente ou inválida.             |

## Boas práticas

- Prefira `list_markings` com filtros a abrir marcação por marcação; use `incomplete: true` para achar o que falta preencher.
- As respostas são compactas de propósito. Para um projeto grande, pagine em vez de pedir tudo.
- Para recortar a imagem de uma marcação, use o `rect` (em pixels da imagem original) sobre o arquivo de `get_image`. Considere um pequeno `padding` para dar contexto, sem sair dos limites `width` × `height` da imagem.
- Não edite o `mapping.json` à mão: as regras (contenção das filhas, trava, referências) vivem no modelo, e uma edição por fora pode deixar o projeto inválido.
