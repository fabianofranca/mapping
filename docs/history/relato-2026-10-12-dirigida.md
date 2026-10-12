> **Relato da rodada 2 (dirigida)**, feita em 2026-10-12 pelo agente do Cowork no computador do dono, sobre o build `db5060d` (etapa 6 concluída), com o prompt [`etapa-6-testes-cowork.md`](etapa-6-testes-cowork.md) no modo dirigido: R0 e os achados 2 a 15 de [`relato-2026-10-11.md`](relato-2026-10-11.md). Confirmou 12 achados corrigidos e 2 em parte; os 3 achados (A1 a A3) e as 4 regressões (G1 a G4) originaram a **etapa 7** (concluída; plano e decisões em [`PLAN-etapa-7.md`](PLAN-etapa-7.md), nesta pasta). Guardado como veio, sem edição.

---

# Relato de teste — Mapping

- Modo: dirigido — R0 e os achados 2 a 15 de docs/history/relato-2026-10-11.md
- Build id: db5060d · 2026-10-12
- Canal (como a app mostra): estável
- Forma de abrir: versão principal (`https://fabianofranca.github.io/mapping/`); R0.5 pelo `index.html` avulso (`file://`) e R0.6 pelo app instalado, ambos pelo dono
- Navegador e versão: Google Chrome 155.0.8059.40 (perfil normal do dono, extensão Claude in Chrome; DPR 1,25; viewport 1536 × 639 com a janela maximizada)
- Sistema operacional: Windows (x64), máquina `galaxy-book-ff`
- Data: 2026-10-12
- Testador: agente (Claude, Cowork) no Chrome do dono, com o dono nos passos **[pessoa]**; shell Linux (VM do app Claude) com a pasta `mapping-testes` montada
- MCP: 0.3.2 (`node tools/mapping-mcp.js --version`), Release `mcp-v0.3.2` (sha256 `c6949e05…00ced`, conferido com o `.sha256` da Release)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-12\`

## Resumo

- Passos: 58 linhas (52 passos do guia, contando o R5.1 com o Claude Code, e 6 da passada visual): 57 ✅ (6 com ressalva) e 1 ❌ (Visual: diálogos, foco).
- Achados 2 a 15 da rodada 1: **corrigidos 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14 e 15**; **4 e 6 corrigidos em parte** (A1: o foco ainda cai no `body` no Exportar, no Escolher alvo e no Referências vão quebrar; A2 e A3: dois textos ainda cobertos ou cortados).
- Achados nos alvos: 3 (A1 média; A2 e A3 baixas). Regressões fora do alvo: 4, todas baixas (G1 a G4). Observações: 4.
- Impede o uso com pessoas? **Não.** Nenhuma perda de dados, nenhum projeto que não abre, nenhuma gravação que falha em silêncio: o "Salvar como" cancelado mantém o aviso de não exportado (7), e a alteração externa com a gravação em erro é detectada sozinha (8).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1  | 2 | ✅ | A aba abriu em `5e78241` (service worker antigo); a faixa "Nova versão disponível." apareceu e **Atualizar** levou a `db5060d · 2026-10-12`. Tela inicial com **Começar**, **Novo projeto**, **Abrir pasta**, **Abrir zip**; lateral com **Projetos**, **Ajuda** e **Configurações**. Configurações › Sobre: `db5060d · 2026-10-12`, canal estável, formato 8; **sem barra horizontal** (diálogo 478/478, nenhum elemento rolável na horizontal). Esc devolveu o foco ao botão **Configurações** (achado 4). |
| R0.2  |  | ✅ | Seletor e permissão pelo dono. "Criar projeto nesta pasta?": o campo vazio com `fumaca-web` só como placeholder; editor com "Nenhuma imagem ainda" e **Pasta**. Disco: `mapping.json` (revision 0, nome `fumaca-web`) e `.gitignore` com `backups/`; sem `images/`. |
| R0.3  |  | ✅ | Imagem colada (colar sintético, ver "O que atrapalhou"): nome `img-20261012-045606.png`, e não `.webp`: o arquivo colado (PNG de 11 487 bytes) ficou no formato original, o caso documentado na seção 4 ("Só se o WebP sair maior…"). No R0.5/R0.6, com o `cadastro.png` regravado pela transferência (17 257 bytes), saiu `cadastro.webp` (13 128 bytes). Marcação desenhada e selecionada. Fechar voltou à tela inicial sem perguntar; `fumaca-web` no topo de **Projetos recentes** com o selo **Pasta**. Disco: revision 2, 1 imagem 484×450, 1 marcação (31,145 · 360×38). |
| R0.4  |  | ✅ | F5 (`navigation.type = reload`); **Abrir** na linha `fumaca-web` (topo, selo **Pasta**) abriu **sem pedido de permissão** (ficou guardada no R0.2) e sem o seletor; **a aba continuou de pé**. Abaixo de 900 px (janela a 860 px, `innerWidth` 847): só "Abra numa janela maior" ("O Mapping precisa de pelo menos 900 px de largura…"); Delete e Ctrl+Z sem efeito; ao alargar, a marcação lá e selecionada. Disco: revision 3, 1 marcação (a revision 3 vem do Delete acidental desfeito antes; ver "O que atrapalhou"). |
| R0.5  |  | ✅ | Feito pelo dono (a extensão não abre `file://`): `index.html` avulso `db5060d · 2026-10-12` baixado do artefato `index-html` do Deploy da `main` e aberto por `file://`; tela relatada sem problemas. Disco conferido: `fumaca-arquivo/` com `mapping.json` (revision 2, nome `fumaca-arquivo`), `.gitignore` com `backups/`, `images/cadastro.webp` 484×450 e 1 marcação. |
| R0.6  |  | ✅ | Feito pelo dono no app instalado; tela relatada sem problemas. Disco conferido: `fumaca-pwa/` com `mapping.json` (revision 2, nome `fumaca-pwa`), `.gitignore` com `backups/`, `images/cadastro.webp` 484×450 e 1 marcação. |
| R0.7  |  | ✅ | Pasta renomeada pelo shell para `fumaca-web-2`. **Abrir**: "Pasta indisponível" — "A pasta \"fumaca-web\" não foi encontrada (ou não tem mais o mapping.json): ela pode ter sido movida, renomeada ou apagada." e "Remover da lista não apaga nada do disco.", com **Cancelar**, **Remover da lista** e **Localizar pasta…** (sem barra horizontal). **Localizar pasta…** (seletor e permissão pelo dono) abriu o projeto; na lista, `fumaca-web` com `fumaca-web-2` embaixo. **Remover da lista** tirou a linha (o foco foi para o `body`; regressão G4). Disco: `fumaca-web-2` intacta (revision 3, 1 imagem, 1 marcação). |
| R1.1  | | ✅ | Pasta `repo-teste/design/mapeamentos/principal` (seletor e permissão pelo dono; criada direto no repositório de teste, para o R5 sem mover a pasta). "Criar projeto nesta pasta?" com `principal` só como placeholder. `cadastro.png` pelo campo de arquivo (injetado): `images/cadastro.png` 484×450 (PNG; o WebP saiu maior). |
| R1.2  | | ✅ | Camada `Model` na lista e em `layers`. |
| R1.3  | 3 | ✅ | Especializações pelo campo de arquivo do diálogo (injetado): "\"SDUI\" aplicada: 3 camada(s) criada(s)." e "\"Modelo de dados\" aplicada: 2 camada(s) criada(s).". **Camadas baixa (altura padrão): cada linha com o selo inteiro dentro dela** (ex.: linha 385–439, selo 413–435), sem cobrir a de baixo, e a lista rola. Disco: `specs/sdui.json`, `specs/modelo-dados.json`, `specializations` com as duas. Diálogo sem barra horizontal. |
| R1.5  | 4 | ✅ | **Atualizar versão…** com o mesmo `sdui.json`: "Nada a fazer" — "\"SDUI\" já está no projeto na versão 2. O arquivo é a versão 2; só versões maiores atualizam."; `revision` igual (5). **Esc no "Nada a fazer" devolveu o foco ao botão Atualizar versão… do diálogo Especializações; Esc no Especializações devolveu ao botão Especializações** (achado 4). |
| R1.6  | | ✅ | Árvore: Formulário com Nome, Idade, E-mail e Cadastrar; Título na raiz. Disco: 6 `markings`, filhas com `parentId` do Formulário e `rect` dentro dele. A etiqueta da filha selecionada cobre o rótulo do pai (achado A2). |
| R1.7  | 4 | ✅ | User com `name: string` e `age: number`, cada par com `id`. Depois de **+ Par** o foco foi para **Chave**, e **Enter na Chave levou o foco ao Valor** nas duas vezes (achado 4). |
| R1.8  | 5 | ✅ | Classe · Contato: `revisadoEm` `2026-10-12` (valor do campo de data), `atributos` com 1 linha (`email`, `String`, `obrigatório` sim por padrão, `ana@exemplo.com`) com `_id`. **Colunas lado a lado na largura padrão de Detalhes**: nome 1100–1170, tipo 1174–1244, sim/não 1249–1342, exemplo 1346–1416 (achado 5). O `exemplo` aparece cortado ("ana@exe") e o campo não tem `title` (achado A3). Recolhida: "Classe · Contato — nome: Contato · versão: 1 · revisado em: 2026-10-12". |
| R1.9  | 4 | ✅ | "Escolher alvo de \"dado\"" (aceita: data-field e livres) lista só `User.name`, `User.age` e `Contato.email`. Ao escolher com Enter, o foco foi para o `body` (achado A1). |
| R1.10 | | ✅ | Os três `values.dado` são objetos de referência (`annotationId` + `entryId`; `annotationId` + `key` + `rowId` para a linha da Classe). Foco no `body` de novo depois de escolher o alvo (achado A1). |
| R1.11 | | ✅ | `estilo` = primary e `habilitado` = sim já preenchidos. |
| R1.13 | 2 | ✅ | "← Input input_nome (Nome)" e "← Input input_idade (Idade)". O link levado ao campo por `scrollIntoView` e clicado selecionou o Input **sem deslocar o editor** (`.editor` com `scrollLeft` 0, nenhuma barra horizontal; achado 2, item 3). |
| R1.14 | 6 | ✅ | `name` → `nome`: o Input mostra `dado` "→ User.nome" e o campo tem `title` "→ User.nome (Model)" com o valor inteiro (achado 6). Cosmético: o ícone de seta e o texto "→" aparecem juntos ("→ → User.nome"). |
| R1.15 | 6, 4 | ✅ | A dica "Mostrar Classe · Contato" sai inteira (991–1136, presa à janela). Com o menu "Ações da linha email" aberto, a dica não cobre o menu (achado 6). "Referências vão quebrar": "A linha \"email\" é alvo de 1 referência(s), que vão ficar quebradas. Dá para desfazer."; E-mail "Incompleta: 1 pendência" com "referência quebrada"; Ctrl+Z tirou a pendência. Depois de **Excluir**, o foco foi para o `body` (achado A1). |
| R1.20 | 6 | ✅ (só o Nome) | Nome selecionado e zoom a 200% (`Ctrl+=` por `keydown` sintético): o cartão do Input com `dado: → User.nome`. A essa escala, "Formulário" e o nome "Nome" ficam em linhas separadas (sem cobrir). O Cadastrar não foi conferido (o onClick do R1.16 está fora da lista). |
| R1.22 | 7 | ✅ | O dono cancelou o "Salvar como": o diálogo Exportar continuou aberto. Na segunda vez, salvo pelo dono: `principal.zip` (o Chrome sugeriu a pasta do projeto; movi o zip para a pasta do dia). Zip com `mapping.json`, `images/cadastro.png` e `specs/` (`sdui.json`, `modelo-dados.json`); o `mapping.json` é idêntico ao da pasta. O diálogo não fechou depois desse salvar (observação O1). |
| R2.1  | 7 | ✅ | **Novo projeto** › `Local` › **Criar** (Enter). Barra de status: **Neste dispositivo** e **Alterações não exportadas** já com o projeto vazio. Diálogo "Novo projeto" sem barra horizontal e com o foco no campo. |
| R2.2  | 7, 4 | ✅ | `cadastro.png` pelo campo de arquivo da app (injetado; ver "O que atrapalhou"): `images/cadastro.png` (PNG, o WebP saiu maior). Formulário e Título desenhados e nomeados. User em Camada 1 com `name` = `string`: depois de **+ Par** o foco foi para **Chave**, e **Enter na Chave levou o foco ao Valor** (achado 4). **Alterações não exportadas** continua. |
| R2.3  | 7 | ✅ | `Local`: "Salvar como" cancelado → o diálogo continuou aberto e, fechado, **Alterações não exportadas** continuou na barra. Depois, salvo (`Local.zip`, 12 539 bytes): o diálogo fechou e o aviso sumiu; na tela inicial, `Local` sem o aviso. |
| Seção 5 | 12–15 | ✅ | `repo-teste/` com `git init`, `tools/mapping-mcp.js` da Release `mcp-v0.3.2` (sha256 conferido, `--version` 0.3.2), `design/mapeamentos/` e `.mcp.json`. Cliente MCP próprio (JSON-RPC por stdio) rodando no shell; segunda raiz `assets/` com o `sdui.json` e os prints (ver "O que atrapalhou"). |
| R4.1  | 10 | ✅ (com ressalva) | `proposta-exemplo.zip` aberto pelo campo de arquivo da tela inicial (injetado). Loja neste dispositivo; em Propostas, "Checkout a partir do Figma" com **Revisar**. **Sem** "1 proposta(s) nova(s)" na barra de status nesta primeira importação: efeito de uma entrada antiga do `mapping.reviewResume` (rodada 1) — regressão G1. Numa segunda importação do mesmo zip, a barra mostrou "1 proposta(s) nova(s)". |
| R4.2  | 11 | ✅ (com ressalva) | Cabeçalho → `Topo`. **Revisar**: "Somente leitura" nas duas barras; o nome como **Conflito** com Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`. Os selos (Criada, Removida…) estão na lista **Nível** da janela Propostas; a Árvore de marcações mostra o projeto da visão (6.5) sem selos (ver "O que atrapalhou"). A primeira abertura disse "A revisão voltou ao ponto onde você parou." e abriu na visão Atual (regressão G1). |
| R4.3  |  | ✅ | Proposto: Confirmação e Campo Cupom tracejados com o selo **+** (o selo do Campo Cupom só aparece com zoom ≥ ~80%; a 25–45% a marcação é pequena e fica sem selo nem nome); **Banner promoção hachurado, nome riscado e selo −**. Atual: sem Confirmação nem Campo Cupom. |
| R4.4  |  | ✅ | Botão Pagar: aviso **Item trancado** "Aceitar mudanças de posição ou remoção é permitido na revisão. A trava continua ligada depois de aplicar."; no cartão da mudança Posição, o selo **Trancado** com a dica "Item trancado: aceitar é permitido e a trava continua". |
| R4.5  |  | ✅ (com ressalva) | **Rejeitar item** no Campo Cupom rejeita as duas mudanças diretamente ("2 mudança(s) rejeitada(s).", sem a marca **junto**). A marca **junto** e "… mudou(aram) junto, pelas dependências." aparecem ao rejeitar só a criação da marcação (a anotação vai junto) e ao aceitar a anotação (a criação volta a **Aceita**, com **junto**). Ver "O que atrapalhou". |
| R4.6  |  | ✅ | Confirmação: **Aceitar imagem** (2 mudanças). Cabeçalho: na visão Proposto a Árvore mostra `Cabeçalho do checkout`; **Rejeitar item** e a nota "O nome antigo do cabeçalho estava certo." (**Adicionar nota**). Proposta **Parcial** (ícone meio cheio) e **Aplicar aceitas · 4**. |
| R4.7  |  | ✅ | "4 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez."; **Sair da revisão** sem lembrete; "Somente leitura" some; Árvore com Topo, Banner promoção, Campo Cupom, Confirmação e Mensagem de sucesso. |
| R4.8  |  | ✅ | Um Ctrl+Z tirou Campo Cupom, Confirmação e Mensagem de sucesso; Ctrl+Shift+Z trouxe de volta. |
| R4.9  | 11 | ✅ | **Continuar**; Banner promoção (visão Atual; na Proposto ele não está na Árvore) › **Aceitar item**. Fechar (sem lembrete), reabrir pela linha `Loja`: "1 aceita aguardando aplicação"; **Continuar**: "A revisão voltou ao ponto onde você parou.", decisões e a nota preservadas, **nenhum Conflito novo**. **Sair da revisão**: "Sair da revisão?" com "1 aceita(s) aguardando aplicação", **Continuar revisando**, **Sair mesmo assim**, **Aplicar agora · 1** (sem barra horizontal); **Continuar revisando** manteve a revisão e devolveu o foco ao botão **Sair da revisão**. |
| R4.9 (Diagnóstico) | 10 | ✅ | Diagnóstico ao fim do R4.1–R4.9 (mesma sessão da página, desde 05:22): "Nenhum erro registrado."; console sem erros. |
| R4.10 | 10, 11 | ✅ | `Loja.zip` salvo pelo dono: `proposals/checkout-figma/proposal.json` com `decisions` (5 aceitas, 1 rejeitada) e a nota; `proposals/checkout-figma/images/carrinho-v2.png` (a `confirmacao.png` foi para `images/` ao aplicar). **Abrir zip** (seletor pelo dono): a revisão continuou com as mesmas decisões (5/5/1, "1 aceita aguardando aplicação"), sem "Conflito novo". **Diagnóstico: "Nenhum erro registrado."** em toda a sessão da página, que cobriu R4.1 a R4.10. |
| R4.11 |  | ✅ | Pasta `loja` (descompactada pelo shell; seletor e permissão pelo dono), `revision` 0. **Aceitar imagem** na Confirmação aceitou as 2 mudanças; Cabeçalho rejeitado; **Sair mesmo assim**: "2 aceitas aguardando aplicação". Disco: `proposal.json` com `c3`, `c7` aceitas e `c4` rejeitada; `mapping.json` com o mesmo md5. |
| R6.8  | 8 | ✅ | `loja`: **Em lote** › **Aceitar tudo** (11), cópia em `anexos/snap/loja-R6.8-antes.json`, `mapping.json` somente leitura (`chmod a-w` pelo shell; conferido que a escrita falha). **Aplicar aceitas · 11**: "Não foi possível gravar o mapping.json: nada foi aplicado e as decisões continuam como estavam." (e **Erro ao salvar** na barra). Disco: `mapping.json` igual à cópia; `proposals/checkout-figma/images/` intacta; `images/` só com as duas originais. |
| R6.9  | 8 | ✅ | **Sair mesmo assim**; Título → `Título app` (Enter): **Erro ao salvar** · **Tentar de novo**. **Fechar projeto**: "Fechar sem salvar?" ("As últimas alterações não foram salvas. Se fechar agora, elas serão perdidas.") com **Fechar mesmo assim**; **Cancelar** manteve o projeto e a edição. |
| R6.10 | 8, 9 | ✅ | `Rodapé` → `Rodapé externo` pelo shell (`chmod u+w`, edição, `chmod a-w`) às 15:33:58 UTC; clique numa área vazia do canvas; às 15:34:06 o diálogo **"Projeto alterado fora da app"** já estava aberto, **sem clicar em botão nenhum** (página visível e com foco), com **Recarregar** e **Manter as minhas**. **Sem X**; Esc e o clique fora não o fecharam; `Título app` continuou na tela; sem barra horizontal. |
| R6.11 | 8 | ✅ | Permissão devolvida; **Manter as minhas** fechou o diálogo e gravou. Disco: `Título app` presente, sem `Rodapé externo`, `revision` 1 (o arquivo editado à mão estava em 0). `anexos/snap/loja-R6.11-depois.json`. |
| R7.2  | 6 | ✅ | `principal-reparo` (cópia pelo shell, sem `backups/`, `project.name` trocado; **Abrir pasta** pelo dono; botão do projeto `principal-reparo`). Par `extra` = `x`; `id` de `nome` copiado para `extra`; reaberto pelos recentes: "Projeto com dados inconsistentes" com o problema e o reparo; **Reparar e abrir**. **Diagnóstico: Hora `12:36:53` e Contexto `open.repair` numa linha só** (células com 30 px de altura; achado 6). **Copiar**: "Copiado."; `errors: 2`, linha em branco, `[open.repair] 1 reparo(s): new-id annotation … "User" (duplicate-entry-id)` (o outro erro é o `save` do R6.8, da mesma sessão). Depois de uma edição: "Uma cópia do original foi guardada em backups/."; `extra` com id novo, `input_nome` ainda em `nome`, um único backup igual ao arquivo quebrado. `anexos/R7.2-diagnostico.txt`. |
| R5.1  | 6 | ✅ (agente) | Ctrl+C no Nome: "Referência copiada"; área de transferência: `mapping://principal/m/946621de (cadastro.png › Formulário › Nome)` — **sem `images/`** (achado 6). `list_projects` traz o `principal`; `resolve` devolve a marcação Nome com o mesmo caminho; `get_marking` com o caminho cadastro.png › Formulário › Nome; `get_marking_image` um PNG 345×42 da região exata. `mapping.json` com o mesmo md5 antes e depois. Teste com o Claude Code do dono: ver a linha seguinte. |
| R5.1 (Claude Code) | 6 | ✅ | Feito pelo dono, no Claude Code aberto em `repo-teste` com o servidor `mapping` do `.mcp.json`: listou os projetos, descreveu a marcação colada (`mapping://principal/m/946621de (cadastro.png › Formulário › Nome)`) com todas as informações e mostrou o recorte (relato do dono). `mapping.json` do `principal` com o mesmo md5 (`124ac27e…`). |
| R5.2  | 12 | ✅ | `create_project` `importacao` (revision 0) e `propose_changes` (22 operações: SDUI, Cadastro e Login com `source`, 9 marcações, 8 anotações); `mapping.json` com o mesmo md5. Na app (**Abrir pasta** pelo dono): proposta **Nova**. **Revisar**: na visão **Atual**, a Árvore diz "Nenhuma imagem ainda."; na **Proposto**, a Árvore lista Cadastro (Formulário, Nome, Idade, E-mail, Cadastrar, Título) e Login (Título login, E-mail, Senha, Entrar), clicar seleciona o item, e o canvas mostra só as imagens propostas, **sem "Nenhuma imagem ainda" por cima** (achado 12). |
| R5.3  | 6 | ✅ | Cadastro: "12 mudança(s) aceita(s). 2 mudou(aram) junto, pelas dependências."; Login aceita; Senha rejeitada com nota; no Entrar, rejeitada só "Anotação Button criada", com nota (Entrar **Parcial**). **O título mantém a caixa "Anotação Button criada" na lista e em Detalhes, antes e depois de rejeitar** (achado 6). **Aplicar aceitas · 20**: "20 mudança(s) aplicada(s)…"; disco: `images/cadastro.webp`, `images/login.webp`, `specs/sdui.json`, 9 marcações e 7 anotações. Ctrl+Z: `images/` e `specs/` vazias, 0 marcações; Ctrl+Shift+Z: tudo de volta (revision 3). |
| R5.4  | 13, 15 | ✅ | Revisão concluída (Eventos e Telas aceitas pelo nível Projeto e aplicadas; proposta **Aplicada**). `get_proposal_review`: as 3 rejeitadas (a Input da Senha com `via`) e as 2 notas, `ready: true`. Nova proposta com `supersedes` (Text `link_entrar` no Entrar): `superseded: { status: "applied", note: "…continua applied…" }`; na app, a anterior **"Aplicada · substituída por Correções: Entrar como link"** com **Abrir a nova** (achado 13). Antecipada: "Lembrar senha" (marcação com `source`, Input e Button sem) e a substituta com `placeholder`: `superseded-incomplete` com **`inNewProposal: same 2, different 1, missing 0`** (achado 15); na app, **Substituída**, "3 sem decisão ficaram para trás", **Abrir a nova**; aberta (**Ver**): "Esta proposta foi substituída por outra." e "igual na nova" na marcação e no Button, "diferente na nova" no Input. `mapping.json` sem mudança em todas as chamadas. |
| R5.5  | | ✅ | Proposta "Renomear título" e, **depois**, Título login → `Entrar na conta` na app. Revisão: **Conflito** com Atual `Entrar na conta`, Antes `Título login`, Depois `Título da tela`. |
| R5.6  | 14 | ✅ | Proposta "Mover Entrar" (dy 10); Entrar trancado com `Alt+L` (disco `locked: true`). Na revisão: aviso **Item trancado** com o texto do R4.4 e a dica "Item trancado: aceitar é permitido e a trava continua". Aplicada: `rect` y 270 → 280, `locked: true`. A proposta só apareceu em Propostas depois de **Verificar a pasta agora**, porque a página estava oculta (ver "O que atrapalhou"). |
| R5.7  | 14 | ✅ | Reexportação com `update_image` e `update_marking` de tudo (nome, `rect` e `source` atuais, inclusive o Entrar trancado): **`no-changes`** ("a reexportação coincide com o projeto atual"). Com Cadastrar → `Criar conta`: proposta com **1 mudança** (`update` 1). `mapping.json` com o mesmo md5. |
| R8.2 (só a Loja) | 11 | ✅ | Idioma **English (US)**; fechar e reabrir a Loja; **Continue**: "The review is back where you left off.", nenhum "New conflict" nem "changed since your last session"; "Read-only", "REVIEW", "Apply accepted · 1". Voltou para Português. |
| Visual: Configurações e Especializações | 2, 4 | ✅ | Sem barra horizontal; Esc e **Fechar** devolvem o foco ao botão que abriu. |
| Visual: Camadas | 3 | ✅ | Com as 5 camadas de especialização e a janela baixa, linhas de 54 px com o selo dentro e a lista rolando; nenhuma barra horizontal. |
| Visual: Detalhes | 2, 5, 6 | ✅ (com ressalvas) | Sem barra horizontal e sem deslocar o editor; tabela `atributos` sem sobreposição; `title` no valor de referência. Ressalvas: `exemplo` cortado sem `title` (A3); etiqueta da filha selecionada sobre o rótulo do pai no canvas (A2); seta dupla em "→ → User.nome". |
| Visual: Diagnóstico | 6 | ✅ | Hora e Contexto numa linha (também com a janela de baixo na altura padrão); sem barra horizontal. |
| Visual: Árvore | 2 | ✅ | Sem barra horizontal; na revisão lê a visão (Atual/Proposto). |
| Visual: diálogos | 2, 4 | ❌ | Nenhum com barra horizontal (Novo projeto, Criar projeto nesta pasta?, Pasta indisponível, Exportar, Especializações, Nada a fazer, Nova anotação em…, Escolher alvo, Referências vão quebrar, Sair da revisão?, Fechar sem salvar?, Projeto alterado fora da app, Projeto com dados inconsistentes, Excluir projeto?). Foco: volta certo em Configurações, Especializações, Nada a fazer, Sair da revisão?, Excluir projeto? (Cancelar); **cai no `body`** no Exportar, no Escolher alvo e no Referências vão quebrar (achado A1). Na Ajuda, um bloco de código (`pre`) rola na horizontal (observação O3). |

