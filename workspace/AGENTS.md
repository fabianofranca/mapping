# Mapeamentos

Esta pasta centraliza os projetos **Mapping**: containers (imagens de telas, protótipos, diagramas, ou áreas sem arquivo) com áreas retangulares marcadas, organizadas em camadas e descritas por anotações, cada projeto numa pasta com `mapping.json`. O agente é aberto na raiz do repositório e os caminhos abaixo são relativos a ela.

## Para que servem estes mapeamentos

Mapear a interface do próprio Mapping para ajustá-la: cada marcação aponta um problema, uma ideia ou um componente. O código mapeado é este repositório (`src/`), então `get_code_hints` e `find_by_code` funcionam a partir da raiz. Os projetos também servem de massa de teste real do formato, da app e do MCP.

## Estrutura

| Pasta                        | O que é                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `workspace/projetos/<nome>/` | Um projeto Mapping: `mapping.json`, `images/`, `specs/` (cópias das especializações aplicadas), `proposals/`.              |
| `workspace/especializacoes/` | **Fontes** das especializações (`<id>.json`). A cópia em `workspace/projetos/*/specs/` é derivada; edite aqui e reaplique. |

## Servidor MCP `mapping`

As tools aparecem como `mcp__mapping__…` (ou `mapping/…`, conforme o cliente). Se não aparecerem, o cliente não carregou o `.mcp.json` da raiz; o comando é (gera o build do branch em uso e inicia o servidor com as raízes `workspace/projetos` e `workspace/especializacoes`):

```
bash workspace/mcp.sh
```

Comece por `list_projects`. O servidor descreve seu uso nas próprias instruções e no recurso `mapping-docs://AGENT-GUIDE.md`; leia o guia antes da primeira alteração. Itens são citados por referência `mapping://<projeto>/<m|i|a|p>/<código>`.

## Regras

- **Nunca edite `mapping.json`, `specs/` ou `proposals/` à mão.** Toda alteração vai por `plan_changes` (prévia) e `propose_changes` (grava uma proposta); a pessoa revisa e aplica na app. Depois de propor, avise e espere a revisão (`get_proposal`, `get_proposal_review`).
- **Especializações nascem em `workspace/especializacoes/`**, com a skill `spec-author` (abaixo), são validadas com `validate_specialization` e aplicadas a um projeto só por proposta (`apply_specialization` dentro de `propose_changes`). Para mudar uma aplicada, edite a fonte, suba a `version` e envie `update_specialization`. **Bibliotecas** (`formatVersion` 4) são **pastas** `workspace/especializacoes/<id>/`: valide com `validate_library({ path })` (não só o arquivo) e entregue a pasta à pessoa, que a aplica na app (Especializações); `propose_changes` recusa pacote v4. Para ler os componentes, use `list_components` e `get_component`.
- **Coordenadas** de marcação são em pixels da imagem original do container (a letra `i` das referências `mapping://…/i/…` é o container). A exceção é a **marcação do canvas** (`space: "canvas"`, `container: null`), que envolve containers e tem `rect` em unidades do canvas, sem imagem para recortar (`get_marking_image` responde `canvas-marking`). Quem está dentro de quem vem **pronto**: `parent` e `members` em `get_marking`, `parent` em `get_container`; leia, não calcule interseções e não escolha o pai (`parent` em `create_marking`/`update_marking` é ignorado com aviso).
- **Notas, tabelas e setas.** Um tipo `floating` (a biblioteca de notas: `nota` e `tabela`) cria uma marcação **flutuante**, no canvas, que não pertence a nada; ela se liga ao elemento por uma **seta**, que é uma marcação que aponta (`create_arrow`, `from`/`to`; nunca `points`). Para achar a tabela de um botão, leia `arrows` em `get_marking` do botão e siga a ponta flutuante. Para criar uma, use `create_marking` com `near` o botão e `create_arrow`, num só lote. Tipos com `appliesTo: ["arrow"]` anotam a seta.
- **Código**: o servidor só confere se arquivos de código existem, e só dentro do diretório onde o cliente foi aberto. O `code` de um tipo diz como se cria uma instância dele em cada plataforma (o que se chama e o arquivo que o define, no repositório da especialização); o mapeamento não guarda nada sobre a solução. Aqui o repositório do código é este, e o agente já é aberto na raiz, então `get_code_hints` e `find_by_code` conferem `src/` de verdade.
- **Achados sobre a própria ferramenta** (bug, ajuste) viram marcação/anotação no projeto ou issue/PR, conforme o fluxo do `CLAUDE.md` da raiz. Nunca edite código do produto só por causa de um mapeamento, sem o dono pedir.

## Skill `spec-author`

Para escrever, revisar ou atualizar uma especialização, use a skill `spec-author` (`.claude/skills/spec-author/SKILL.md` do repositório): ela traz o método, a leitura obrigatória do formato e a validação; o pedido só precisa dizer `id`, origem, `formatVersion`, plataformas e o que fica fora e, para uma biblioteca, a pasta de saída e a origem dos componentes (modelo no fim da skill). Grave a fonte em `workspace/especializacoes/<id>.json` (biblioteca: na pasta `workspace/especializacoes/<id>/`).

## Fluxo típico

1. `list_projects` → `get_project` → `get_specialization` dos tipos que vai usar.
2. Leia os containers e marcações que interessam (`list_markings`, `get_marking`, `get_marking_image`). Se o seu cliente não mostra imagens no chat (como o Cursor), cole o `markdown` que `get_marking_image`/`get_container_file` devolvem (URL local do servidor).
3. Monte o lote, confira com `plan_changes`, envie com `propose_changes`, avise a pessoa.
4. Quando a revisão terminar, leia `get_proposal_review` e, se preciso, envie outra proposta com `supersedes`.
