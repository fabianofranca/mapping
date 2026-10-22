# Mapeamentos

Esta pasta centraliza os projetos **Mapping**: containers (imagens de telas, protótipos, diagramas, ou áreas sem arquivo) com áreas retangulares marcadas, organizadas em camadas e descritas por anotações, cada projeto numa pasta com `mapping.json`. Ela é agnóstica de ferramenta: tudo o que você precisa está aqui, por caminho relativo.

## Para que servem estes mapeamentos

<!-- Preencha: o objetivo de quem mantém esta pasta. Ex: "documentar as telas do app X, ligar cada
componente ao código de instanciação Android/iOS e escrever as telas na solução a partir das marcações". É isto que o
servidor MCP não sabe dizer: ele explica o mecanismo, não o propósito. -->

## Estrutura

| Pasta                  | O que é                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `projetos/<nome>/`     | Um projeto Mapping: `mapping.json`, `images/`, `specs/` (cópias das especializações aplicadas), `proposals/`.    |
| `especializacoes/`     | **Fontes** das especializações (`<id>.json`). A cópia em `projetos/*/specs/` é derivada; edite aqui e reaplique. |
| `tools/mapping-mcp.js` | O servidor MCP do Mapping (autocontido; Node ≥ 20).                                                              |
| `.agents/skills/`      | Skills no padrão Agent Skills; `.claude/skills/` é um link para elas.                                            |
| `.mcp.json` e irmãos   | A mesma configuração do servidor para cada cliente (Claude Code, Cursor, Gemini CLI, Copilot, Codex).            |

## Servidor MCP `mapping`

As tools aparecem como `mcp__mapping__…` (ou `mapping/…`, conforme o cliente). Se não aparecerem, o cliente não carregou a configuração desta pasta; o comando é:

```
node tools/mapping-mcp.js --root projetos --root especializacoes
```

Comece por `list_projects`. O servidor descreve seu uso nas próprias instruções e no recurso `mapping-docs://AGENT-GUIDE.md`; leia o guia antes da primeira alteração. Itens são citados por referência `mapping://<projeto>/<m|i|a|p>/<código>`.

## Regras

- **Nunca edite `mapping.json`, `specs/` ou `proposals/` à mão.** Toda alteração vai por `plan_changes` (prévia) e `propose_changes` (grava uma proposta); a pessoa revisa e aplica na app. Depois de propor, avise e espere a revisão (`get_proposal`, `get_proposal_review`).
- **Especializações nascem em `especializacoes/`**, com a skill `spec-author` (abaixo), são validadas com `validate_specialization` e aplicadas a um projeto só por proposta (`apply_specialization` dentro de `propose_changes`). Para mudar uma aplicada, edite a fonte, suba a `version` e envie `update_specialization`. **Bibliotecas** (`formatVersion` 4) são **pastas** `especializacoes/<id>/`: valide com `validate_library({ path })` (não só o arquivo) e entregue a pasta à pessoa, que a aplica na app (Especializações); `propose_changes` recusa pacote v4. Para ler os componentes, use `list_components` e `get_component`.
- **Coordenadas** de marcação são sempre em pixels da imagem original do container (a letra `i` das referências `mapping://…/i/…` é o container).
- **Código**: o servidor só confere se arquivos de código existem, e só dentro do diretório onde o cliente foi aberto. O `code` de um tipo diz como se cria uma instância dele em cada plataforma (o que se chama e o arquivo que o define, no repositório da especialização); o mapeamento não guarda nada sobre a solução. Para escrever a solução a partir das marcações (`get_code_hints`, `find_by_code`), abra o agente no repositório do código, com esta pasta como raiz do servidor por caminho absoluto.

## Skill `spec-author`

Para escrever, revisar ou atualizar uma especialização, use a skill `spec-author` (`.agents/skills/spec-author/SKILL.md`): ela traz o método, a leitura obrigatória do formato e a validação; o pedido só precisa dizer `id`, origem, `formatVersion`, plataformas e o que fica fora e, para uma biblioteca, a pasta de saída e a origem dos componentes (modelo no fim da skill). Grave a fonte em `especializacoes/<id>.json` (biblioteca: na pasta `especializacoes/<id>/`).

## Fluxo típico

1. `list_projects` → `get_project` → `get_specialization` dos tipos que vai usar.
2. Leia os containers e marcações que interessam (`list_markings`, `get_marking`, `get_marking_image`). Se o seu cliente não mostra imagens no chat (como o Cursor), cole o `markdown` que `get_marking_image`/`get_container_file` devolvem (URL local do servidor).
3. Monte o lote, confira com `plan_changes`, envie com `propose_changes`, avise a pessoa.
4. Quando a revisão terminar, leia `get_proposal_review` e, se preciso, envie outra proposta com `supersedes`.