## Achados

Achados nos passos da lista: o que ainda falha em achados da rodada 1 que a etapa 6 corrigiu.

### A1. Foco ainda cai no `body` ao fechar alguns diálogos (resto do achado 4)

- Severidade: média (quem usa teclado perde o lugar, o mesmo impacto do achado 4)
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir:
  1. Num projeto, foque **Exportar** (clique ou `focus()`) e aperte Enter; espere "… está pronto."; aperte Esc (ou **Cancelar**, ou salve pelo "Salvar como").
  2. Num Input, **dado** › **Escolher…**, escolha um alvo com Enter.
  3. Na tabela `atributos`, menu "Ações da linha email" › **Remover linha** › **Excluir** no "Referências vão quebrar".
- Esperado: o foco volta ao botão que abriu (Exportar; o campo `dado`; o botão de ações da linha ou a tabela).
- Observado: `document.activeElement` = `BODY` nos três casos. Nos outros diálogos conferidos (Configurações, Especializações, Nada a fazer, Sair da revisão?, Excluir projeto?) o foco volta certo. Provável causa: o botão que abriu sai do DOM ou é trocado (o campo `dado` vira o valor escolhido; o item de menu fecha com o menu); no Exportar, o zip é gerado antes de o diálogo abrir, então o foco já não está no botão quando o `Dialog` guarda o abridor.
- Reproduziu de novo? sim (Exportar 3 vezes, Escolher alvo 2 vezes, Remover linha 1 vez)
- Anexos: —

