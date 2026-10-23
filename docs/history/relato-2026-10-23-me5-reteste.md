# Relato de teste — Mapping

> **Nenhum passo ❌.** R12.20, R12.23 e R12.24 passaram no reteste da ME5 (PR #216, correção `27cdece`). Os achados 1, 2 e 3 do relato de 2026-10-22 estão corrigidos. **Preview necessário: sim** (código de app), build certo conferido.

- Modo: dirigido, sem interação — lista de passos: R12.20, R12.23 e R12.24 (reteste dos achados 1 a 3 de `docs/history/relato-2026-10-22-me5.md`; PR #216, branch `me5/mcp-e-fechamento`). R0 não executado (fora da lista pedida). Dependências feitas à mão e marcadas "dep.": a seta `Botão` → `Destino` (R12.17a, criada por **Ligar a…**, não por arrasto) e a aplicação da biblioteca `analytics` (R12.19, só a aplicação).
- Build id: 27cdece · 2026-10-23 (Configurações › Sobre; canal prévia, formato 13; veio pela faixa Atualizar)
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`); Deploy não foi disparado pelo testador
- Navegador e versão: Chrome (extensão Claude in Chrome)
- Sistema operacional: Windows (win32 x64)
- DPR e viewport: DPR 1,25; 1487 × 698
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-23-me5-reteste` (clone em `repo/`, workspace do MCP em `ws/`, projeto em `ws/design/mapeamentos/setas`)
- Ferramenta: agente com extensão do navegador e shell no computador; dialog-pilot (versão não lida nesta rodada; `select_folder` ok); pedidos ao MCP: **stdio** (`scripts/testing/mcp-stdio-client.mjs`), não pelo Claude Code
- Estado prévio do navegador: dezenas de projetos antigos nos recentes do preview (inclusive `setas` de rodadas anteriores). Nada foi apagado; o projeto desta rodada é uma pasta nova.
- MCP: `0.9.0-snapshot.pr216+27cdece`, Release `mcp-snapshot-pr216`, sha256 conferido: sim (`764d16e3aceb92f8e23281974a6249d1c8c23a035fa4453985ff7f59a56ed446`, igual ao esperado)
- Data: 2026-10-22 (noite, horário de Brasília)
- Tempo por roteiro: Primeiros 10 minutos e preparo (`setas`) ~20 min; R12.20 ~8 min; R12.23 ~3 min; R12.24 ~6 min; passada visual ~2 min

## Resumo

- Passos: 3 da lista (+ 2 dependências). ✅ 3, ❌ 0, não executados 0.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 0.
- Impede o uso com pessoas? Não.
- Os três achados do relato anterior ficaram resolvidos: (1) `near` sem `rect` agora devolve rect inteiro; (2) `container` por nome vale em `create_marking` e `update_marking`; (3) `parent` vem com `ignored-argument`.
- Nenhum passo ficou "não executado (precisa do dono)".

## Primeiros 10 minutos

Item 1 ok (guia e Apêndice A lidos; modo e build esperado). Item 2 ok (`mapping-testes` concedida; também foi pedida a permissão de exclusão, que o git exigia). Item 3 ok (`material3` com 33 arquivos; `git log -1` = `27cdece`; MCP `0.9.0-snapshot.pr216+27cdece` e sha256 igual). Item 4 ok (janela `chrome`). Item 5 ok (grupo com uma aba). Item 6 ok (`elementFromPoint` devolveu o `<a>`). Item 7 ok (aba "Mapping" no grupo e "Mapping - Google Chrome" no `list_windows`). Item 8 ok (rastreio do console ligado). Item 9 ok (Sobre mostra `27cdece · 2026-10-23`, prévia, formato 13).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| Preparo `setas` | 1 | ✅ | Pasta aberta pelo `select_folder` ("Criar projeto nesta pasta?" › Criar); dois containers **Personalizado** 300×200 (`Home`, `Detalhe`) e `Botão` em `Home`, `Destino` em `Detalhe` (81×40 cada). `placement` de `Home` no disco: `{x 642.18, y 166.67, scale 3.3333}` (fracionário, o caso que falhava) |
| R12.19 (dep.) | | ✅ | Só a aplicação: "Analytics aplicada: 1 camada(s) criada(s)"; `specs/analytics/` no disco |
| R12.17a (dep.) | | ✅ | **Ligar a…** no `Botão` › `Destino`: seta `curve`, `points` `[]`, `locked` false. Arrasto da alça não feito |
| R12.20 | 1 | ✅ | `plan_changes` com `near` o `Botão` SEM `rect`: válido (antes: `rect-not-integer`), marcação em x 1667, y 240, 260×140 (tamanho do componente), à direita de `Home` (que termina em x 1642) e na altura do `Botão`. `near` do container `Home` e `near` da `Nota`: também válidos (x 1667, y 167 e y 240). `propose_changes` (tabela `analytics/evento`, `nome` `continue_tapped`, `propriedades` origem = home, `create_arrow` tabela → `Botão`): na revisão, nível **Canvas › Evento**, X 1667, Y 240, **Flutuante** marcado, seta até o `Botão`; **Aceitar tudo** e **Aplicar aceitas** aplicaram no primeiro clique. Disco: marcação `containerId` null, `floating` true, rect `{1667,240,260,140}` (inteiros); seta `from` = tabela, `to` = `Botão`, `curve`, `points` `[]`; anotação `analytics/evento` com os valores. `get_marking` do `Botão`: `arrows.incoming` com a seta, `from` = a tabela; `create_arrow` com `points`: `invalid-arguments` |
| R12.23 | | ✅ | `get_project`: `canvasMarkings` 1, `floatingMarkings` 1, `arrows` 2 (igual ao disco), `parent` `null` nos dois containers. `list_markings canvas:true`: só a tabela, `space` `canvas`, `floating` true, `container` `"Canvas"` (texto, sem `path`, como o guia diz). `get_marking` da tabela: `container` null, `path` `Canvas › …`, `space` canvas, `members` vazios, `arrows.outgoing` → `Botão`. `get_marking` do `Botão`: `space` container, `incoming` da tabela, `outgoing` do `Destino`. `get_container` de `Home`: `parent` null. `canvas` + `container` juntos: `invalid-arguments` |
| R12.24 | 2, 3 | ✅ | `propose_changes` `Lente` (rect −400/−300/200×120) sem `container`: revisão com nível **Canvas › Lente**, fora dos containers, sem Flutuante; aplicada no primeiro clique. Disco: `containerId` null, `floating` false, rect pedido. `get_marking`: `space` canvas, `container` null, `path` `Canvas › Lente`. `plan_changes` `update_marking` com `container` `"Home"` (nome): válido, "ir para o container Home, retângulo x 10, y 10, 60×40"; com a referência: igual. `mapping.json` com md5 idêntico antes e depois (não gravou). Com `container` `null` e `parent` `"qualquer"`: aviso **`ignored-argument`**. Também `create_marking` com `container` `"Home"` (nome): válido, e com `parent`: `ignored-argument` |
| Visual: Árvore | | ✅ | Canvas › Evento › "→ Botão", Lente; Home › Botão › "→ Destino"; Detalhe › Destino; sem texto cortado nem rolagem horizontal (`scrollWidth` 1487 = `innerWidth`; o `data-arrows` do canvas = 2); tema escuro, 1487 px. Tema claro não conferido |

## Achados

Nenhum.

## Regressões fora do alvo

- Nenhuma observada.

## Observações (sem severidade)

1. O servidor valida `title` em `propose_changes` (obrigatório); sem ele a chamada falha com `Input validation error … at title`. Pode valer o guia dizer isso no R12.20/R12.24.
2. `get_marking` e `get_container` pedem o argumento `ref` (não `marking`/`container`); no `plan_changes`, `update_marking` usa `marking`. Só diferença de nomes entre as tools.
3. As linhas de `list_markings` do canvas trazem `container: "Canvas"` e a de `get_marking` traz `container: null` (texto do guia já descreve os dois).
4. O console repete `Konva warning: The stage has 6 layers…` (aviso da biblioteca). Nenhum erro.
5. Passada visual só no tema escuro e só na Árvore (como pedido). Na captura, a dica do botão cobriu a linha "Canvas" (a raiz); as demais linhas (Evento, → Botão, Lente, Home, Botão, → Destino, Detalhe, Destino) estavam à vista.
6. Não executado dentro de passos (fora do alvo): a 2ª metade do R12.17a (soltar a alça no fundo), o arrasto fino do R12.18, o R12.19 por inteiro (anotação na seta) e o R12.21 a R12.22.

## O que atrapalhou

- O guia manda mover `setas` para `design/mapeamentos/setas` no R12.20; criei a pasta direto lá (permitido pelo guia) e dispensei o passo.
- O R12.20 pede `analytics/evento`; sem a biblioteca `analytics` aplicada (R12.19), o tipo não existe, então apliquei só a biblioteca antes do MCP. Vale registrar essa dependência no passo.
- A extensão pediu uma vez permissão numa captura ("No response to the Claude in Chrome permission prompt"); a segunda tentativa funcionou sem ajuda.
- O git na pasta montada precisou da permissão de exclusão (`device_request_delete_permission`) para criar e limpar locks do clone.
- O container da sessão (nuvem) não teve acesso ao GitHub pela ferramenta; o clone e o download do MCP foram feitos pela shell do computador.
- Erros de argumento meus (`ref`, `title`) custaram duas chamadas ao cliente stdio; a leitura do esquema (`{"list":true}`) resolveu.
