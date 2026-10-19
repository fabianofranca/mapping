# Relato de teste — Mapping (conferência das correções do PR #177)

- **Build conferido:** `6e66293 · 2026-10-19` (esperado `6e66293 · 2026-10-18`: o commit confere; a data do build é a do Deploy #261)
- **Painel da rodada:** https://claude.ai/artifact/6rAj2kXEfXyAgUh4VL9mpc
- **Data:** 2026-10-18, das 21:14 às 21:45 · rodada dirigida, sem interação
- **PR:** https://github.com/fabianofranca/mapping/pull/177 (já mesclado em `epic/biblioteca`)
- **Forma de abrir:** preview publicado pelo testador, execução Deploy `#261` (a execução `#260`, de um bot, foi cancelada); depois da faixa **Atualizar**, o build bateu com o commit esperado.
- **Branch:** `epic/biblioteca` em `6e66293`, clonado em `~/mapping-testes/2026-10-18-epic-biblioteca/repo`
- **Navegador:** Chrome pela extensão Claude in Chrome; viewport 1540 × 698, DPR 1,25 (janela redimensionada para 1600 × 950; passada estreita a 902 px)
- **Ferramenta:** dialog-pilot (versão não lida nesta rodada); MCP `mapping-mcp.js` 0.5.0-rc.1 por stdio (`scripts/testing/mcp-stdio-client.mjs`)
- **Lista dirigida:** R0.1; cliente stdio; R4.1 a R4.6; R5.2 a R5.4a; R7.2; R9.7 (posições novas); passada visual (Diagnóstico e Camadas). R6.1 fica pendente da decisão do dono e **não** foi executado.

## Resumo

**1 falha (média) e 1 achado baixo.** 16 passos: 14 ✅, 1 ❌, 0 ⚠️, 0 não executados (o R5.4a conta como ✅; o ❌ é o R5.3).

- **❌ R5.3 (média):** rejeitar a anotação Button do Entrar pelo **✕ do cartão**, com o mouse, **não abre o campo "Nota para o agente"** e deixa o foco no `body` (0 `textarea`). Medido 3 vezes: ✕; ✕ de novo depois de **Limpar**; e **Rejeitar** no balão da marcação. Contraste: o botão de nota do balão abre o campo vazio e com foco; vazio, ele some ao sair (Tab). Com texto, a nota fica. Há contorno (abrir a nota pelo botão do balão), por isso a severidade é média.
- **Baixo (R9.7):** a paleta do Catálogo adicionou o Text field na **foto central** (`cadastro.png`), mesmo com a tela Detalhes selecionada (3 medições, com o botão existente da tela selecionado também). Numa tela nova ("Teste97"), que fica no centro, funcionou.
- O restante das correções do PR #177 está ok: Detalhes/trilha/barra seguem a visão (R4.5, R4.6); clique no fundo do canvas mostra a proposta e a barra diz "Nada selecionado" (R5.4a); Diagnóstico do reparo sem `folders.reopen` (R7.2); Button à frente cobre o começo do texto (R9.7); aba ativa visível a ~900 px; tooltip "Especialização Modelo de dados".

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| R0.1 | ✅ | Build `6e66293` conferido em Configurações › Sobre depois do Deploy #261 e de **Atualizar**. |
| Cliente stdio | ✅ | Sem `MAPPING_MCP_ARGS` e sem args depois de `--`: stderr disse que usou `.mcp.json`; 26 ferramentas; `list_projects` com as raízes `design/mapeamentos` e `assets`. |
| R4.1 a R4.6 | ✅ | Proposta de exemplo; em R4.5 e R4.6 o título do Detalhes, a trilha e a barra seguem a visão. O selo "+" do Campo Cupom só aparece com zoom de 145% (some a 60%). |
| R5.2 | ✅ | |
| R5.2b | ✅ | |
| R5.3 | ❌ | Ver Achado 1. O resto do passo funcionou: aviso "mudou(aram) junto, pelas dependências"; Eventos e Telas ficaram sem decisão; Aplicar gravou `images/cadastro.webp`, `images/login.webp`, `specs/sdui.json` (revisão 1); Ctrl+Z esvaziou `images/` (revisão 2); Ctrl+Shift+Z trouxe as duas imagens (revisão 3); Diagnóstico: "Nenhum erro registrado." |
| R5.4a | ✅ | Clique no fundo: Detalhes mostra a proposta e a barra diz "Nada selecionado". `get_proposal_review`: 3 rejeitadas e 2 notas. `propose_changes` com `supersedes` devolveu a anterior como `superseded` (aplicada, com a nota); a app mostra "Aplicada · substituída por …" e "Abrir a nova". |
| R7.2 | ✅ | Cópia nova `principal-reparo` (sem `backups/`). Par `extra`=`x` no User do Formulário; `id` do par igualado ao do `nome` na cópia; **Abrir** mostrou o diálogo "Projeto com dados inconsistentes" (1 problema: id de par repetido); **Reparar e abrir**: Diagnóstico só com a linha `open.repair` (`new-id annotation … duplicate-entry-id`) e **sem** linha `folders.reopen`. Depois de uma edição (nome do Formulário + "!"): **Disco:** `revision` 75; `extra` com id novo (`acf08b96-…`); o Input de Nome segue em `User.nome` (`a1986afd-…`); 1 arquivo em `backups/` (`mapping.v10.20261018-213752.json`). |
| R9.7 | ✅ | Numa tela nova "Teste97" (ver Achado 2): Text field em X 40, Y 220; Button em X 80, Y 230. Com o Button à frente ("2 de 2") ele cobre o começo ("Inp…"); **Mover para trás** ("1 de 2"): "Input text" aparece inteiro sobre o botão. |
| Visual: Diagnóstico | ✅ | A 1540 px a aba ativa fica visível na faixa. A 902 px (viewport): ao abrir com **Ctrl+Shift+6** a faixa rola e a aba fica visível (`visível=true`, `scrollLeft` 86). Abaixo de 900 px a app mostra "Abra numa janela maior" (886 px). |
| Visual: Camadas | ✅ | Hover no selo "Modelo de d…" (Classes): tooltip "Especialização Modelo de dados". Conferido em `principal-reparo`, que é cópia do `principal`; a `telas` só tem o selo "Material Desi…". |

## Achados

1. **Média — R5.3: rejeitar pelo ✕ do cartão não abre a nota.**
   - **Passos para reproduzir:** abrir a proposta da `importacao` em revisão; no cartão da anotação Button do Entrar, clicar no ✕ com o mouse.
   - **Esperado:** o campo "Nota para o agente" abre vazio e com foco; vazio, some ao sair.
   - **Obtido:** nenhum `textarea`; foco no `body`. Igual com ✕ depois de **Limpar** e com **Rejeitar** no balão da marcação (caminho do guia).
   - **Contorno:** abrir a nota pelo botão de nota do balão (abre vazio e com foco).
   - **Anexos:** `anexos-2026-10-19-pr177/achado-1-R5.3-medicao.txt` e `achado-1-R5.3-proposal.json` (na pasta de trabalho do testador).
2. **Baixa — R9.7: a paleta adiciona na foto central.** Com a tela Detalhes selecionada (por clique no fundo ou numa marcação dela), **Adicionar** do Catálogo pôs o Text field em `cadastro.png` (a imagem no centro da janela), 3 vezes; desfeito a cada vez. Numa tela nova, que fica centralizada, funcionou. Não verifiquei se a regra é "a imagem no centro da janela" ou "a última imagem em foco".

## Regressões fora do alvo

Nenhuma observada.

## Observações (sem severidade)

1. A data do build em Sobre é `2026-10-19`, e o esperado era `2026-10-18` (mesmo commit `6e66293`).
2. O primeiro Tab sintético não tirou o foco do campo de nota (como no Apêndice A); foi preciso um segundo.
3. Se a janela é estreitada depois do Diagnóstico aberto, a aba ativa fica fora da faixa até ser reativada; ao abrir já estreita, fica visível.
4. O botão "↓" do painel inferior de revisão move a seleção para o próximo pendente (não recolhe o painel).
5. A conferência do `sha256` do `mapping-mcp.js` não leu o arquivo `.sha256` (caminho diferente do esperado); `--version` mostrou `0.5.0-rc.1`.
6. A revisão do R4 da `loja` ficou aberta e sem aplicar; a entrada "Loja" nos recentes é "Neste dispositivo, Alterações não exportadas".
7. A `telas` ficou com uma tela a mais ("Teste97", com Text field e Button) por causa do R9.7; a `principal-reparo` ficou com o nome do Formulário "Formulário!".

## O que atrapalhou

- **Git na pasta montada:** `git pull` falhou ("unable to unlink", `index.lock`, `Operation not permitted`); foi preciso pedir a permissão de apagar, remover o `.git/index.lock` deixado pelo comando e guardar à parte o arquivo não rastreado `tests/components/review/deselect.test.tsx` (`deselect.test.tsx.untracked-bak`).
- **`gh` sem autenticação** (contêiner e computador): o Deploy foi disparado pela página do GitHub (Actions › Deploy › Run workflow, campo `branch` = `epic/biblioteca`).
- **Build do preview:** estava em `62b9c54`, depois `06489f3`; só bateu depois do Deploy #261 e de **Atualizar**.
- **`importacao` e `principal-reparo` de ontem:** foi preciso mover as pastas de ontem para fora das raízes (`importacao-ontem/`, `principal-reparo-ontem/`) para ter cópias novas.
- **R9.7 no guia:** o texto manda "clicar no fundo da tela e Adicionar", mas a paleta usa a imagem central; o passo também cita o "Row" ("2 de 4"), que não existe numa tela nova, então a ordem foi conferida só entre o Text field e o Button. Sugestão: dizer no guia em que tela adicionar.
- **R7.2 no guia:** a cópia do `principal` já trazia o par `r6`; foi preciso conferir que o `extra` novo era o par repetido.
- **R5.3:** o texto "pelo ✕ do cartão" não funciona hoje (Achado 1); o caminho "Rejeitar no balão" também não abriu a nota.
- **`browser_batch`:** 10 esperas de 10 s estouraram o tempo; usei no máximo 6 × 10 s. O atalho de zoom do navegador não é aceito pela extensão; usei um `keydown` Ctrl+= disparado por script.
- **Nada** de captura em arquivo foi copiado para o repositório, só os anexos do achado 1 na pasta de trabalho.