### A2. A etiqueta da filha selecionada cobre o rótulo do pai no canvas (resto do achado 6, item 8)

- Severidade: baixa
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: `principal` a 52%; selecione **Nome** (filha do Formulário, encostada no topo dele).
- Esperado: o nome da filha não cobre o do pai.
- Observado: a etiqueta azul "Nome" fica por cima do rótulo "Formulário …" ("Fo[Nome]ulário"). A 200% os dois ficam em linhas separadas. A correção da 6.4 cobre o rótulo de filha não selecionada e a etiqueta que encosta no título da imagem, mas não a etiqueta da selecionada sobre o rótulo do pai.
- Reproduziu de novo? sim (no R1.6 e no R1.9)
- Anexos: —

### A3. Célula `exemplo` da tabela cortada, sem `title` (texto cortado sem versão completa)

- Severidade: baixa
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: Classe · Contato › `atributos` com `exemplo` = `ana@exemplo.com`, Detalhes na largura padrão.
- Esperado: o texto inteiro visível ou numa dica.
- Observado: a célula mostra "ana@exe" (`scrollWidth` 126 × `clientWidth` 68) e não tem `title`; só dá para ler inteiro com o foco no campo. A 6.4 pôs `title` só nos valores de referência.
- Reproduziu de novo? sim
- Anexos: —

