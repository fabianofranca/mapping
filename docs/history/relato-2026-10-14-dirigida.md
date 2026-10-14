> **Relato da rodada 6 (dirigida)**, feita em 2026-10-14 (13/10 à noite no horário local) pelo agente do Cowork no computador do dono, sobre o build `1710ed5` (merge do PR #140, com as devoluções do portão nos PRs #138 a #140), com o prompt [`../TESTING-COWORK.md`](../TESTING-COWORK.md) no modo dirigido e o MCP 0.3.4: R0, R4.1 a R4.8 e R5.2 a R5.7, para conferir os achados 1 e 7 e o EPERM do MCP de [`relato-2026-10-13-portao.md`](relato-2026-10-13-portao.md). 23 ✅, 1 ❌ e R0.5 parcial: nenhum aviso falso nos quatro Aplicar, o Conflito real no R5.5, `propose_changes` sem `internal-error` na pasta montada e, no R0.7, o caminho do achado 1 com o pedido de permissão deu o aviso (rastro no anexo do fim). O único ❌, R4.4, é o achado 5 do portão, erro do guia corrigido no fechamento. Fechou a **etapa 8** (plano e decisões em [`PLAN-etapa-8.md`](PLAN-etapa-8.md), nesta pasta). Guardado como veio, sem edição; o anexo do R0.7, entregue pelo dono depois, foi acrescentado no fim.

---

# Relato de teste — Mapping

- Modo: dirigido — R0, R4.1 a R4.8 e R5.2 a R5.7, sem passada visual (conferências do portão `e701862`: achados 1, 7 e EPERM do MCP)
- Build id: 1710ed5 · 2026-10-14 (a aba abriu em `c946c1f · 2026-10-14`; depois da faixa **Atualizar**, `1710ed5`)
- Canal (como a app mostra): estável
- Forma de abrir: versão principal (https://fabianofranca.github.io/mapping/)
- Navegador e versão: Chrome 155.0.0.0 (do userAgent)
- Sistema operacional: Windows 10/11 x64 (userAgent `Windows NT 10.0`)
- DPR e viewport: DPR 1,25; 1318 × 630 (janela com a barra de ferramentas da extensão)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-14\`
- Ferramenta: agente com extensão do navegador (Claude in Chrome) e shell de VM Linux com a pasta montada
- Estado prévio do navegador: projetos pré-existentes (36 linhas em Projetos recentes, de 03/10 a 13/10: principal-reparo, Loja (pasta e neste dispositivo), importacao, fumaca-pwa, Local, principal, Teste…). `mapping.reviewResume` existia (v2, com várias propostas "seen"); não apaguei nada.
- MCP: 0.3.4 (`node tools/mapping-mcp.js --version`), Release `mcp-v0.3.4`, sha256 conferido (sim: `1fb507da…1811c8`, `sha256sum -c` OK). Exercitado por cliente MCP próprio (JSON-RPC por stdio), `mcp-client.js` nesta pasta.
- Data: 2026-10-14 (UTC); 13/10 à noite no horário local
- Tempo por roteiro: (preencher no fim)

> Repositório do guia: o clone do dono não estava acessível (só `~/mapping-testes` foi montada); cloneei `main` do GitHub numa pasta de trabalho da VM, em `1710ed5` (`git log -1`), e li o guia de lá.

## Resumo

**1 ❌ (R4.4, achado 5 repetido), R0.5 parcial, o resto ✅.** Conferências do portão: achado 7 ✅ (nenhum aviso falso em R4.7, R5.3, R5.4a, R5.6; R5.5 mostrou o Conflito real); EPERM do MCP ✅; achado 1 / R0.7: o Chrome pediu a permissão (ver R0.7).
Totais: 23 passos ✅, 1 ❌ (R4.4), 1 parcial (R0.5).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | | ✅ | Aba abriu em `c946c1f · 2026-10-14` (preso); **Atualizar** levou a `1710ed5 · 2026-10-14`. Configurações › Sobre: versão, canal estável, formato 8. Diálogo sem barra de rolagem horizontal. **Ver os atalhos de teclado** trocou para a Ajuda (Atalhos); **Esc** fechou e o foco ficou em **Configurações**. |
| R4.1 | | ✅ | Zip injetado no campo de arquivo do Abrir zip (`file_upload`). Projeto **Loja** neste dispositivo, "1 proposta(s) nova(s)", "Checkout a partir do Figma" **Nova** com **Revisar** (11 mudanças sem decisão). |
| R4.2 | | ✅ | `Cabeçalho` → `Topo` (Enter) antes de revisar. Revisão em "Somente leitura" (barra principal e de status), abre na visão **Proposto**. Conflito na mudança Nome: Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`. |
| R4.3 | | ✅ | Proposto: Confirmação e Campo Cupom (contorno tracejado em 61%); Banner promoção hachurado nas duas visões; Atual sem a Confirmação. Os selos (+, −, nome riscado) só conferi em parte: o canvas fica pequeno com a janela de baixo aberta (ver "O que atrapalhou"). |
| R4.4 | | ❌ | **Árvore** de marcações: o cadeado do Botão Pagar tem `title` "Destrancar Botão Pagar" (botão desabilitado, `aria-label` "Trancar Botão Pagar"), não "Item trancado: aceitar é permitido e a trava continua". É o achado 5 do portão, ainda presente (não está nesta rodada). Aviso **Item trancado** em Detalhes e dica do cartão/lista da revisão: certos. |
| R4.5 | | ✅ | Rejeitar a criação do Campo Cupom: aviso "1 mudança(s) rejeitada(s). 1 mudou(aram) junto, pelas dependências." e marca **junto** na anotação Input. Aceitar a anotação: "1 mudança(s) aceita(s). 1 mudou(aram) junto, pelas dependências." e a criação volta a **Aceita**, com **junto**. |
| R4.6 | | ✅ | Confirmação aceita (imagem + marcação). Árvore mostra `Cabeçalho do checkout` na visão Proposto, Detalhes e lista mostram `Topo`; ⚠ "Contém conflito" na linha do item; **Conflito** na mudança do nome. Rejeitado: volta a `Topo`, nota gravada ("Grava ao sair do campo."); proposta/Checkout **Parcial** ("4 aceitas, 1 rejeitadas, 6 sem decisão"). Botão **Aplicar aceitas · 4**. |
| R4.7 | 7 | ✅ | Avisos depois do Aplicar: só "4 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez." Nenhum "Aplicar bloqueado", nenhum "O projeto mudou desde a sua última sessão". Print: `anexos/R4.7-apos-aplicar.jpg`. **Sair da revisão**: "Somente leitura" some; Árvore com Campo Cupom, Mensagem de sucesso e o Banner promoção; Topo. |
| R4.8 | | ✅ | `Ctrl+Z` uma vez: Campo Cupom e Mensagem de sucesso saem da Árvore; `Ctrl+Shift+Z`: voltam. Nenhum aviso falso depois. |
| R0.2–R0.4b | | ✅ | Feitos com o Fabiano (ver a conversa); janela estreita e alargada conforme o guia. |
| R0.5 | | ⚠️ parcial | A extensão não navega para `file://`; foi passo dele. Ele descompactou em `avulso/` e reportou que o aviso "Aberto como arquivo…" apareceu. **Build id do index.html avulso: ele disse que estava certo (declaração dele, não observada por mim).** |
| R0.6 | | ✅ | Sobre: `build: 1710ed5 · 2026-10-14 channel: main schema: 8`. App instalado abriu em janela própria; projeto `fumaca-pwa` criado, desenhou, salvou e fechou (declaração dele). |
| R0.7 | 1 | ✅ | O Chrome **pediu** a permissão e ele permitiu; linhas `folders.reopen` do Diagnóstico em `anexos/R0.7-diagnostico.txt` (copiadas da tabela; o botão Copiar não pôde ser lido de volta). Não foi preciso o R0.7b. |
| R5.2 (MCP) | | ✅ | Ver "R5.2 — evidências" abaixo. |
| R5.2 (app) | | ✅ | **Abrir pasta › `importacao`**, permissão dada por ele; a proposta "Importação inicial: Cadastro e Login" apareceu uma vez, **Nova**. |
| R5.3 | 7 | ✅ | Revisão com 20 aplicadas e 3 rejeitadas (Senha, Input da Senha, Button do Entrar), notas gravadas. Aviso após Aplicar sem falsos (`anexos/R5.3-clique-aplicar.jpg`, `R5.3-apos-aplicar.jpg`); Desfazer/Refazer sem aviso falso. |
| R5.4a | 7 | ✅ | Grupo Projeto aceito (2), Aplicar: único aviso "2 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez." (sem "Aplicar bloqueado" nem "O projeto mudou…"). `get_proposal_review`: 22 aplicadas, 3 rejeitadas, 2 notas, 0 conflitos (`anexos/R5.4a-get_proposal_review.json`). `propose_changes` com `supersedes` → `Correções do Login`; `superseded.status: applied` + nota; app: antiga **Aplicada** com **Abrir a nova**. |
| R5.4b | | ✅ | Proposta "Lembrar senha" (marcação com source + 2 anotações) sem revisar; substituída por "Lembrar senha (v2)" (com `placeholder`). Resposta: `superseded.status: superseded`, aviso `superseded-incomplete` com `undecided: 3`, `inNewProposal {same 2, different 1, missing 0}`. App (**Ver**): selo **Substituída**, "3 sem decisão ficaram para trás", selos "igual na nova" e "diferente na nova". |
| R5.5 | 7 | ✅ | Renomear Título login → Título da tela proposto; no app renomeei para `Entrar na conta` sem abrir a revisão. Revisar: **Conflito** com Atual `Entrar na conta`, Antes `Título login`, Depois `Título da tela`. Ao sair da revisão o aviso "Nova proposta" para ela não voltou; as outras continuaram **Nova**. |
| R5.6 | 7 | ✅ | `Alt+L` trancou Entrar. Revisão: "Item trancado: aceitar mudanças de posição ou remoção é permitido na revisão. A trava continua ligada depois de aplicar." Aceitar + Aplicar: aviso só "1 mudança(s) aplicada(s)."; disco: `rect.y` 272 → 282 e `locked: true` (`anexos/R5.6-mapping-apos-aplicar.json`). A Árvore não foi reexaminada com a revisão aberta (achado 5 só medido no R4.4). |
| R5.7 | | ✅ | Reexportação idêntica (9 `update_marking`, inclusive o Entrar trancado): `error no-changes`, nenhuma pasta nova. Com Cadastrar → `Criar conta`: proposta `18a72fb5` com **1** mudança (`update: 1`). `mapping.json` com o mesmo md5 (`a3e201b5…`) antes e depois. |

## R5.2 — evidências (parte do MCP)

- `create_project` (`path` `importacao`, `root` `design/mapeamentos`): `created: true`, `revision: 0`, `counts` zerados. `ls -la`: `.gitignore` e `mapping.json`, **sem** `images/`.
- Primeira tentativa de `propose_changes` com `file` `assets/...`: `valid: false` (`path-not-found`; o `file` é relativo à raiz, não ao repositório). Nada foi gravado (a pasta continuou só com o `mapping.json`). Repeti com `sdui.json`, `cadastro.png`, `login.png`. Ver "O que atrapalhou".
- `propose_changes` (22 operações): **sem** `internal-error`; `valid: true`, `proposed: true`, `ref` `mapping://importacao/p/be353007`, exit 0. Resposta: `anexos/R5.2-propose_changes-resposta.json`.
- `list_proposals`: **uma** proposta (`status: open`, `progress.total: 25`). Sem duplicata.
- `mapping.json`: md5 igual antes e depois (`85caec48516fc8994ebaa91848daa178`), `revision` 0.
- Temporários que sobraram (esperado): `.proposal.json.3fdb1bff2f02.tmp` e, em `images/`, `.cadastro.webp.ebf5c3281e1d.tmp` e `.login.webp.baacbfb31efc.tmp`. stderr do servidor (3 linhas): "mapping-mcp: aviso: não foi possível apagar o temporário …/proposals/be353007-3e55-4123-a188-518b0067c197/images/.cadastro.webp.ebf5c3281e1d.tmp (EPERM); ele pode ser apagado à mão" (e as outras duas). Arquivos deixados lá até o fim do R5. `ls -la` completo: `anexos/R5.2-ls-la-proposta.txt`; stderr: `anexos/R5.2-propose_changes-stderr.txt`.

## Achados

1. **R4.4 — achado 5 continua** (severidade baixa): na **Árvore** de marcações o cadeado do item trancado (Botão Pagar) tem `title` "Destrancar Botão Pagar", em vez da dica "Item trancado: aceitar é permitido e a trava continua". Repro: abrir a revisão de "Checkout a partir do Figma" com o Botão Pagar trancado, passar o mouse no cadeado na Árvore. Aviso em Detalhes e dica da lista: certos.

## Regressões fora do alvo

- Nenhuma encontrada.

## Observações (sem severidade)

- A aba abriu presa em `c946c1f`; a faixa **Nova versão disponível** apareceu e o **Atualizar** resolveu.

- Um toast antigo "Proposta alterada fora da app: Lembrar senha e mais N aviso(s)" ficou visível durante R5.5–R5.6 (anterior às ações; não é "Aplicar bloqueado" nem "O projeto mudou…"). Em R5.4b o `propose_changes` com rect fora da imagem (`rect-out-of-image`) foi recusado e nada gravado (`anexos/R5.4b-proposta1-tentativa1-invalida.json`); repeti dentro da imagem (484×378).
- Os 7 `.tmp` deixados pelo MCP 0.3.4 (EPERM + aviso no stderr) continuam na pasta das propostas, como combinado; nada foi apagado.
- Capturas só estão em `anexos/` para R4.7 e R5.3; para R5.4a–R5.6 a prova é o texto dos avisos acima (o screenshot da extensão não foi salvo em arquivo).

## O que atrapalhou

- O clone do repositório do dono não estava na pasta montada; usei um clone novo do GitHub em `1710ed5`.
- O "seu cliente MCP" do portão não estava na pasta `~/mapping-testes`; escrevi outro (`mcp-client.js`).
- A janela do Chrome tem 630 px de altura útil; com a janela de baixo aberta, o canvas fica pequeno e os selos pequenos não dá para conferir a olho.
- O guia diz `file` relativo "à pasta do projeto ou a uma raiz": com a raiz `assets`, o caminho certo é `sdui.json`, não `assets/sdui.json` (o passo R5.2 não diz isso).

## Anexo: rastro do R0.7

O `anexos/R0.7-diagnostico.txt` da rodada, como veio:

```text
# Diagnóstico copiado pelo painel (linhas [folders.reopen]) — R0.7, build 1710ed5 · 2026-10-14
# (o botão Copiar não pôde ser relido pela área de transferência; linhas lidas da tabela do Diagnóstico)
23:12:33 | folders.reopen | aviso fechado: relocate após 104217ms
23:10:49 | folders.reopen | handle=memory@0 query=prompt@10 request=granted@45039 branch=no-mapping@45053 home=dialog:missing@45053 shown=open,modal,visible@45065
```
