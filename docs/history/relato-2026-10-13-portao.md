> **Relato da rodada 5 (completa, portão da etapa 8)**, feita em 2026-10-13 pelo agente do Cowork no computador do dono, sobre o build `e701862` (merge do PR #136: etapa 8 até a fase 8.7 parte 1, com as devoluções da segunda leitura), com o prompt [`../TESTING-COWORK.md`](../TESTING-COWORK.md) na rodada completa e o MCP 0.3.3. 98 linhas: 91 ✅ e 7 ❌; 10 achados, nenhum alto, 2 médios. Os médios voltaram às fases donas: o achado 7 à 8.2 (PR #139, corrigido) e o achado 1 à 8.4 (PR #140: não reproduziu, limite registrado e rastro `folders.reopen` no Diagnóstico); o EPERM do MCP ("O que atrapalhou", R3.6) à 8.5 (PR #138, MCP 0.3.4). Os achados 3 e 5 e as ambiguidades do guia foram corrigidos no `docs/TESTING.md` no fechamento; os baixos 2, 4, 6, 8, 9 e 10 e as observações entraram na lista do marco "Uso real" do [`../ROADMAP.md`](../ROADMAP.md). Plano e decisões em [`PLAN-etapa-8.md`](PLAN-etapa-8.md), nesta pasta. Guardado como veio, sem edição.

---

# Relato de teste — Mapping

- Modo: completo (R0 a R8, com a passada visual padrão)
- Build id: e701862 · 2026-10-13 (merge do PR #136; versão principal, depois de **Atualizar** na faixa "Nova versão disponível.")
- Canal (como a app mostra): estável
- Forma de abrir: versão principal (`https://fabianofranca.github.io/mapping/`); R0.5 pelo `index.html` avulso (`file://`, pelo dono) e R0.6 pelo app instalado (pelo dono)
- Navegador e versão: Google Chrome 155 (perfil normal do dono, extensão Claude in Chrome)
- Sistema operacional: Windows (x64), máquina `galaxy-book-ff`
- DPR e viewport: DPR 1,25; 1522 × 632 maximizada no começo; 1318 × 632 restaurada (larga) a partir do R0.4b
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-13\`
- Ferramenta: agente (Claude) com a extensão Claude in Chrome e um shell Linux (VM do app Claude) com a pasta `mapping-testes` montada; o dono nos passos [pessoa]
- Estado prévio do navegador: 24 projetos nos recentes (pastas `importacao` ×2, `loja` ×2, `principal` ×2, `fumaca-pwa` ×3, `principal-reparo`; neste dispositivo `Loja` ×10, `Local` ×4, `Teste`); `mapping.reviewResume` com 12 entradas (`local:…|checkout-figma` ×5, `folder:importacao|…` ×6, `folder:loja|checkout-figma`). Nada apagado.
- MCP: 0.3.3 (`node mapping-mcp.js --version`), Release `mcp-v0.3.3`, sha256 conferido (`sha256sum -c`: OK; `6ba5f81b…669c83`); exercitado por cliente MCP próprio (JSON-RPC por stdio); R5.1 com o Claude Code do dono
- Data: 2026-10-13
- Tempo por roteiro: R0 ~40 min, R1 ~50 min, R2 ~15 min, seção 6 + R3 ~30 min, R4 ~35 min, R6 ~30 min, R7 ~10 min, R5 ~30 min, R8 ~25 min, passada visual ~15 min

## Resumo

Rodada completa (R0 a R8) mais a passada visual padrão, no build `e701862 · 2026-10-13` e com o MCP 0.3.3. São **98 linhas: 91 ✅, 7 ❌ e nenhum passo sem executar**. As 98 linhas são 86 passos e 12 linhas da passada visual.

- **Os 10 achados:** nenhum bloqueia, nenhum é alto, **2 são médios** e **8 são baixos**.
  - **Médios:**
    - 1 (pasta renomeada: depois do pedido de permissão, o "Pasta indisponível" não aparece);
    - 7 ("Aplicar bloqueado" para as mudanças que acabaram de ser aplicadas).
  - **Baixos:**
    - 2 (selo cortado em Camadas);
    - 3 (foco depois de Excluir projeto);
    - 4 (selo esconde o nome do nível na lista da revisão);
    - 5 (dica do cadeado na Árvore em revisão, regressão);
    - 6 ("Copiado." sobre a aba);
    - 8 (divisórias da lista inicial);
    - 9 ("reparo(s)" fixo em português);
    - 10 (legenda de atalhos cortada).
- **Uso com pessoas:** nenhum achado impede. Os dois médios confundem, mas não perdem dados: o 1 se contorna com um segundo **Abrir**, e no 7 a aplicação dá certo apesar do aviso.
- **Disco, gravação e revisão:** as gravações, as conferências de `revision` e de conteúdo, os reparos, os backups e a revisão com retomada se comportaram como o guia descreve.
- **MCP, tema e idioma:** o MCP 0.3.3 se comportou como o guia descreve, e o tema e o idioma também.
- **Erro meu:** no R8.2 tirei sem querer o `principal` (pasta) dos recentes. A pasta está intacta e volta com **Abrir pasta** (ver "O que atrapalhou").

## Passos

| Passo | Resultado | Observação |
| ----- | --------- | ---------- |
| R0.1  | ✅ | Tela inicial com **Começar**, **Novo projeto**, **Abrir pasta**, **Abrir zip**; lateral **Projetos**, **Ajuda**, **Configurações** (e o cartão **Instalar no dispositivo**). Antes, a faixa "Nova versão disponível." › **Atualizar**. Sobre: `e701862 · 2026-10-13`, canal estável, formato 8; diálogo 478/478, sem barra horizontal. **Ver os atalhos de teclado** abriu a Ajuda em Atalhos de teclado; Esc fechou e o foco (`:focus-visible`) ficou no botão **Configurações** da lateral. |
| R0.2  | ✅ | Seletor e permissão pelo dono (apareceu **Permitir em todas as visitas**). "Criar projeto nesta pasta?" com o campo vazio, `fumaca-web` como placeholder e o foco no campo; **Criar**. Editor com "Nenhuma imagem ainda" e **Pasta**. Disco: `mapping.json` (schema 8, revision 0, nome `fumaca-web`), `.gitignore` com `backups/`, sem `images/`. |
| R0.3  | ✅ | `cadastro.png` injetado no campo de **Adicionar imagens**: `images/cadastro.webp` 484×450. Retângulo desenhado e selecionado; **Salvo**. **Fechar projeto** voltou à tela inicial sem perguntar; `fumaca-web` no topo, selo **Pasta**. Disco: 1 imagem, 1 marcação, revision 2. |
| R0.4a | ✅ | F5; `fumaca-web` no topo (Pasta); **Abrir** abriu direto, **sem pedido de permissão** e sem seletor. A aba não caiu. |
| R0.4b | ✅ | Marcação selecionada; o dono estreitou a janela (`innerWidth` 852): só "Abra numa janela maior" ("O Mapping precisa de pelo menos 900 px de largura…"). Delete; alargada (1318): a marcação continua lá e selecionada. Disco: 1 item em `markings`, revision igual (2). |
| R0.5  | ✅ | Passo inteiro do dono, com o `index.html` avulso (o arquivo traz `e701862 · 2026-10-13`). O dono confirmou o aviso "Aberto como arquivo…" e os passos; Sobre colado: `build: e701862 · 2026-10-13`, `channel: main`, `schema: 8`. Disco de `fumaca-arquivo`: `mapping.json` (revision 2, 1 imagem, 1 marcação), `.gitignore` com `backups/`, `images/cadastro.webp` 484×450. |
| R0.6  | ✅ | Passo inteiro do dono: instalou, o app abriu em janela própria sem a barra do navegador, criou `fumaca-pwa`, adicionou a imagem, desenhou e fechou pelo app instalado (confirmado). Sobre: `e701862 · 2026-10-13`, `channel: main`, `schema: 8`. Disco: o mesmo de R0.2/R0.3 (revision 2, 1 imagem, 1 marcação). |
| R0.7  | ❌ | achado 1. Pasta renomeada pelo shell. 1.º **Abrir**: o navegador pediu a permissão, o dono permitiu, e **nada aconteceu** (tela inicial, sem diálogo, sem erro no console nem no Diagnóstico). 2.º **Abrir**: **Pasta indisponível** com "A pasta "fumaca-web" não foi encontrada (ou não tem mais o mapping.json): ela pode ter sido movida, renomeada ou apagada.", **Cancelar**, **Remover da lista** e **Localizar pasta…**. Localizada `fumaca-web-2` (seletor e permissão pelo dono), abriu; na lista, `fumaca-web` com `fumaca-web-2` embaixo. **Remover da lista** tirou a linha (foco no **Abrir** da linha seguinte). Disco de `fumaca-web-2` intacto (revision 2, 1 imagem, 1 marcação, `.gitignore`). |
| R1.1  | ✅ | Seletor e permissão pelo dono; **Criar** com o nome vazio. `cadastro.png` injetado: `images/cadastro.webp` 484×450 = o PNG (484×450). |
| R1.2  | ✅ | **Nova camada** › "Camada 2" › `Model` + Enter. Disco: camada `Model` (revision 3). |
| R1.3  | ❌ | achado 2. Arquivos injetados no campo de arquivo do diálogo (sem abrir o seletor). Mensagens "\"SDUI\" aplicada: 3 camada(s) criada(s)." e "\"Modelo de dados\" aplicada: 2 camada(s) criada(s).". Cinco camadas com selo; disco: `specs/sdui.json`, `specs/modelo-dados.json`, `specializations` com 2. Linhas de 54 px sem sobreposição, mas o selo **"Modelo de dados" sai cortado ("Modelo de d…")** nas linhas Classes e Endpoints (o regressivo do passo). |
| R1.4  | ✅ | Nome desabilitado e **Excluir camada** desabilitado, os dois com a dica "Camada de especialização: não pode ser renomeada nem excluída. Só dá para remover a especialização."; Esc devolveu o foco (`:focus-visible`) ao ⋮. Cor `#1E88E5` → roxo na paleta: disco `#7E57C2`. |
| R1.5  | ✅ | **Atualizar versão…** com o `click()` dos campos de arquivo desligado por script e o `sdui.json` injetado (religado logo depois): "Nada a fazer" / "\"SDUI\" já está no projeto na versão 2. O arquivo é a versão 2; só versões maiores atualizam.". `revision` igual (6). Esc devolveu o foco a **Atualizar versão…** e, no diálogo seguinte, a **Especializações**. |
| R1.6  | ✅ | Árvore: Formulário com Nome, Idade, E-mail e Cadastrar; Título na raiz. Disco: 6 marcações, as 4 filhas com `parentId` do Formulário e `rect` dentro do dele; X/Y/L/A de Detalhes = `rect` (ex.: Título 25/58/290/51). |
| R1.7  | ✅ | Anotação `User` na Model com `name: string` e `age: number`, cada par com `id`. Enter na Chave levou ao Valor. |
| R1.8  | ✅ | Data preenchida no campo (`2026-10-13`). Tabela `atributos` com as colunas lado a lado; o sim/não termina em x=1136 e o `exemplo` começa em x=1141 (sem cobrir). Recolhida: selo "Classe" e "Classe · Contato — nome: Contato · versão: 1 · revisado em: 2026-10-13". Disco: `type` `modelo-dados/classe`, `revisadoEm` `2026-10-13`, `atributos` com `_id`. |
| R1.9  | ✅ | "Escolher alvo de "dado"" (aceita: data-field e livres) lista só `User.name`, `User.age` e `Contato.email`. |
| R1.10 | ✅ | Os três `dado` gravados como objeto (`annotationId`+`entryId`, ou `key`+`rowId` no Contato.email); `tipo` number/email; `obrigatorio` sim só no E-mail. |
| R1.11 | ✅ | Button com `estilo` = primary e `habilitado` = sim já preenchidos; disco `btn_cadastrar`/`Cadastrar`. |
| R1.12 | ✅ | "obrigatório vazio" em vermelho sob `id`; ⚠ no cabeçalho (ao lado do selo Text), na seção Componentes e no canvas; quadro "Incompleta: 1 pendência"; a anotação na janela **Incompletas** (aba "Incompletas 1"). |
| R1.13 | ✅ | "← Input input_nome (Nome)" sob `name` e "← Input input_idade (Idade)" sob `age`; o clique selecionou **Nome** e mostrou o Input dele. |
| R1.14 | ✅ | Chave `name` → `nome`: o Input do Nome mostra `dado` → `User.nome`. |
| R1.15 | ✅ | "Referências vão quebrar" (`alertdialog`): "A linha "email" é alvo de 1 referência(s)…". Input do E-mail com "Incompleta: 1 pendência" e "referência quebrada". `Ctrl+Z`: linha de volta (`ana@exemplo.com`) e o Input sem pendência. |
| R1.16 | ✅ | onClick (`submit`, `/usuarios`, 1 linha `origem`/`cadastro`), onHold (`track`, `duração (ms)` = 500 já preenchido) e onChange (`validate`, `email`), em **Vinculadas** e na seção Eventos. |
| R1.17 | ✅ | Diálogo "Dono do onClick": "Para criar um onClick, esta marcação precisa de um dono que aceite onClick (Button ou Image)…"; nada criado. |
| R1.18 | ✅ | Endpoint `POST`, `/v1/usuarios`, `request`/`response` = `User` (texto), mais `timeoutMs` 10000 (padrão). 11 anotações. |
| R1.19 | ✅ | Eventos ativa (dica "Ativa"), as outras ocultas, **Ocultar sem anotação**: no canvas só E-mail e Cadastrar, mais o contorno do Formulário. |
| R1.20 | ✅ | Zoom por `keydown` sintético (`Ctrl+=`). Nome a 280%: Input com `dado: → User.nome`; Cadastrar a 297%: onClick com `parâmetros: 1 linha`. |
| R1.21 | ✅ | **Só incompletas**: só a anotação Text do **Título**. |
| R1.22 | ✅ | "principal.zip está pronto." (18,1 KB); salvo pelo dono como `principal-R1.22.zip`; o diálogo fechou e o foco ficou em **Exportar**. Zip: `mapping.json`, `images/cadastro.webp`, `specs/sdui.json`, `specs/modelo-dados.json`; `"duracaoMs": 500`; ids dos pares; `dado` como objeto; 1/6/7/11, igual à pasta (conteúdo idêntico, inclusive a `revision`). Diagnóstico › Copiar: `images: 1, markings: 6, annotations: 11`. |
| R1.23 | ✅ | Aviso "2 anotação(ões) afetada(s): Classes: 1, Endpoints: 1" e "1 referência(s) de outras anotações vão ficar quebradas.". Depois: Classe livre com os pares na ordem `nome`, `versao` = 1, `revisadoEm`, `atributos[1].nome/tipo/obrigatorio/exemplo` (sem `descricao`); E-mail incompleto ("referência quebrada"), Nome e Idade válidos. **Desfazer** voltou tudo (2 especializações, 7 camadas). |
| R1.24 | ✅ | "8 anotação(ões) afetada(s): Componentes: 5, Eventos: 3" (Telas fora da lista); sumiram Componentes, Eventos e Telas; **Desfazer** trouxe tudo; `specs/sdui.json` existe. |
| R2.1  | ✅ | **Novo projeto** › `Local` › **Criar**: editor com **Neste dispositivo** e **Alterações não exportadas** na barra de status. |
| R2.2  | ✅ | `cadastro.png` injetado, Formulário e Título desenhados, `User` com `name` = `string` na Camada 1; o aviso continua. |
| R2.3  | ✅ | "Local.zip está pronto." (13,8 KB). "Salvar como" cancelado pelo dono: o diálogo continuou aberto; fechado com **Cancelar** (foco em **Exportar**), o aviso continuou. Segundo **Baixar**, salvo como `Local.zip`: o diálogo fechou, o aviso sumiu; na tela inicial, `Local` com **Neste dispositivo** e sem o aviso. |
| R2.4  | ✅ | **Abrir zip** com o `Local.zip` injetado: abriu neste dispositivo com a imagem, as duas marcações e a anotação. Fechado: dois `Local` (17:27 e 17:12). |
| R2.5  | ✅ | O `Local` de 17:27 exportado pelo dono (saiu `Local2.zip`, sem o hífen). `zip-R2.3/` e `zip-R2.5/`: mesmas imagens (`cadastro.webp`, 13 128 bytes, idênticas) e `mapping.json` idêntico, campo a campo (nem `revision` nem datas mudaram). |
| R2.6  | ❌ | achado 3. "Excluir projeto?" (`alertdialog`): ""Local" será apagado deste dispositivo, com todas as imagens. Isso não pode ser desfeito."; **Excluir**: a linha de 17:12 sumiu, o outro `Local` continua e o diálogo fechou depois. O foco foi para o **Abrir** da linha `principal` (a que ocupou a posição da excluída), não para o do `Local` que ficou. |
| R3 (preparo) | ✅ | Seção 6: `repo-teste/` com `git init`, `tools/mapping-mcp.js` (0.3.3, sha256 igual ao da Release), `design/mapeamentos/`, `assets/` (`cadastro.png`, `login.png`, `sdui.json`) e o `.mcp.json` do guia. `principal` movido pelo shell. **Abrir** na linha: **Pasta indisponível** no 1.º clique, sem pedido de permissão (o achado 1 não se repetiu: o caminho dele é o do pedido de permissão); **Localizar pasta…** pelo dono. |
| R3.1  | ✅ | SDUI v2 com **Plataformas** "Android · android · kotlin", "iOS · ios · swift", "Contrato SDUI · bff · json" (a linguagem aparece também); Modelo de dados v1; camada Telas presente. |
| R3.2  | ✅ | Android: endereço `https://github.com/org/app/blob/main/{path}#L{line}` e caminho `../../..`. `x` no endereço do iOS: o 1.º Esc limpou o campo e Configurações continuou aberto; o 2.º fechou (foco no botão **Configurações**). Disco: `platformRepos.android` com `urlTemplate` e `localPath`, sem `ios`. |
| R3.3  | ✅ | Screen `Cadastro`, `/cadastro`, três entradas; sem pendência. Configurações: "iOS sem repositório: 1 referência de código usa esta plataforma." (só ali). Detalhes e Lista: "Android · CadastroScreen.kt", "Android · CadastroViewModel.kt:12", "iOS · CadastroView.swift". Canvas a 82%: "implementação: Android, iOS" junto do Screen (ver "O que atrapalhou": só apareceu com as camadas Model, Classes e Endpoints ocultas). Disco: 3 entradas com `_id`. |
| R3.4  | ✅ | Abas abertas em `https://github.com/org/app/blob/main/app/CadastroViewModel.kt#L12` e `…/app/CadastroScreen.kt` (as duas "Page not found", como previsto; fechei-as). **Copiar caminho**: o texto copiado (lido pelo `writeText` da página) é exatamente `app/CadastroScreen.kt`. |
| R3.5  | ✅ | `android` → `web` pelo shell: o Screen ficou **Incompleta** com "plataforma não declarada pela especialização" (o aviso dessa recarga não foi capturado). De volta a `android`: "Projeto atualizado por fora." (20:39:22, mesmo segundo da gravação) e a pendência sumiu. |
| R3.6  | ✅ | Por cliente MCP próprio (0.3.3). `get_code_hints` (android): Inputs com `com.app.ds.DSTextField` e os parâmetros, Button `com.app.ds.DSButton` com o onClick e o onHold vinculados, `dado` resolvidos (`User.nome`, `User.age`, `Contato.email`). `get_marking`: cada referência de código com `url`, `localFile` e `exists` (false; null no iOS sem repositório). `find_by_code` `CadastroScreen.kt` → Screen `Cadastro` do Formulário. `propose_changes` (entrada iOS `App/CadastroViewController.swift:20` + repositório `ios`): ver "O que atrapalhou" (EPERM). Na app: aviso "Nova proposta", "1 proposta(s) nova(s)", **Revisar**, **Aceitar tudo** (2), **Aplicar aceitas · 2**: "2 mudança(s) aplicada(s)…". `revision` 70 até aplicar; 71 depois, com a 4.ª entrada e `platformRepos.ios`. |
| R3.7  | ✅ | Salvo pelo dono (`principal-R3.7.zip`): `platformRepos` (android, ios), `_id` em todas as entradas, `"schemaVersion": 8`; o zip leva também `proposals/<id>/proposal.json`. |
| R4.1  | ✅ | `proposta-exemplo.zip` injetado no **Abrir zip**: projeto **Loja** neste dispositivo, "1 proposta(s) nova(s)" na barra de status; em Propostas, "Checkout a partir do Figma" com **Nova** e **Revisar** (o título aparece cortado na lista, "Checkout a pa…"). |
| R4.2  | ✅ | `Cabeçalho` → `Topo`. **Revisar**: "Somente leitura" nas duas barras; lista da revisão com a coluna **Nível** e os selos; Árvore sem selos e, na Proposto, sem o Banner promoção. Mudança do nome como **Conflito**; em Detalhes: Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`. Na lista, a linha da mudança não mostra o nome "Nome" (achado 4). |
| R4.3  | ✅ | Proposto: Confirmação e Mensagem de sucesso tracejadas com **+**; Campo Cupom tracejado, com o **+** a 77% (a 32% sem o selo); Banner promoção hachurado, nome riscado e **−**. Atual: sem Confirmação e sem Campo Cupom; Banner hachurado. Terminei na Proposto. |
| R4.4  | ❌ | achado 5. Aviso **Item trancado** com o texto do guia; no cartão da mudança Posição, o selo **Trancado** com a dica (`title`) "Item trancado: aceitar é permitido e a trava continua". Na **Árvore**, o cadeado do Botão Pagar tem a dica "Destrancar Botão Pagar" (botão desabilitado, `aria-label` "Trancar Botão Pagar"), não a do guia. |
| R4.5  | ✅ | Rejeitar "Marcação Campo Cupom criada": a anotação Input ficou rejeitada com a marca **junto** (dica "Decidida junto, pelas dependências") e o aviso "1 mudança(s) rejeitada(s). 1 mudou(aram) junto, pelas dependências.". Aceitar "Anotação Input criada": a criação do Campo Cupom voltou a **Aceita**, com **junto** ("1 mudança(s) aceita(s). 1 mudou(aram) junto…"). |
| R4.6  | ✅ | **Aceitar imagem** na Confirmação ("2 mudança(s) aceita(s)."). Cabeçalho: Árvore (Proposto) `Cabeçalho do checkout`; lista e título de Detalhes `Topo`; na lista, só o ⚠ "Contém conflito" na linha do item; **Conflito** na linha da mudança. **Rejeitar item** + nota: o nome voltou a `Topo`, a nota ficou no item; proposta e Checkout **Parcial**; **Aplicar aceitas · 4**. |
| R4.7  | ✅ | "4 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez."; ao sair, "Somente leitura" sumiu. Árvore: Topo, Banner promoção, Campo Cupom, Confirmação e Mensagem de sucesso. |
| R4.8  | ✅ | Um `Ctrl+Z` tirou Campo Cupom, Confirmação e Mensagem de sucesso; `Ctrl+Shift+Z` trouxe de volta. |
| R4.9  | ✅ | **Continuar**; Banner promoção pela Árvore na visão Atual; **Aceitar item**. Fechado sem lembrete; reaberto: a linha mostra "1 aceita aguardando aplicação"; **Continuar** › "A revisão voltou ao ponto onde você parou."; decisões e a nota preservadas, sem conflito novo. **Sair da revisão**: "Sair da revisão?" com "1 aceita(s) aguardando aplicação", **Aplicar agora · 1**, **Sair mesmo assim** e **Continuar revisando**; este manteve a revisão aberta (foco em **Sair da revisão**). |
| R4.10 | ✅ | Salvo pelo dono como `loja-R4.10.zip`. Zip: `proposals/checkout-figma/proposal.json` com 6 decisões e a nota, e `proposals/checkout-figma/images/carrinho-v2.png`. Reaberto (injetado): mesma linha ("5 aceitas, 1 rejeitadas, 1 conflitos, 1 aceita aguardando aplicação") e a nota no Topo. Diagnóstico "Nenhum erro registrado" (sem `drawImage` em todo o R4); console sem erros. |
| R4.11 | ✅ | `loja/` descompactada (revision 0); **Abrir pasta** pelo dono. A proposta veio **Nova** e o **Revisar** começou do zero (sem "A revisão voltou…", apesar da entrada `folder:loja|checkout-figma` antiga: o O5 da rodada 4 não se repetiu). **Aceitar imagem** na Confirmação aceitou as duas mudanças; **Rejeitar item** no Cabeçalho; **Sair mesmo assim**: "2 aceitas aguardando aplicação". Disco: `decisions` c3/c7 aceitas e c4 rejeitada; `mapping.json` com o mesmo md5 e revision 0. |
| R6.1  | ✅ | **[pessoa]** (a extensão não segura o botão do mouse no canvas; eventos de ponteiro sintéticos não chegam ao Konva). O dono renomeou e, logo depois do Enter, apertou o mouse no meio da marcação, arrastou e, segurando, apertou Esc, várias vezes (R6b, R6c, R6d; no fim voltou o nome a `Título R6` de propósito): a marcação voltou ao lugar e o nome novo ficou. Disco: `Título R6` com o `rect` original (25, 58, 290, 51), igual a Detalhes. |
| R6.2  | ✅ | Passo inteiro do dono: aba nova, `principal`, `tela2.png`, retângulo, `Ctrl+W` sem "Sair da página?". Na minha aba, F5: `principal` no topo dos recentes (18:25); reaberto, `images/tela2.webp` e a marcação nova na Árvore. Disco: `images/tela2.webp` e a marcação (19, 48, 162, 66) com o `imageId` da tela2. |
| R6.3  | ✅ | `Idade` → `Idade externa` pelo shell às 21:27:47; clique no fundo do canvas: "Projeto atualizado por fora." no mesmo segundo; Árvore com `Idade externa`. |
| R6.3b | ✅ | `mapping.json` esvaziado (0 byte); `Cadastrar` → `Cadastrar R6` + Enter: **Erro ao salvar** 1,06 s depois e "Projeto alterado fora da app" (**Recarregar** / **Manter as minhas**) 0,4 s depois. **Manter as minhas**: **Salvo**, `Cadastrar R6`; disco com o projeto inteiro (2 imagens, 7 marcações, 12 anotações). De volta a `Cadastrar`: disco `Cadastrar` (rev 90). |
| R6.4  | ✅ | Par `r6` = `x`; id do `nome` copiado pelo shell. Abrir: "Projeto com dados inconsistentes" com "id de par repetido" em **Problemas** e "o par repetido ganha um id novo" em **O que o reparo faz**, mais **Copiar**, **Fechar** e **Reparar e abrir** (diálogo 558/558). Depois: "Projeto reparado ao abrir (1 correção(ões); detalhes no Diagnóstico). Uma cópia do original vai para backups/ na primeira gravação.". Disco sem mudança (igual ao arquivo com o id repetido; sem `backups/`). |
| R6.5  | ✅ | `Idade externa` → `Idade`: o aviso passou a "Uma cópia do original foi guardada em backups/."; `backups/mapping.v8.20261013-183050.json` idêntico ao arquivo com o id repetido; `r6` com id novo; o Input do Nome continua em `User.nome` (`entryId` do `nome`). |
| R6.6  | ✅ | `rect.x` de `Título R6` = 300 (300 + 290 > 484). "retângulo fora da imagem" / "recortada aos limites da imagem"; edição (`Alt+L` duas vezes) e **Salvo**: `rect` (300, 58, 184, 51), cabe na imagem (300 + 184 = 484); backup novo `mapping.v8.20261013-183141.json`. |
| R6.7  | ✅ | `images/tela2.webp` movida para fora: "⚠ Imagem ausente images/tela2.webp" no lugar da imagem; exportado pelo dono (`principal-R6.7.zip`): aviso "O zip saiu sem 1 imagem(ns) ausente(s) no armazenamento: images/tela2.webp". Zip sem `images/tela2.webp` e com o `mapping.json` citando-a. Arquivo devolvido depois. |
| R6.8a | ✅ | `loja` pelos recentes; **Continuar** ("A revisão voltou ao ponto onde você parou."); **Aceitar tudo** ("9 mudança(s) aceita(s)."): **Aplicar aceitas · 11** habilitado. Cópia em `anexos/loja-R6.8a-antes.json`. |
| R6.8b | ✅ | `chmod a-w` no `mapping.json` pelo shell (Windows; conferido que a escrita falha). **Aplicar aceitas**: "Não foi possível gravar o mapping.json: nada foi aplicado e as decisões continuam como estavam." (e **Erro ao salvar**); revisão aberta, "11 aceitas aguardando aplicação". Disco: `mapping.json` igual à cópia; `proposals/` com os mesmos md5. |
| R6.9  | ✅ | **Sair mesmo assim**; `Título` (Carrinho) → `Título app`: **Erro ao salvar** com **Tentar de novo**. **Fechar projeto**: "Fechar sem salvar?" (`alertdialog`, "As últimas alterações não foram salvas…", **Fechar mesmo assim**); **Cancelar** manteve o projeto e a edição (foco em **Ações do projeto**). |
| R6.9b | ✅ | `Ctrl+E`: "Exportar projeto" com "O zip leva as últimas alterações, mas elas ainda não foram salvas no projeto."; **Cancelar** fechou (foco em **Exportar**), **Erro ao salvar** e `Título app` continuam. |
| R6.10 | ✅ | `Rodapé` → `Rodapé externo` pelo shell (escrita liberada só para editar e travada de novo). Clique no fundo do canvas: "Projeto alterado fora da app" já aberto, com **Recarregar** e **Manter as minhas**, sem X; Esc e o clique fora não o fecharam; `Título app` na tela (diálogo 478/478). |
| R6.11 | ✅ | Escrita devolvida (`chmod u+w`); **Manter as minhas**: **Salvo**. Disco: `Título app`, sem `Rodapé externo`, revision 1 (> 0 do arquivo editado). |
| R7.1  | ✅ | Na `loja` (pasta): **Copiar** › "Copiado."; texto com `build: e701862 · 2026-10-13` (o da barra de status), `channel: main`, `schema: 8`, `storage: folder`, `userAgent`, `window: 1318x630`, `language: pt-BR`, `theme: system`, `images: 2, markings: 6, annotations: 2`, `pendingSave: no`, `errors: 5` (os do R6). Em `anexos/R7.1-diagnostico.txt`. |
| R7.2  | ✅ | Cópia `principal-reparo` feita pelo shell sem a pasta `backups/` (o mesmo que copiar e apagar: a VM não podia apagar); `project.name` trocado; **Abrir pasta** pelo dono; botão do projeto `principal-reparo`. Par `extra` = `x`, id do `nome` copiado, **Reparar e abrir**. Diagnóstico: a linha nova com hora `18:48:05` e contexto `open.repair` cada um numa linha só (a mensagem quebra em três); texto copiado com `errors: 6`, linha em branco e os erros, o mais novo primeiro, `[open.repair] 1 reparo(s): new-id annotation … "User" (duplicate-entry-id)`. Depois da edição: `extra` com id novo, Input do Nome em `User.nome`, um único arquivo em `backups/`, igual ao `mapping.json` com o id repetido. Ver achado 6 ("Copiado." sobre a aba Propostas). |
| R7.3  | ✅ | Configurações › Sobre › **Copiar**: `build: e701862 · 2026-10-13`, `channel: main`, `schema: 8` (três linhas). |
| R5.1  | ✅ | Na app, `Nome` + `Ctrl+C`: "Referência copiada"; área de transferência (lida pela página): `mapping://principal/m/4a2784fa (cadastro.webp › Formulário › Nome)`, sem `images/`. Cliente MCP: `list_projects` traz o `principal`; `resolve` reconhece a marcação Nome com o mesmo caminho; `get_marking` com o Input `input_nome`; `get_marking_image`: PNG 355×51 do campo Nome (`anexos/R5.1-recorte-Nome.png`). `mapping.json` com o mesmo md5 antes e depois. **[pessoa]** com o Claude Code do dono, no `repo-teste`: listou os projetos, descreveu a marcação Nome (com o Input) e mostrou o recorte ("tudo certo"). |
| R5.2  | ✅ | `create_project` com `root: "design/mapeamentos"` (relativo; o O8 da rodada 4 não se repetiu): `importacao/` com `mapping.json` (revision 0) e `.gitignore`, sem `images/`. `propose_changes` (22 operações; `file` relativo à raiz `assets`, ex.: `cadastro.png`): `mapping.json` com o mesmo md5 e `proposals/<id>/proposal.json` (+ `images/`). **Abrir pasta** pelo dono; **Revisar**: tudo **Criada**; na Proposto, a Árvore com Cadastro e Login e os itens; na Atual, "Nenhuma imagem ainda.". |
| R5.2b | ✅ | Camadas: Camada 1, Componentes, Eventos, Telas (SDUI). Nome selecionado: caminho `Cadastro › Formulário › Nome`; barra de status `Nome` com a dica "Seleção: Nome". |
| R5.3  | ✅ | **Aceitar imagem** no Cadastro: "12 mudança(s) aceita(s). 2 mudou(aram) junto, pelas dependências." (SDUI e Componentes aceitas junto; Eventos e Telas sem decisão). Login aceito; Senha **Rejeitar item** + nota; no Entrar, "Anotação Button criada" rejeitada + nota (o título da mudança rejeitada continua "Anotação Button criada"). Login e Entrar **Parcial**. **Aplicar aceitas**: "20 mudança(s) aplicada(s)…"; disco com `images/cadastro.webp`, `images/login.webp`, `specs/sdui.json`, revision 1. `Ctrl+Z`: `images/` vazia (revision 2); `Ctrl+Shift+Z`: as duas de volta (revision 3). |
| R5.4a | ✅ | Filtro **Sem decisão** (Eventos e Telas no nível Projeto), **Aceitar o grupo Projeto**, **Aplicar aceitas · 2** ("2 mudança(s) aplicada(s)", mas ver achado 7), **Sair da revisão**. `get_proposal_review`: 3 rejeitadas (Senha, o Input dela "via" Senha, e o Button do Entrar) e as 2 notas. Proposta nova com `supersedes`, só o Entrar como Text: resposta `superseded` com `status: "applied"` e a `note`. Na app: a antiga **Aplicada** · "substituída por Correções: Entrar como link" · **Abrir a nova**; a nova com 1 mudança. |
| R5.4b | ✅ | "Lembrar senha" (marcação com `source`, Input e Button sem) e a substituição com `placeholder`: `superseded-incomplete` com `inNewProposal` `{same: 2, different: 1, missing: 0}`. App: a antiga **Substituída**, "3 sem decisão ficaram para trás", **Abrir a nova**; em **Ver**: "Esta proposta foi substituída por outra.", "igual na nova" (marcação e Button) e "diferente na nova" (Input). |
| R5.5  | ✅ | Proposta "Renomear título do login" (Título login → Título da tela) apareceu **Nova** com **Revisar** junto de outras **Nova**. Renomeado na app para `Entrar na conta`; **Revisar**: **Conflito** com Atual `Entrar na conta`, Antes `Título login`, Depois `Título da tela`. Depois de sair, a linha dela perdeu o **Nova** e o aviso do canto passou a citar só as outras ("Lembrar senha (com placeholder) e mais 2 aviso(s)"). |
| R5.6  | ✅ | Proposta "Mover Entrar" (dy 10); Entrar trancado com `Alt+L` (disco `locked: true`). Na revisão: aviso **Item trancado** e o selo/cadeado do cartão com "Item trancado: aceitar é permitido e a trava continua"; na Árvore, de novo "Destrancar Entrar" (achado 5). **Aceitar item** + **Aplicar**: `rect` y 272 → 282, `"locked": true`. |
| R5.7  | ✅ | Reexportação (2 imagens e 9 marcações com `source`, nome e `rect` atuais, inclusive o Entrar trancado): `no-changes` ("a reexportação coincide com o projeto atual"); nenhuma proposta nova. Com Cadastrar → `Criar conta`: proposta com **uma** mudança (`reviewChanges.total: 1`), visível em Propostas. `mapping.json` com o mesmo md5 nas duas. |
| R8.1a | ✅ | **Claro**: a página clareou (captura); **Escuro**: fundo `rgb(18, 21, 26)`, foco de volta no botão **Configurações**. No `principal`, `Teste R8` desenhado sobre o campo Senha da tela2 (arraste da extensão no modo **Desenhar**) e nomeado em Detalhes (o foco não vai sozinho para o campo Nome: ficou no `body`): na Árvore e em Detalhes; dois `Ctrl+Z`, sumiu dos dois (o 1.º tirou o nome, o 2.º a marcação). Formulário › User: "← Input input_nome (Nome)" sob `nome` e "← Input input_idade (Idade)" sob `age`. Tudo legível no escuro (texto, selos, contornos, cadeado). |
| R8.1b | ✅ | `Loja` neste dispositivo de 18:10 › **Abrir** › Propostas › **Continuar**: "A revisão voltou ao ponto onde você parou.", "Somente leitura", selos na lista; Topo com **Conflito** (Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`). Nas duas visões: Confirmação e Campo Cupom; Banner promoção hachurado, com o nome riscado e o **−**. Botão Pagar: aviso **Item trancado** e o selo **Trancado** no cartão. Legível no escuro, inclusive o cadeado. Na tela inicial, as divisórias das linhas desalinhadas (achado 8). |
| R8.2  | ✅ | **English (US)**: repetidos o R8.1a (`Teste R8` desenhado, nomeado e desfeito; "← Input input_nome (in Nome)" e "← Input input_idade (in Idade)") e o R8.1b (**Continue**, "The review is back where you left off.", Topo **Conflict**, Banner hachurado e riscado, **Locked item**). Varredura do texto e dos atributos (`aria-label`, `title`, `placeholder`) da tela, de Settings, Specializations, Export project, Exit the review? e das quatro janelas de baixo: em português só dados (nomes, chaves e valores das anotações, camadas da especialização, `Lista de itens`, `Camada 1`). Exceção: no Diagnóstico, as linhas `open.repair` dizem "1 reparo(s): …" (gravadas quando a app estava em português; ver achado 9). De volta a **Português (Brasil)**. |
| Visual: Árvore | ✅ | Sem barra horizontal nem texto cortado; o menu ⋮ do Formulário (**Copiar referência**, **Copiar recorte**) abre sem dica por cima; Esc devolve o foco a "Ações de Formulário". Claro e escuro legíveis. |
| Visual: Camadas | ❌ | achado 2 (selo "Modelo de d…"). Sem barra horizontal. |
| Visual: Detalhes | ✅ | Sem barra horizontal; o id da marcação em reticências (com botão de copiar ao lado); menu ⋮ do par sem dica por cima; Esc devolve o foco a "Ações do par nome". |
| Visual: Lista | ✅ | Sem barra horizontal nem texto cortado; as referências de código longas quebram dentro da coluna Conteúdo ("CadastroViewModel." / "kt:12"), legíveis. |
| Visual: Incompletas | ✅ | Título R6 · Componentes · ⚠ Text · "id: obrigatório vazio", tudo inteiro; sem barra horizontal. |
| Visual: Diagnóstico | ❌ | achado 6 ("Copiado." sobre a aba Propostas). Tabela sem barra horizontal; mensagens longas quebram na coluna. |
| Visual: Propostas | ❌ | achados 4 (selo esconde o nome do nível: na Loja, "Imagem Confirmação criada" com 17 px e "Marcação Mensagem de sucesso criada" com 1 px) e 10 (legenda de atalhos cortada). Títulos e autores em reticências mesmo com espaço livre na linha ("Checko…", "testador (cliente MCP) · hoje …"). |
| Visual: Configurações | ✅ | 478/478, sem barra horizontal; Esc devolve o foco a **Configurações** (R0.1, R3.2 e R8). |
| Visual: Exportar | ✅ | 478/478; **Cancelar** devolve o foco a **Exportar** (R1.22, R2.3, R6.9b e R8.2). |
| Visual: Especializações | ✅ | 558/558, sem texto cortado; Esc devolve o foco a **Especializações** (R1.5 e R8.2). |
| Visual: Pasta indisponível | ✅ | Texto inteiro, sem barra horizontal; fechado, o foco volta ao **Abrir** da linha (R0.7 e R3). |
| Visual: Sair da revisão? | ✅ | 478/478; **Continuar revisando** devolve o foco a **Sair da revisão** (R4.9); em inglês, "Exit the review?" inteiro. |

## Achados

### 1. Abrir uma pasta renomeada: depois do pedido de permissão, o aviso "Pasta indisponível" não aparece

- Severidade: média (contorno: clicar em **Abrir** de novo)
- Build id e data: e701862 · 2026-10-13, 13/10/2026 16:4x
- Passos para reproduzir:
  1. Projeto em pasta `fumaca-web`, fechado, com "Permitir em todas as visitas" dado no R0.2; F5 na tela inicial já feito (R0.4a).
  2. Renomear no disco `fumaca-web` para `fumaca-web-2`.
  3. Na tela inicial, **Abrir** na linha `fumaca-web`.
  4. O navegador pede a permissão da pasta; escolher permitir.
- Esperado: o aviso **Pasta indisponível**, com **Localizar pasta…** e **Remover da lista** (R0.7).
- Observado: a tela inicial continua como estava, sem diálogo, aviso, erro no console ou no Diagnóstico. Um segundo **Abrir** mostra o aviso na hora, sem pedir permissão.
- Reproduziu de novo? Não nesta variante: renomeando `fumaca-pwa` (permissão já dada nesta origem) o **Abrir** não pediu permissão e o aviso veio no primeiro clique. O defeito parece ligado ao caminho com o pedido de permissão. No R3 (o `principal` movido, sem pedido de permissão) o aviso veio no primeiro clique.
- Anexos: nenhum (a tela não mudou).

### 2. Selo "Modelo de dados" cortado na janela Camadas

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Projeto em pasta com a SDUI e o Modelo de dados aplicados (R1.3).
  2. Olhar as linhas **Classes** e **Endpoints** da janela Camadas (largura padrão da janela, viewport 1318 × 632).
- Esperado: "Cada linha da Camadas mostra o nome e o selo inteiros" (R1.3, regressão conhecida).
- Observado: o selo sai "Modelo de d…" (`text-overflow: ellipsis`; 109 px de texto em 94 px). A dica "Especialização Modelo de dados" traz o nome inteiro. Os selos "SDUI" cabem; as linhas não se sobrepõem.
- Reproduziu de novo? sim (o selo continua cortado em todo o R1)
- Anexos: `anexos/achado-2-selo-cortado-camadas.png`

### 3. Excluir projeto: o foco não fica no "Abrir" do projeto que ficou

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Na tela inicial, dois `Local` neste dispositivo, o mais novo na 1.ª linha e o mais antigo na 2.ª; abaixo, a pasta `principal`.
  2. Na 2.ª linha, **Excluir** › **Excluir** (com o mouse).
- Esperado (R2.6): "o contorno de foco fica no **Abrir** da linha que ficou" (o outro `Local`).
- Observado: o foco vai para o **Abrir** da linha seguinte (`principal`), que passou a ocupar a posição da linha excluída (`:focus-visible` falso, porque o clique foi com o mouse).
- Reproduziu de novo? não tentado (exigiria criar e excluir outro par de projetos).
- Anexos: nenhum.
- Nota: "a linha que ficou" pode querer dizer "a linha que ficou no lugar"; ver "O que atrapalhou".

### 4. Lista da revisão: o selo da mudança esconde o nome do nível

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Loja do `proposta-exemplo.zip`; renomear Cabeçalho para `Topo`; **Revisar**.
  2. Na janela Propostas (largura do painel ~520 px, viewport 1318 × 632), olhar a linha da mudança do nome, sob `Topo`.
- Esperado: a linha da mudança com o nome do nível ("Nome") e o selo **Conflito**, sem texto cortado ou sobreposto (seção 7 do guia).
- Observado: o elemento do nome ("Nome") fica com 0 px de largura (some da tela) e o selo **Conflito** (x 434–503) invade em 4 px o começo do resumo (x 499). O mesmo acontece com o selo **Aplicada** nas linhas do Campo Cupom depois do R4.7.
- Reproduziu de novo? sim (na Loja reaberta do R4.9 e do R4.10)
- Anexos: `anexos/achado-4-conflito-sem-nome.png`

### 5. Revisão: a dica do cadeado na Árvore não é a de "Item trancado"

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Loja em revisão (R4.2), visão Proposto; selecionar **Botão Pagar**.
  2. Passar o mouse sobre o cadeado da linha dele na Árvore (ou ler o `title` do botão).
- Esperado (R4.4): "Item trancado: aceitar é permitido e a trava continua" na Árvore e no cartão da mudança.
- Observado: no cartão da mudança, a dica certa; na Árvore, o botão do cadeado (desabilitado na revisão) tem `title` "Destrancar Botão Pagar" e `aria-label` "Trancar Botão Pagar". Na rodada 4 (`48f8e32`) a dica da Árvore era a do guia: regressão.
- Reproduziu de novo? sim (o atributo é o mesmo a cada seleção)
- Anexos: nenhum (a dica é atributo).

### 6. Diagnóstico: o aviso "Copiado." fica sobre a aba Propostas

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Projeto em pasta aberto, janela de baixo na aba **Diagnóstico** (largura ~520 px, viewport 1318 × 630).
  2. Clicar em **Copiar**.
- Esperado: o aviso sem cobrir outro texto (seção 7 do guia: texto sobreposto conta como achado).
- Observado: "Copiado." aparece entre as abas e os botões, de x 625 a 672, e a aba **Propostas** vai até x 633: os dois textos se encostam e se sobrepõem em 8 px ("PropostasCopiado.").
- Reproduziu de novo? sim (no R7.1 e no R7.2)
- Anexos: `anexos/achado-6-copiado-sobre-aba.png`

### 7. Aplicar aceitas mostra "Aplicar bloqueado" para as próprias mudanças que acabou de aplicar

- Severidade: média (a aplicação dá certo, mas o aviso diz o contrário e oferece rejeitar)
- Build id e data: e701862 · 2026-10-13, 13/10/2026 22:04
- Passos para reproduzir:
  1. Projeto `importacao` com a proposta do R5.2 já aplicada em parte (R5.3), sobrando sem decisão só as camadas Eventos e Telas (nível Projeto).
  2. Filtro **Sem decisão**, nível **Projeto**, **Aceitar o grupo Projeto**.
  3. **Aplicar aceitas · 2**.
- Esperado: "2 mudança(s) aplicada(s)…" e mais nada.
- Observado: no mesmo instante, dois avisos "Aplicar bloqueado — A mudança em 701668f3-368e-46df-819c-db61b2391ec8 não cabe mais no projeto atual. Rejeitar a(s) que causa(m) (1)" e o mesmo para f724454a-…, mais "2 mudança(s) aplicada(s). Desfazer…". Os dois ids são as camadas Eventos e Telas que a aplicação acabou de criar (`mapping.json` com as duas; `applied` com c3 e c4). O aviso mostra o id cru, não o nome, e o botão "Rejeitar a(s) que causa(m)" convida a rejeitar o que já está aplicado. No R5.6, ao aplicar "Mover Entrar", veio parecido: "O projeto mudou desde a sua última sessão. 1 mudança(s) passaram a ter conflito…".
- Reproduziu de novo? sim, em outra forma, no R5.6 (o caso do R5.4a não foi repetido igual)
- Anexos: nenhum (o texto dos avisos está acima).

### 8. Tela inicial: as divisórias das linhas da lista de recentes ficam desalinhadas

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026 19:2x
- Passos para reproduzir:
  1. Tela inicial com projetos **Pasta** nos recentes (linhas de duas linhas: nome e pasta).
  2. Olhar a linha divisória entre as linhas (tema escuro, viewport 1318 × 632).
- Esperado: cada linha da tabela com a divisória numa altura só (seção 7 do guia: nada sobreposto ou desalinhado).
- Observado: na coluna dos botões a divisória fica 16 px acima da das outras colunas (a célula dos botões tem `display: flex` e não estica: 224–264 contra 223–280). Fica um "degrau" em cada linha de pasta; nas linhas **Neste dispositivo** (uma linha só) não aparece.
- Reproduziu de novo? sim (em português e em inglês, em todas as linhas de pasta)
- Anexos: `anexos/achado-8-divisorias-lista-inicial.png`

### 9. Diagnóstico: a mensagem do reparo tem "reparo(s)" fixo em português

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Abrir um projeto que precise de reparo (R6.4 ou R7.2) e **Reparar e abrir**.
  2. Configurações › Idioma › **English (US)**; abrir a janela **Diagnostics**.
- Esperado (R8.2): nenhum texto em português na interface.
- Observado: as linhas `open.repair` dizem "1 reparo(s): new-id annotation … "User" (duplicate-entry-id)": o começo em português e o resto em inglês. Nos dois idiomas o resto sai em inglês, então a mistura acontece de qualquer jeito; o mesmo texto vai para o console e para o **Copiar** do Diagnóstico. Conferido no código: `src/app/controller.ts:216` monta `${n} reparo(s): …` sem `t()`.
- Reproduziu de novo? não (com a app em inglês nenhum projeto pediu reparo nesta sessão; a linha vista foi gravada em português às 18:48)
- Anexos: nenhum (o texto está acima e em `anexos/R7.1-diagnostico.txt`).

### 10. Revisão: a legenda de atalhos no pé da janela Propostas sai cortada

- Severidade: baixa
- Build id e data: e701862 · 2026-10-13, 13/10/2026
- Passos para reproduzir:
  1. Uma revisão aberta (Loja, R4 ou R8.1b), janela Propostas na largura padrão (518 px, viewport 1318 × 632).
  2. Olhar o pé da lista da revisão.
- Esperado: as dicas inteiras (seção 7: texto cortado conta).
- Observado: o pé (`review-footer`, `overflow: hidden`) tem 678 px de conteúdo em 518 px: aparecem A Aceitar, R Rejeitar, N Próxima pendente, C Próximo conflito e "P Atual / Prop"; "Ctrl+Enter Aplicar" não aparece. Em inglês, "P Current / Proposed" cabe e "Ctrl+Enter Apply" some do mesmo jeito.
- Reproduziu de novo? sim (em português e em inglês)
- Anexos: `anexos/achado-10-legenda-atalhos-cortada.png`

## Observações (sem severidade)

- **Nome da imagem:** Árvore, Detalhes, trilha e barra de status mostram a imagem como `images/cadastro.webp` (o `name` dela é `null` no `mapping.json`, então a app mostra o `file`). A referência copiada no R5.1 começa por `cadastro.webp`, sem `images/`.
- **Último uso:** o `Local` reaberto no R2.5 continuou com o horário da abertura do zip (17:27) depois de reaberto e exportado (~17:29).
- **Último uso, de novo (R8):** a `Loja` neste dispositivo de 18:10 passou a 19:24 ao ser aberta pela tela inicial; o caso do R2.5 foi reabrir pelo zip.
- **Foco depois de desenhar:** depois de desenhar uma marcação, o foco fica no `body`; para dar o nome é preciso clicar no campo Nome de Detalhes (o guia diz só "dê a ela o nome").
- **Dica do modo Desenhar:** "Arraste sobre uma imagem para criar uma marcação." fica no alto do canvas e cobre os nomes das imagens (`images/cadastro.webp`, `images/tela2.webp`) enquanto o modo está ativo.
- **Plural em inglês:** "There are 1 accepted change(s) not yet applied to the project." (Exit the review?) e "1 change(s)" nos selos; em português o padrão "mudança(s)" é o mesmo.
- **Recentes entre janelas:** o `fumaca-pwa` criado no app instalado só apareceu nos recentes da aba da versão principal depois de ela voltar à tela inicial (a lista não atualiza sozinha enquanto a tela inicial está aberta).

## O que atrapalhou

- **R6.1 ficou com o dono:** a extensão só faz arraste completo (aperta, move e solta) e os eventos de ponteiro sintéticos não selecionam nem movem nada no canvas, então não dá para "apertar, arrastar, Esc, soltar" sozinho.
- **R6.8b no Windows por uma VM:** o `chmod a-w` pela VM bloqueou a escrita do `mapping.json` para o Chrome (o guia, para Windows, fala em `attrib +R`). Ao testar a pasta, criei `loja/teste-escrita.tmp` (0 byte); a permissão de apagar da VM já não valia naquela hora, e o arquivo foi removido depois, com a permissão dada de novo.

- **"Em lote" não existe (R3.6, R6.8a):** o guia manda "**Em lote** › **Aceitar tudo**"; na revisão, **Aceitar tudo** e **Rejeitar tudo** ficam direto na barra da revisão (e, na lista, "Aceitar tudo o que está na lista"). Usei o **Aceitar tudo** da barra.
- **MCP na pasta montada (R3.6):** o primeiro `propose_changes` respondeu `internal-error` "EPERM: operation not permitted, unlink '…/proposals/<id>/.proposal.json.<x>.tmp'" (a VM só apaga na pasta montada com a permissão do dono), mas o `proposal.json` já estava gravado e a proposta apareceu na app. Pedi a permissão de apagar e removi o `.tmp` (idêntico ao `proposal.json`). Um agente que confiasse na resposta mandaria a proposta de novo (duplicada).
- **Texto no canvas do Formulário (R3.3):** com as quatro anotações do Formulário visíveis, o quadro de texto mostra só Model e o começo de Telas, termina em "…" e fica embaixo do minimapa; o resumo "implementação: Android, iOS" só apareceu com Model, Classes e Endpoints ocultas. Ocultei e depois usei **Mostrar todas**.

- **R2.6, "o Abrir da linha que ficou":** dá para ler como "o outro Local" (a leitura que usei, mais literal pelo contexto da frase) ou como "a linha que ficou no lugar da excluída".

- **Arquivos pelos campos da app:** imagens, especializações e zips entram injetados nos `<input type="file">` da app; antes, a extensão exige o arquivo copiado para a sessão (staging da pasta de trabalho).
- **R0.4b:** o dono restaurou a janela e a alargou sem maximizar; o resto da rodada roda em 1318 × 632.
- **Campos de arquivo dos diálogos:** no R1.3 os arquivos entraram direto no campo de arquivo do diálogo Especializações, sem clicar em **Aplicar especialização…** (que abriria o seletor nativo); no R1.5 desliguei o `click()` dos campos de arquivo por script, cliquei em **Atualizar versão…**, injetei e religuei.
- **Zoom:** `Ctrl+=` por `keydown` sintético no `document` (R1.20).
- **R1.22:** o dono contou que, depois de salvar, tocou sem querer em **Baixar** de novo; o diálogo Exportar já estava fechado e só o `principal-R1.22.zip` ficou na pasta.
- **R0.5:** a primeira resposta do dono veio sem o texto do Sobre; pedi de novo e ele colou.
- **Erro meu no R8.2: tirei o `principal` (pasta, 13/10) dos recentes.** Ao fechar o `principal` em inglês, cliquei pela posição no primeiro botão da linha de cima esperando a `Loja`; a linha de cima era o `principal`, e o clique caiu em **Remove from list** (sem confirmação nem desfazer). A pasta `repo-teste/design/mapeamentos/principal` está intacta; volta à lista com **Abrir pasta**. Dali em diante cliquei só por referência ao elemento. Por isso a passada visual de Árvore, Detalhes, Lista e Incompletas foi no `principal-reparo` (cópia do `principal`).
- **Desenhar pela extensão funciona (R8.1a):** o arraste completo da extensão (apertar, mover, soltar) desenha no modo **Desenhar**; o que não dá é segurar o botão e apertar Esc no meio (R6.1).
- **R8.2, ordem:** troquei o idioma com a revisão do R8.1b ainda aberta; vi a interface em inglês ali, saí da revisão, fiz o R8.1a no `principal` e voltei à `Loja` com **Continue**, como o passo pede.
- **Varredura de português (R8.2):** por script (texto e `aria-label`/`title`/`placeholder` com palavras de interface em português), em cada janela e diálogo; o resultado foi conferido à mão para separar dados de interface.
- **Tema:** o sistema já é escuro; no fim voltei o Tema para **Sistema** (a tela continua escura). O idioma voltou para **Português (Brasil)**.