## Regressões fora do alvo

### G1. Entrada antiga do "retomar revisão" faz a primeira cópia nova da Loja herdar o estado da rodada 1

- Severidade: baixa (acontece uma vez por entrada antiga; nenhuma decisão perdida)
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: com um `mapping.reviewResume` da rodada 1 no `localStorage` (chave antiga `checkout-figma`, sem a cópia do projeto), **Abrir zip** › `proposta-exemplo.zip` e **Revisar**.
- Esperado (R4.1): "1 proposta(s) nova(s)" na barra de status; a revisão começa do início.
- Observado: sem "1 proposta(s) nova(s)"; o primeiro **Revisar** já disse "A revisão voltou ao ponto onde você parou." e abriu na visão Atual com a seleção da sessão antiga. A entrada antiga foi regravada como `local:<id>|checkout-figma`; numa segunda importação do mesmo zip, a barra mostrou "1 proposta(s) nova(s)". Causa provável: `seen` em `src/store/review.ts` começa com as chaves da entrada antiga (`initial.legacy`), que valem para qualquer cópia (decisão da 6.5: a entrada antiga "devolve posição e filtros").
- Reproduziu de novo? não (a entrada foi migrada na primeira vez)
- Anexos: —

### G2. Projeto aberto do zip entra nos recentes com o "Último uso" da data de dentro do zip

- Severidade: baixa
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: **Abrir zip** › `proposta-exemplo.zip`; feche o projeto sem editar.
- Esperado (6.6): o último uso é o mais recente entre a última alteração e a última abertura, então a Loja recém-aberta vai para o topo, com a data de hoje.
- Observado: a linha nova aparece com "09/10/2026, 09:00" (a data do `mapping.json` do zip) e vai para o fim da lista. Abrir um projeto deste dispositivo já existente (o `Local`) atualiza a data normalmente. No R2.4, os dois `Local` seriam distinguidos pela data do export, não pela abertura.
- Reproduziu de novo? sim (as duas importações do zip)
- Anexos: —

### G3. "Enquadrar tudo" logo depois de fechar a janela de baixo usa o tamanho antigo do canvas

- Severidade: baixa
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: feche a janela de baixo (X) e clique em **Enquadrar tudo** em seguida.
- Esperado: as imagens enquadradas no canvas maior.
- Observado: o enquadramento usa a altura de antes (a imagem fica só na parte de cima, 10% e 21%); um segundo clique enquadra certo (45% e 52%).
- Reproduziu de novo? sim (na Loja e no `Local`)
- Anexos: —

### G4. "Remover da lista" deixa o foco no `body`

- Severidade: baixa (função nova da 6.6)
- Build id e data: db5060d · 2026-10-12
- Passos para reproduzir: tela inicial › **Remover da lista** numa linha de pasta.
- Esperado: o foco vai para a linha seguinte ou para a lista.
- Observado: a linha sai e o foco cai no `body`.
- Reproduziu de novo? não tentado
- Anexos: —

### Observações (sem severidade)

- **O1. Diálogo Exportar não fechou depois de um "Salvar como" do dono (R1.22).** O arquivo foi gravado certo; o diálogo continuou aberto e sem erro. Na mesma hora, um clique meu em **Baixar** com a janela sem foco não abriu o seletor e não mostrou erro (`saveFileWithPicker` trata a recusa como `cancelled`). Não reproduziu: no R2.3 e no R4.10, com a janela em foco, o diálogo fechou depois de salvar. Pode ter sido a soma dos dois cliques; vale um teste dirigido.
- **O2. Seta dupla** no valor de referência: o ícone → e o texto "→ User.nome" aparecem juntos.
- **O3. Ajuda:** o bloco de código do exemplo de `sources` rola na horizontal (621/570 px). É um `pre`; não afeta o diálogo.
- **O4.** `create_project` do MCP cria a pasta `images/` vazia; a app só a cria com a primeira imagem.

## O que atrapalhou

- **Área de transferência e seletores de arquivo:** o shell que tenho é de uma VM Linux com a pasta `mapping-testes` montada, sem acesso à área de transferência do Windows. Imagens, especializações e zip entraram por **eventos sintéticos**: um `paste` com `DataTransfer` (R0.3), e arquivos injetados nos `<input type="file">` da app (R1.1, R1.3, R1.5, R2.2, R4.1). No R1.5, para o **Atualizar versão…** não abrir o seletor nativo, desliguei o `click()` dos campos de arquivo por script e o religuei antes do **Abrir zip** do R4.10.
- **Janela sem foco e página oculta:** com o app do Claude na frente, a página ficou `hidden` ou sem foco boa parte do tempo. Efeitos: (a) o meu clique em **Baixar**, **Abrir pasta** e **Abrir zip** não abre o seletor nativo (a recusa vira `cancelled`, sem aviso), e o dono teve de clicar ou trazer o Chrome para a frente; (b) a varredura de propostas e a conferência de mudanças externas param (no R5.6 usei **Verificar a pasta agora**). O guia pede "janela à vista"; vale dizer também "com o foco" para os seletores abertos pelo agente.
- **Extensão e `file://`:** a extensão não navega para `file://`, então o R0.5 foi inteiro do dono, como o R0.6.
- **Instalar o app (R0.6) levou a minha aba** para a janela do app; a janela nova do Chrome abriu oculta e o dono precisou trazê-la para a frente.
- **Janela maximizada:** o redimensionamento pela extensão é ignorado com a janela maximizada. Na primeira tentativa do R0.4 o Delete caiu com o editor visível e excluiu a marcação; desfiz com Ctrl+Z (o disco voltou a 1 marcação) e repeti com a janela restaurada pelo dono.
- **Apagar arquivos na pasta montada:** o MCP grava propostas com arquivo temporário + renomear e precisa apagar o temporário; a pasta montada só permite apagar com a permissão do dono. A primeira proposta do R5.2 falhou com `EPERM` (resto movido para `_to_delete/mcp-parcial`); depois da permissão funcionou.
- **Raízes do MCP:** `add_image` e `apply_specialization` só leem arquivos dentro das raízes; usei uma segunda raiz `repo-teste/assets` com o `sdui.json` e os prints.
- **Nome da imagem:** a imagem injetada/colada (PNG de 11 487 bytes) ficou como `.png`, porque o WebP saiu maior (exceção documentada na seção 4); o `cadastro.png` copiado para o disco pela transferência foi regravado (17 257 bytes) e virou `cadastro.webp` (R0.5, R0.6). Quem segue o guia pode estranhar o `.png`.
- **"Salvar como" sugere a última pasta usada:** no R1.22 o zip caiu dentro da pasta do projeto `principal`; movi para a pasta do dia.
- **R4.2 e R4.6, "a Árvore mostra os níveis da proposta com selos":** os selos (Criada, Removida, Conflito…) estão na lista **Nível** da janela Propostas; a Árvore de marcações mostra o projeto da visão (Atual ou Proposto), sem selos, e na visão Proposto não lista o Banner promoção removido (para o R4.9, selecionei-o na visão Atual).
- **R4.5:** **Rejeitar item** no Campo Cupom rejeita as duas mudanças diretamente ("2 mudança(s) rejeitada(s)."), sem a marca **junto**; a marca e "… mudou(aram) junto…" aparecem ao rejeitar só a criação da marcação e ao aceitar a anotação. O texto do guia descreve o segundo caso.
- **R5.4, "aceite o que ainda estiver sem decisão":** **Aceitar tudo** também transforma as rejeitadas em aceitas (desfiz pelo **Desfazer** do aviso). Funcionou: filtro **Sem decisão** e **Aceitar** no nível Projeto. O guia podia dizer isso.
- **Seletores de lista nativos e zoom:** valores escolhidos pelo valor do campo; `Ctrl+=` por `keydown` sintético (convenções do guia).
- **Estado de outras rodadas no navegador do dono:** projetos Loja/Local da rodada 1 e o `mapping.reviewResume` antigo influenciaram o R4.1 (regressão G1). Ficou um terceiro projeto **Loja** neste dispositivo (o de "09/10/2026, 09:00", da segunda importação do zip); não apaguei (exclusão permanente fica com o dono).
- **Itens fora da lista dirigida:** R1.4, R1.12, R1.16 a R1.19, R1.21, R1.23, R1.24, R2.4 a R2.6, R3, R6.1 a R6.7, R7.1, R7.3, R8.1 e o resto do R8.2 não foram executados (não estavam nos achados 2 a 15). O R3 foi dispensado criando o `principal` direto no repositório de teste.
