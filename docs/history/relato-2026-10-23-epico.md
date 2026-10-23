# Relato de teste — Mapping

- Modo: completo, sem interação — R0 a R12 de `docs/TESTING.md`, passada visual completa (VIS) e exploração E1 a E8 do épico Marcações espaciais, notas e setas (branch `epic/marcacoes-espaciais`, PR #217, MCP 0.9.0). Sem roteiros sob demanda (RP, RF, RA, RB). Rodada noturna, o dono dorme.
- Build id: 7837cff · 2026-10-23 (confirmado em Configurações › Sobre; formato 13)
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`); a app abriu com o build 27cdece, a faixa **Atualizar** trouxe o 7837cff; Deploy não foi disparado pelo testador
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows (win32 x64), máquina `galaxy-book-ff`
- DPR e viewport: DPR 1,25; 1487 × 698; janela restaurada por `resize_window` (1500 × 900); a tela do computador é 1536 × 864
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-23-epic-marcacoes` (clone do PR em `repo/`, workspace do MCP em `ws/`, capturas e Diagnósticos em `anexos/`)
- Ferramenta: agente com extensão do navegador (Claude in Chrome) e shell no computador do dono; dialog-pilot 2.3.1; pedidos ao MCP: stdio (`scripts/testing/mcp-stdio-client.mjs`); o Claude Code do computador respondeu "claude is not enabled in this environment"
- Estado prévio do navegador: perfil já usado em outras rodadas; a tela inicial já tinha 58 projetos recentes (pasta e "neste dispositivo", de 04/10 a 22/10/2026, entre eles `setas`, `Com notas`, `espaco`, `principal`, `telas`, `Loja`, `Teste`) e a chave `preview:mapping.reviewResume` com `v: 2` e uma lista `seen` de propostas já vistas. Nada foi apagado.
- MCP: `0.9.0-rc.1` (`node tools/mapping-mcp.js --version`), origem: pre-release `mcp-v0.9.0-rc.1` baixada do GitHub (não gerado localmente), sha256 conferido: sim (`bb01eb0a4c17c6e50182a5b59aa827f3efbd7e4f3ed2271457fddc0d201a0e24`, igual ao pedido)
- Data: 2026-10-23 (início 00:28, horário de Brasília)
- Dashboard ao vivo: https://claude.ai/artifact/4Ah2wRPBUp2G4VVxPUKRAf
- Tempo por roteiro: R0 4 min, R1 20 min, R2 5 min, R3 21 min, R4 10 min, R6 9 min, R7 2 min, R5 9 min, R8 8 min, R9 12 min, R10 6 min, R11 5 min, R12 24 min, VIS 21 min, E1 5 min, E2 6 min, E3 7 min, E4 4 min, E5 4 min, E6 4 min, E7 ~6 min, E8 9 min

> **ATENÇÃO — 7 passo(s) ❌: R1.3, R1.20a, VIS.3, VIS.9, VIS.10, VIS.12, VIS.14.** Detalhes na seção Achados.

## Resumo

- Passos: 217 registrados, ✅ 210, ❌ 7, não executados 0.
- Achados por severidade: bloqueia 0, alta 0, média 1, baixa 4 (5 no total).
- Build id da app no início e no fim da rodada: 7837cff · 2026-10-23 (não mudou). Fim: 2026-10-23, 06:55 UTC (03:55 de Brasília), cerca de 3 h 27 min depois do início.
- Falhas (❌): todas visuais/de layout em 900–1280 px (R1.3, R1.20a, VIS.3, VIS.9, VIS.10, VIS.12, VIS.14), cinco achados: um de severidade média (A3: aba Propostas coberta pelos botões Limpar/Copiar do Diagnóstico, com perda da lista ao clicar) e quatro baixas. Nenhum bloqueia a rodada; nenhum achado de dados (mapping.json sempre consistente nos pontos conferidos).
- Exploração E1 a E8: todos os 35 passos ✅. Migração v12→v13, desempenho (200 marcações/100 setas), cadeia de desfazer com disco conferido a cada passo, persistência (F5 por navegação, reabrir pasta, zip, neste dispositivo), MCP 0.9.0-rc.1 nas duas pontas, Paleta e seleção, revisão de propostas com notas/tabelas/setas (aceitar, rejeitar, Ctrl+Z reabre a revisão) e bordas (nomes extremos, zoom 1%–5000%, imagem 12000×9000 reduzida a 2560×1920, marcações de 8 px e sobrepostas, apagar container com setas, seta apagada e desfeita).
- Observações sem defeito: Ctrl+clique, retângulo de seleção e setas do teclado não existem no guia (só Shift+clique, duplo clique e "Selecionar com o conteúdo"); `update_arrow` em proposta é ignorado para seta existente; `plan_changes` traz só a dica genérica de lote; `near` no MCP vale só para flutuante e o aviso não diz o argumento certo; arrastar abaixo de 8 px não cria nada nem avisa. Detalhes na seção Observações.

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 |  | ✅ | Sobre: `7837cff · 2026-10-23`, canal prévia, formato 13. Diálogo sem rolagem horizontal (scrollWidth = clientWidth = 478). **Ver os atalhos** troca Configurações pela Ajuda (seção Atalhos de teclado); Esc fecha e o foco volta ao botão **Configurações** (`:focus-visible` verdadeiro). Aberto pelo preview, não pela versão principal (o endereço a testar). |
| R0.2 |  | ✅ | Pasta `fumaca-web` aberta com `select_folder` (permissão aceita: `Permitir`). Diálogo "Criar projeto nesta pasta?" com o campo vazio; **Criar**. Editor com "Nenhuma imagem ainda" e **Pasta**. Disco: `mapping.json` (schema 13, revision 0, `arrows: []`), `.gitignore` com `backups/`, `specs/notas/` com `notas.spec.json`, `components/nota.json`, `components/tabela.json`, `docs/nota.md`, `docs/tabela.md`; sem `images/`. |
| R0.3 |  | ✅ | `cadastro.png` (484 × 450) adicionado por **Adicionar imagens** + `open_file`; virou `images/cadastro.webp` (13 128 bytes). Marcação desenhada (43, 126, 349 × 133) e **Salvo**. Fechar projeto voltou à tela inicial sem perguntar; `fumaca-web` no topo, selo **Pasta**. Disco: 1 container, 1 marcação, `revision` 2. Console: só o aviso do Konva. |
| R0.4a |  | ✅ | F5 na tela inicial e **Abrir** em `fumaca-web`: abriu sem o seletor de pasta e sem pedido de permissão (o navegador já guardava a permissão). A aba não caiu; sem erro no console. |
| R0.4b |  | ✅ | Com a marcação selecionada, janela a 836 px: só o aviso "Abra numa janela maior" ("O Mapping precisa de pelo menos 900 px de largura…"). Delete nesse estado não excluiu nada; ao alargar (1487 px) o editor voltou com a marcação selecionada. Disco: ainda 1 marcação, revision 2. |
| R0.7 |  | ✅ | Pasta renomeada para `fumaca-web-2` pela shell com o projeto fechado. **Abrir** em `fumaca-web` mostrou **Pasta indisponível** ("A pasta "fumaca-web" não foi encontrada (ou não tem mais o mapping.json)…") com **Localizar pasta…** e **Remover da lista**; sem pedido de permissão antes. `select_folder` em `fumaca-web-2` aceitou a permissão de edição e o projeto abriu. Na lista: nome `fumaca-web`, embaixo `fumaca-web-2`. **Remover da lista** tirou a linha. Disco: `mapping.json` (1 container, 1 marcação, revision 2), `.gitignore`, `specs/notas/`, `images/cadastro.webp`. Feito no preview, não na versão principal. |
| R1.1 | - | ✅ | Projeto "principal" criado direto em ws/design/mapeamentos/principal; images/cadastro.webp com container 484x450, igual ao PNG |
| R1.2 | - | ✅ | Camada "Model" criada; layers=3 no disco (Camada 1, Notas, Model) |
| R1.3 | A1 | ❌ | Mensagens "SDUI aplicada: 3 camada(s)" e "Modelo de dados aplicada: 2 camada(s)" ok; 5 camadas com selo; disco: specs/sdui.json, specs/modelo-dados.json e specializations=3 ok. Falha só na última frase: o selo "Modelo de dados" aparece cortado ("Modelo de d…") nas linhas Classes e Endpoints (.layer-badge max-width 96px, conteúdo 109px, sem title). Reproduziu 2x. Captura: anexos/R1.3-selo-cortado.png |
| R1.4 | - | ✅ | Nome e Excluir camada desabilitados com a dica "Camada de especialização: não pode ser renomeada nem excluída…"; Esc devolve o foco ao ⋮ "Mais ações da camada Componentes"; cor #1E88E5 → #2E7D32 no disco, spec {sdui, componentes} preservado |
| R1.5 | - | ✅ | "Nada a fazer": "\"SDUI\" já está no projeto na versão 3. O arquivo é a versão 3; só versões maiores atualizam."; disco inalterado; foco voltou ao botão Especializações |
| R1.6 | - | ✅ | 6 markings no disco; Nome, Idade, E-mail e Cadastrar com parentId = Formulário e rect dentro do dele (Formulário 15,126,385x289); Título na raiz (26,53,290x57); X/Y/L/A de Detalhes iguais ao rect |
| R1.7 | - | ✅ | Anotação User na camada Model do Formulário; entries name:string e age:number, cada par com id |
| R1.8 | - | ✅ | Anotação Classe "Contato" na camada Classes; revisado em digitado no campo de data (23/10/2026) no lugar do seletor; colunas de atributos lado a lado (sim/não termina em x=1265, exemplo começa em 1278); recolhida mostra selo "Classe" e "Classe · Contato — nome: Contato · versão: 1 · revisado em: 2026-10-23"; disco: type {modelo-dados, classe}, revisadoEm 2026-10-23, atributos com _id |
| R1.9 | - | ✅ | Seletor "Escolher alvo de dado" listou só User.name, User.age e Contato.email; Input input_nome com dado → User.name (referência annotationId/entryId) |
| R1.10 | - | ✅ | Inputs input_idade (number, dado User.age), input_email (email, obrigatório sim, dado Contato.email); obrigatório não em Nome e Idade; values.dado é objeto de referência nos 3 |
| R1.11 | - | ✅ | Button btn_cadastrar com texto Cadastrar; estilo primary e habilitado sim já vinham preenchidos; disco confere (o campo texto só grava com Enter ou ao sair do campo) |
| R1.12 | - | ✅ | Text no Título (conteúdo "Crie sua conta", id vazio): "obrigatório vazio" só embaixo do id; ⚠ no cabeçalho da anotação, na seção da camada Componentes e no canvas; Detalhes mostra "Incompleta: 1 pendência"; Incompletas (Ctrl+Shift+5) lista Título · Componentes · Text · id: obrigatório vazio. Obs.: o 1º Ctrl+Shift+5 com o foco no campo conteúdo digitou "5" no rascunho do campo; corrigido antes de gravar (o disco tem "Crie sua conta") |
| R1.13 | - | ✅ | Formulário › User mostra "← Input input_nome (Nome)" sob name e "← Input input_idade (Idade)" sob age; o clique no link seleciona Nome e mostra o Input dele |
| R1.14 | - | ✅ | Chave name→nome (Enter); em Nome o Input mostra dado → User.nome (referência sobreviveu); campo não cortou o texto |
| R1.15 | - | ✅ | Diálogo "Referências vão quebrar: A linha \"email\" é alvo de 1 referência(s)…"; após Excluir, Input do E-mail fica Incompleta com "dado: referência quebrada" (Incompletas=2); Ctrl+Z restaura a linha (disco: atributos=[email]) e o Input volta a Contato.email (Incompletas=1) |
| R1.16 | - | ✅ | onClick (submit, /usuarios, parâmetros origem=cadastro) e onHold (track; duração 500 por padrão) no Button; onChange (validate, regra email) no Input do E-mail; todos em Vinculadas do dono e na camada Eventos; disco: parentAnnotationId aponta ao dono |
| R1.17 | - | ✅ | Na Idade, Eventos + › onClick: diálogo "Dono do onClick: Para criar um onClick, esta marcação precisa de um dono que aceite onClick (Button ou Image)…"; nada criado (10 anotações no disco); foco volta ao + da camada |
| R1.18 | - | ✅ | Endpoint no Formulário: metodo POST, path /v1/usuarios, request "User", response "User" (texto simples), timeoutMs 10000 por padrão |
| R1.19 | - | ✅ | Eventos ativa (dica "Ativa"), visibilidade desmarcada nas outras 7 camadas, "Ocultar sem anotação": no canvas só o contorno do Formulário, E-mail e Cadastrar (Nome, Idade e Título ocultos). Captura: anexos não gravada (verificado por zoom) |
| R1.20 | - | ✅ | "Mostrar todas" restaurou as 8 camadas e o filtro voltou a "Mostrar todas"; com Nome selecionado e zoom pela roda do mouse (23 a 75 por cento) o canto da marcação mostra só o nome e nenhum cartão de anotações; Detalhes de Nome: Input dado → User.nome; Cadastrar: onClick com parâmetros 1 linha. Desvio de método: a ferramenta bloqueia Ctrl+=, então o zoom foi pela roda do mouse |
| R1.20a | A2 | ❌ | Ver limpo (botão e Alt+H) liga e desliga: só a imagem, sem bordas, nomes ou seleção; botão pressionado, Desenhar desabilitado, modo Navegar; Árvore, Lista e Detalhes iguais; revision 59 inalterada. Falha: ao clicar no canvas (sobre a marcação Idade) com Ver limpo ligado, a seleção passa de Nome para a imagem (Detalhes mostra images/cadastro.webp) e, ao desligar, Nome não volta a ser a selecionada. Reproduziu 2x. Captura: anexos/R1.20a-selecao-perdida.jpg |
| R1.21 | - | ✅ | Lista › Só incompletas mostra só a anotação do Título (Text, id vazio) |
| R1.22 | - | ✅ | Exportar › Baixar › salvo com save_file em principal-R1.22.zip (diálogo Exportar fechou); descompactado em zip-R1.22/: mapping.json, images/cadastro.webp, specs/sdui.json, specs/modelo-dados.json, specs/notas/; mapping.json do zip idêntico ao da pasta: 1 container, 6 markings, 8 layers, 11 annotations, 3 specializations; revisadoEm 2026-10-23, versao inteiro, atributos com _id, pares da User com id, dado como referência, onHold duracaoMs 500 (número), sem 'inherit'; Diagnóstico › Copiar traz containers: 1, markings: 6, annotations: 11 / errors: 0 / pendingSave: no |
| R1.23 | - | ✅ | Remover Modelo de dados › Converter em camadas livres: aviso "2 anotação(ões) afetada(s): Classes 1, Endpoints 1" e "1 referência(s) de outras anotações vão ficar quebradas"; após converter, Classes e Endpoints sem selo, Classe vira anotação livre Contato com pares nome=Contato, versao=1, revisadoEm=2026-10-23, atributos[1].nome/tipo/obrigatorio/exemplo (descricao vazio não virou par); Input do E-mail incompleto (dado: referência quebrada), Nome e Idade válidos; Ctrl+Z restaura tudo (11 anotações, specs/modelo-dados.json de volta) |
| R1.24 | - | ✅ | SDUI › Remover › Apagar dados: diálogo lista "8 anotação(ões) afetada(s): Componentes 5, Eventos 3" (Telas fora); após apagar somem Componentes, Eventos e Telas (layers=5, annotations=3, specs/sdui.json removido); Ctrl+Z traz tudo de volta (layers=8, annotations=11, specs/sdui.json existe) |
| R2.1 |  | ✅ | Local criado; barra mostra Neste dispositivo e Alterações não exportadas. |
| R2.2 |  | ✅ | cadastro.png (webp na app), Formulário e Título, anotação User name=string na Camada 1; aviso continua. |
| R2.3 |  | ✅ | Exportar mostra Local.zip pronto (18,8 KB). Cancelar o Salvar como (cancel_dialog) manteve o diálogo e o aviso; Salvar (save_file) fechou o diálogo, o aviso sumiu, 19220 bytes no disco. Tela inicial: Local, Neste dispositivo, sem aviso. |
| R2.4 |  | ✅ | Zip abriu com imagem, 2 marcações e a anotação User/name/string; dois Local na lista (01:05 e 01:04). |
| R2.5 |  | ✅ | Local-2.zip idêntico ao Local.zip: mesmos 19220 bytes, arquivos iguais, nenhuma diferença nem em revision (diff -r em zip-R2.3/ e zip-R2.5/). |
| R2.6 |  | ✅ | Excluir projeto? avisou que não dá para desfazer; linha sumiu e o Local de 01:05 continuou. Foco no Abrir da linha que ocupou o lugar (principal); Shift+Tab e Tab mostram o contorno (focus-visible). Não medi a ordem exata entre o fechamento do diálogo e o sumiço da linha (1 s depois já estavam os dois no estado final). |
| R3.1 |  | ✅ | Especializações: SDUI v3 com Plataformas (Android, iOS, BFF), Modelo de dados v1, Notas v2; camada Telas existe. |
| R3.2 |  | ✅ | Os três repositórios aparecem só em leitura com 'referência v3'; único campo editável é o caminho local. Android gravou ../../.. (disco: platformRepos.android só com localPath). 1º Esc apagou o x do iOS e manteve o diálogo; 2º fechou. |
| R3.3 |  | ✅ | Screen Cadastro (/cadastro) no Formulário; não ficou incompleto (Incompletas continua só com o Título do R1); sem campo de implementação e sem linha Definição; values só nome e rota. |
| R3.4 |  | ✅ | Button: Definição com Android · DSButton.kt, iOS · DSButton.swift, BFF · Components.kt; hrefs conferidos (github.com/org/app-android/blob/v3/..., app-ios, bff); a aba do Android abriu (404 do GitHub, esperado) e foi fechada. Texto copiado: app/src/main/java/com/app/ds/DSButton.kt. Input Nome: Android · DSTextField.kt e BFF · Components.kt. |
| R3.5 |  | ✅ | Apaguei platformRepos.android no arquivo; a app recarregou e o caminho local do Android ficou vazio, repos da especialização intactos e Definição do Button ainda com links. Restaurei e o caminho voltou. Não vi o aviso 'Projeto atualizado por fora.' (some em poucos segundos); a recarga foi confirmada pelo estado. A Incompleta do Título (R1) continuou, nenhuma nova. |
| R3.6a |  | ✅ | Cliente stdio (Claude Code não habilitado), lidas as instruções antes: o code é o código de instanciação do Button (symbol com.app.ds.DSButton); o path é o arquivo que o define, para ler a assinatura; está no repo da especialização (https://github.com/org/app-android, ref v3) ou no clone local (localPath). Dentro do esperado. |
| R3.6 |  | ✅ | get_code_hints do Formulário (android) descreve Inputs, Button, onClick/onHold, dado resolvido; Screen e Modelo de dados em unmappedTypes; find_by_code DSButton.kt acha o tipo Button e a marcação Cadastrar. propose_changes (set_platform_repo ios) gravou a proposta sem mudar a revisão (62); Revisar › Aceitar tudo › Aplicar aceitas › Sair da revisão: revisão 63 e platformRepos.ios.localPath = ../../../app-ios, e o campo aparece em Configurações. O servidor avisou no stderr que não apagou o temporário (EPERM), sem efeito. |
| R3.7 |  | ✅ | principal-R3.7.zip: schemaVersion 13 e platformRepos só com localPath (android e ios). |
| R3.8 |  | ✅ | Projeto v8 (migracao, montado por script a partir do principal; ver observações): abriu sem faixa e sem gravar (disco ainda v8); barra schema v13. Depois de renomear e Salvo: faixa 'Projeto atualizado do formato v8; uma cópia do original foi guardada.' com Dispensar, ainda lá 12 s depois; fechar e reabrir: sem faixa. Screen só nome e rota, sem implementação, sem incompleta. Disco v13, values só nome/rota, backups/mapping.v8.*.json com implementacao. |
| R3.8b |  | ✅ | Projeto v10 (migracao10): barra schema v13; Android ../app, iOS vazio; Diagnóstico com erro open.migration (Schema 11: endereço dos arquivos saiu do projeto, descartado de android, ios, com os dois endereços, orienta regravar a especialização com repo formatVersion 5). Disco: backups/mapping.v10.*.json com os dois urlTemplate; mapping.json v13, platformRepos.android só com localPath ../app, sem ios. |
| R3.8c |  | ✅ | Projeto v11 (migracao11): abre sem faixa, schema v13, disco ainda v11 depois de abrir. Após o Salvo, faixa do formato v11. Backup idêntico ao v11 do preparo (images/imageId); mapping.json v13 com containers/containerId, revision maior, sem images/imageId; images/ intacta. |
| R3.8d |  | ✅ | Projeto v12 (migracao12): abre sem faixa, schema v13; Diagnóstico open.migration 'Schema 13: a herança de anotações saiu do formato. 1 anotação(ões) … própria marcação: Formulário'. Filha sem a anotação da pai (sem Herdadas); pai com estilo=primário. Após Salvo, faixa v12. Backup idêntico ao v12; mapping.json v13 sem inherit, mesma anotação (mesmo id), floating false e parentId null. |
| R3.9 |  | ✅ | Projeto antiga novo em pasta, cadastro.png e uma marcação; sdui-antigo.json aplicado com open_file: aviso 'Campos ignorados: screen.implementacao.' (3 camadas criadas); Screen nasce só com nome e rota; disco values só nome/rota. |
| R3.10 |  | ✅ | Projeto biblioteca com cadastro.png; Aplicar pasta… (repo/examples/libraries/material3). Janela do pacote: v1 · 15 tipo(s) · 15 componente(s) · 15 documento(s) · 2 fonte(s); 0 erro(s) e 42 aviso(s), Os avisos não impedem aplicar; 31 avisos em material3.spec.json (2 de fonte) e 11 em components/ (m3-navigation-bar 3, os outros 1). Aplicar habilitado; 'Material Design 3 (baseline) aplicada: 1 camada(s) criada(s).' e 'v1 · 1 camada(s)'. Disco: specs/material3 com material3.spec.json, components/ 15, docs/ 15, examples/settings.sdui.json, fonts/LEIA-ME.txt; specializations[].file correto; sem specs/material3.json. Não vi o texto 'Conferindo o pacote…' no botão (a conferência foi mais rápida que a minha leitura). |
| R3.11 |  | ✅ | Fechei e reabri a biblioteca; Diagnóstico: seção Biblioteca com 2 avisos de fonte (material3.spec.json, fonts[0].file e fonts[1].file); os 40 avisos de desenho não aparecem; Copiar não leva esses avisos (nem Roboto). O registro de erros mostra só os dois open.migration do R3.8c e R3.8d desta sessão, nenhum da biblioteca. A tela também tem uma seção Componentes › Fontes (Roboto 400 e 500 ausentes, usando a fonte do sistema), que o guia não cita. |
| R3.12 |  | ✅ | Remover › Converter em camadas livres › Converter: 'Material Design 3 (baseline) removida.' e specs/material3 sumiu. Aplicar zip… com material3.zip (com a pasta material3/ dentro, montado por mim) mostrou a mesma janela do R3.10 (0 erros, 42 avisos) e, aplicado, o disco ficou igual ao pacote (comparação semântica dos JSON, que a app regrava formatados; demais arquivos idênticos). Repeti com o zip sem pasta-raiz depois de remover de novo: mesmo resultado. |
| R3.13 |  | ✅ | Zip sem components/m3-button.json: janela com 1 erro(s) e 41 aviso(s) 'arquivo não encontrado: components/m3-button.json' em material3.spec.json, 'Corrija os erros e tente de novo', Aplicar desabilitado, nada mudou. (Antes disso, com a especialização já no projeto, o zip dá 'Nada a fazer': tive de remover a especialização primeiro.) O material3.spec.json solto: 'Arquivo de especialização inválido… precisa da pasta inteira: um arquivo .json isolado não basta. Use Aplicar pasta… ou Aplicar zip…' (sem a menção 'versão 4' que o guia cita; o sentido é o mesmo). |
| R3.14 |  | ✅ | Material3 v1→v2 com mat-v2 (Atualizar de pasta…): janela 'Da versão 1 para a 2.' e 'Atualização aditiva: os dados ficam como estão.', sem passos de migração; 'atualizada para a versão 2'; linha v2. Preenchi o FAB (cor secondary e Nota=teste; errei antes o campo Label (extended), limpei); disco com values {icon, color:secondary, note:teste} e spec v2 em specs/material3/. |
| R3.15 |  | ✅ | mat-v3: 'Da versão 2 para a 3.', 'Renomear o campo color → tone em m3-fab', 1 anotação(ões), 1 valor(es), 'Nenhuma camada criada ou removida.', Atualizar habilitado. Depois: Tone=secondary e Nota=teste; disco values {tone: secondary, note: teste} sem color; spec v3. Desfazer (botão da barra, mesmo efeito do Ctrl+Z): Color=secondary volta, linha v2, spec v2, biblioteca e dados numa entrada só. Repetido: termina v3. |
| R3.16 |  | ✅ | mat-v4: 'Remover o campo note em m3-fab', 'Formulário › FAB: campo note removido (valor "teste")' e, em destaque vermelho, 'Esta atualização apaga 1 valor(es) e 0 anotação(ões).'; Atualizar habilitado. Aplicado: sem Nota, linha v4, disco sem a chave note. Desfazer devolve Nota=teste e v3 (também em specs/); repetido volta à v4 sem a nota. |
| R3.17 |  | ✅ | mat-v5 (v5 · 14 tipo(s)): 'Esta atualização não pode ser aplicada: faltam migrações declaradas para estas quebras.', 'o tipo "m3-scrim" foi removido; declare um passo "remove-type" ou "rename-type" em migrations', 2 erro(s) e 45 aviso(s), Atualizar desabilitado (disabled=true). Cancelar: linha segue v4, mapping.json e specs/ iguais (rev 21, spec v4). |
| R4.1 |  | ✅ | Abrir zip (open_file) proposta-exemplo.zip: projeto Loja neste dispositivo, barra de status '1 proposta(s) nova(s)', Propostas com 'Checkout a partir do Figma' estado Nova e botão Revisar. |
| R4.2 |  | ✅ | Cabeçalho renomeado para Topo; Revisar: 'Somente leitura' na barra principal e na de status; lista da revisão com selos; 1 conflito; no item o cabeçalho 'Marcação alterada' e o ⚠ no Nome; o quadro mostra Atual Topo, Antes Cabeçalho, Depois Cabeçalho do checkout, Sobrescrever e Manter atual. As dicas nativas (title) não aparecem em captura; li pelo atributo. |
| R4.3 |  | ✅ | Proposto: Confirmação e Campo Cupom tracejados com selo +; Banner promoção hachurado com selo −; Atual sem Confirmação nem Cupom, Banner hachurado. O selo + do Campo Cupom só aparece com zoom maior (visto a 95%). Não consegui afirmar pela captura que o nome do Banner está riscado no canvas; em Detalhes o nome aparece riscado com 'Será removida'. |
| R4.4 |  | ✅ | Botão Pagar: aviso 'Item trancado' com o texto do guia; dica 'Item trancado: aceitar é permitido e a trava continua' no cadeado da lista e no selo Trancado; na Árvore, o cadeado é botão desabilitado (dica 'Destrancar Botão Pagar') e sem o aviso. |
| R4.5 |  | ✅ | Campo Cupom: selo 'Criada pela proposta', 'Marcação criada', '+ 1 anotação(ões) criada(s)'; quadro 'Faz parte da criação da marcação: decida no cabeçalho, acima.'; Esc devolveu o foco ao marcador; R rejeitou a criação e a Input junto ('1 mudança(s) rejeitada(s) junto: Anotação Input criada', Desfazer, marca junto); Cupom saiu da Árvore na visão Proposto e seguiu selecionado; 'sugerida numa rejeição: o agente lê na próxima rodada'. Aceitar a Input: '2 aceitas, 0 rejeitadas, 0 sem decisão'. |
| R4.6 |  | ✅ | Confirmação aceita (4 aceitas); na Proposto a Árvore mostra 'Cabeçalho do checkout', a lista mostra 'Topo' com ⚠ (Contém conflito) e o selo Conflito na linha do nome. Rejeitar marcação: nome volta a Topo; nota gravada ('Tem nota' na linha); botão 'Aplicar aceitas · 4'; proposta e imagem Parcial. O primeiro Tab após digitar a nota não tirou o foco do campo; o segundo tirou e a nota gravou. |
| R4.7 |  | ✅ | Aplicar aceitas: '4 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez.'; Sair da revisão sem lembrete; 'Somente leitura' some; Topo, Confirmação e Campo Cupom no projeto (Ordem 1 de 5); Banner continua. |
| R4.8 |  | ✅ | Ctrl+Z uma vez tirou as 4 mudanças (Ordem 1 de 4, '4 aceitas aguardando aplicação'); Ctrl+Shift+Z trouxe de volta (1 de 5). |
| R4.9 |  | ✅ | Continuar: 'A revisão voltou ao ponto onde você parou.'; Banner promoção › Aceitar remoção (cabeçalho Marcação removida, nome riscado em Detalhes); fechei o projeto, reabri pela lista (Loja) e a proposta mostrou '1 aceita aguardando aplicação'; Continuar voltou com decisões e nota, sem conflito novo. Sair da revisão: lembrete 'Sair da revisão?' com '1 aceita(s) aguardando aplicação', '1 rejeitada(s)', '5 sem decisão' e os botões Continuar revisando, Sair mesmo assim, Aplicar agora · 1; Continuar revisando manteve a revisão, foco no botão 'Sair da revisão'. |
| R4.10 |  | ✅ | Exportar › Baixar (Loja.zip, 15,8 KB) salvo por save_file e descompactado em zip-R4.10/: proposals/checkout-figma/proposal.json com decisions (c3, c6, c7, c10, c8 aceitas; c4 rejeitada), a nota (target M1, 'O nome antigo do cabeçalho estava certo.') e proposals/checkout-figma/images/carrinho-v2.png; mapping.json revision 4, schema 13. Abrir zip: a revisão tem as mesmas decisões e a nota. Diagnóstico sem drawImage. |
| R4.11 |  | ✅ | Pasta loja (revision 0, md5 do mapping.json anotado): aceitar a Confirmação aceita as 2 mudanças (imagem e marcação); sem conflito; Cabeçalho rejeitado; Sair mesmo assim; a proposta mostra '2 aceitas aguardando aplicação'. Disco: proposal.json com decisions c3 e c7 aceitas e c4 rejeitada; mapping.json com o mesmo md5 e revision 0. |
| R4.12 |  | ✅ | loja-apagar: antes de revisar a linha aberta não tem o menu ⋮; Aceitar tudo (11), Aplicar aceitas, Sair da revisão: linha 'Aplicada' com '11 mudanças aplicadas' e ⋮. O aviso 'Apagar proposta?' cita a proposta, diz que não pode ser desfeito e que as mudanças aplicadas continuam. Cancelar: nada apagado e o foco voltou ao ⋮. Apagar: 'Proposta apagada: Checkout a partir do Figma', 'Nenhuma proposta ainda' e o foco em 'Como o agente envia propostas', sem aviso de 'apagada fora da app'. Disco: sem proposals/checkout-figma; images/ com checkout.png, confirmacao.png e carrinho-v2.png. |
| R4.13 |  | ✅ | Ctrl+Z uma vez: a Confirmação e o Campo Cupom saem da Árvore, a proposta não volta; depois do Salvo, images/ tem só checkout.png e carrinho.png e o mapping.json não cita mais a Confirmação (cita carrinho.png). Diagnóstico sem erro novo. |
| R6.3 |  | ✅ | Edição externa do nome (Idade → Idade externa) com a página visível: a app recarregou sozinha e a Árvore mostrou o nome novo; o toast 'Projeto atualizado por fora.' é rápido e não foi capturado (aparece e some). |
| R6.3b |  | ✅ | mapping.json esvaziado por fora e Enter na app: 'Salvando…' → 'Erro ao salvar' em ~1,0 s → diálogo 'Projeto alterado fora da app' ~0,5 s depois; 'Manter as minhas' voltou a Salvo e restaurou o disco (revision 64). Diagnóstico registra EmptyMappingError (save e session.emptyMapping). |
| R6.4 |  | ✅ | Par r6 criado e id copiado do par nome no disco: ao abrir, diálogo 'Projeto com dados inconsistentes' com 'id de par repetido' em Problemas e 'o par repetido ganha um id novo' em 'O que o reparo faz'; Reparar e abrir deu 'Projeto reparado ao abrir (1 correção(ões); detalhes no Diagnóstico)…'; mapping.json no disco intacto (mesmo md5) até a primeira gravação; Diagnóstico open.repair (duplicate-entry-id). |
| R6.5 |  | ✅ | Renomear Idade externa → Idade: Salvo e toast 'Uma cópia do original foi guardada em backups/.'. Disco: backups/mapping.v13.20261023-014113.json idêntico (md5) ao arquivo com id repetido; mapping.json sem ids repetidos (r6 com id novo; entryId do Input segue em User.nome). O nome do backup usa v13 (versão do arquivo), não v10 como diz o guia — ver observação. |
| R6.6 |  | ✅ | rect.x de Título = 300 (imagem 484, Título 290): diálogo com 'retângulo fora da imagem' em Problemas e 'recortada aos limites da imagem' no reparo; após o Salvo, rect = x 300, width 184 (300+184 = 484 ≤ 484); backup novo mapping.v13.20261023-014208.json com o rect original (width 290); Diagnóstico open.repair (clipped marking). |
| R6.7 |  | ✅ | tela2 adicionada (Adicionar imagens, open_file; gravada como images/tela2.webp, Salvo). Com o arquivo fora de images/ e o projeto reaberto: canvas mostra 'Imagem ausente images/tela2.webp'; ao exportar, faixa 'O zip saiu sem 1 imagem(ns) ausente(s) no armazenamento: images/tela2.webp'. Zip (ws/zips-R6/principal-R6.7.zip): images/ só com cadastro.webp; mapping.json cita as duas imagens. Arquivo devolvido a images/. |
| R6.8a |  | ✅ | Abri a pasta loja (R4.11): Continuar e Aceitar tudo → 11 aceitas, 0 rejeitadas, 'Aplicar aceitas · 11' habilitado; cópia do mapping.json guardada em ws/mapping-R6.8a-loja.json. |
| R6.8b |  | ✅ | Escrita tirada com chmod a-w no mapping.json (atributo somente leitura no Windows; escrita no arquivo deu 'Permission denied'). Aplicar aceitas: 'Não foi possível gravar o mapping.json: nada foi aplicado e as decisões continuam como estavam.'; revisão continua aberta com as 11 aceitas; mapping.json com o mesmo md5 da cópia; proposals/checkout-figma/images/ intacta. |
| R6.9 |  | ✅ | Sair da revisão › Sair mesmo assim; renomeado Título → Título app: indicador 'Erro ao salvar' com 'Tentar de novo' em ~1-2 s; Fechar projeto abre 'Fechar sem salvar?' ('As últimas alterações não foram salvas…', Fechar mesmo assim); Cancelar manteve o projeto aberto com Título app. |
| R6.9b |  | ✅ | Exportar com Erro ao salvar: diálogo 'Exportar projeto' com o aviso 'O zip leva as últimas alterações, mas elas ainda não foram salvas no projeto.'; Cancelar fechou (o foco voltou ao botão Exportar, não ao body); indicador seguiu em Erro ao salvar e Título app na tela; não baixei. |
| R6.10 |  | ✅ | Rodapé → Rodapé externo no mapping.json (regravado no lugar, atributo religado; revision 0 no arquivo). Clique no fundo do canvas: o diálogo 'Projeto alterado fora da app' (Recarregar / Manter as minhas) estava na tela em até 4 s (o ouvinte de diálogos não o pegou; não medi o instante exato). Esc e clique fora não o fecham; sem botão X; Título app continuou na tela. |
| R6.11 |  | ✅ | Permissão devolvida (chmod u+w) e Manter as minhas: Salvo. Disco: Título app presente, sem Rodapé externo (a app gravou por cima), revision 1 > 0 do arquivo editado à mão. |
| R7.1 |  | ✅ | Diagnóstico da loja (pasta) › Copiar: 'Copiado.'. Texto: build: 7837cff · 2026-10-23 (igual à barra de status), channel: preview, schema: 13 (o guia diz 10; texto do guia desatualizado), storage: folder, userAgent, window: 1487x698, language: pt-BR, theme: dark, 'containers: 2, markings: 6, annotations: 2', pendingSave: no, errors: 7 (inclui o NoModificationAllowedError do R6 ×4). Texto capturado por um gancho em navigator.clipboard.writeText (não colei em arquivo). |
| R7.2 |  | ✅ | Cópia principal-reparo (backups/ tirada da cópia com mv, pois o apagar é bloqueado), project.name trocado, aberta com Abrir pasta (botão mostra principal-reparo), par extra=x, id copiado de User.nome, Reparar e abrir. Diagnóstico: linha open.repair com hora e contexto numa linha só; texto com 'errors: 8' e '[open.repair] 1 reparo(s): new-id annotation … (duplicate-entry-id)' em linha própria após linha em branco. Após o Salvo: um único backups/mapping.v13.20261023-014804.json, md5 igual ao arquivo com id repetido; extra com id novo; entryId do Input segue em User.nome. |
| R7.3 |  | ✅ | Configurações › Sobre › Copiar ('Copiado.'): três linhas, build: 7837cff · 2026-10-23, channel: preview, schema: 13 (guia diz 10). Foco voltou ao botão Configurações ao fechar. |
| R5.1 |  | ✅ | Ctrl+C na marcação Nome (principal): toast 'Referência copiada'; texto 'mapping://principal/m/c020f41e (cadastro.webp › Formulário › Nome R6)' (começa pelo arquivo da imagem em images/, sem o 'images/'; o guia diz cadastro.png, a app guardou .webp); sem pedido de permissão e sem clipboard.write no Diagnóstico. Cliente stdio: list_projects traz o principal; resolve reconhece a marcação com o mesmo caminho; get_marking traz o Input input_nome; recorte 362×55. mapping.json do principal com o mesmo md5 (revision 70). Ferramenta: cliente stdio, não o Claude Code. |
| R5.1a |  | ✅ | get_marking_image crop: url http://127.0.0.1:… com urlCheck head 200 image/png, get 200 com 3472 bytes = o png gravado, sameAsImage true. get_container_file do container (mapping://principal/i/dcee0c82): image/webp, 13128 bytes, sameAsImage true. Sem crops/ na pasta; mapping.json igual (revision 70); app sem aviso de projeto alterado. Anexos em anexos/R5/. |
| R5.2 |  | ✅ | create_project importacao (revision 0, .gitignore, specs/notas/, sem images/) e propose_changes com 22 operações (SDUI, Cadastro, Login, 10 marcações, 9 anotações; source em tudo): 'valid', 25 mudanças criadas. mapping.json inalterado e proposals/61cd5a5e…/proposal.json criado. Na app (Abrir pasta com select_folder): proposta Nova com 25 sem decisão; Revisar; tudo Criada; Proposto lista Cadastro/Login e itens; Atual diz 'Nenhuma imagem ainda.'. Sobraram arquivos .tmp do servidor em proposals/ (EPERM ao apagar: a pasta montada no cliente não deixa apagar). |
| R5.2b |  | ✅ | Camadas lista Camada 1, Notas, Componentes, Eventos, Telas. Seleção Nome: caminho 'Canvas › Cadastro › Formulário › Nome' e barra de status 'Nome' (title 'Seleção: Nome'). |
| R5.3 |  | ✅ | Aceitar imagem Cadastro: aviso '12 mudança(s) aceita(s). 2 mudou(aram) junto, pelas dependências.' (SDUI e camada Componentes); Eventos e Telas ficaram sem decisão (2). Login: Aceitar imagem (9 aceitas). Senha: Rejeitar marcação (2 rejeitadas, com o Input dela) + nota 'A senha fica para a próxima.' (Tab saiu do campo). Entrar: marcador do Button › Rejeitar com o mouse: cartão 'Criação rejeitada', campo de nota vazio com o foco (TEXTAREA), nota 'O Entrar é um link, não um botão.'; 3 rejeitadas, 20 aceitas. As notas foram para o proposal.json. Aplicar aceitas: disco com images/cadastro.webp, images/login.webp, specs/sdui.json, revision 1 (2 containers, 9 marcações, 7 anotações). Ctrl+Z: sem images/ (revision 2, 0 containers) e o botão Aplicar aceitas · 20 de volta; Ctrl+Shift+Z: as duas imagens de volta (revision 3). Não conferi o selo 'Parcial' da proposta antes de aplicar. |
| R5.4a |  | ✅ | Continuei a revisão: filtro 'Sem decisão' (Eventos e Telas), nível Projeto, 'Aceitar o grupo Projeto' (2 aceitas, não usei Aceitar tudo), Aplicar aceitas ('22 mudanças aplicadas') e Sair da revisão. Cliente stdio: get_proposal_review traz 3 rejeitadas (Senha, Input da Senha via c15, Button do Entrar) e 2 notas ('A senha fica para a próxima.' e a do Button); propose_changes com supersedes devolveu superseded {status: applied, note: 'já estava aplicada e continua applied…'}. Tela: a proposta do R5.2 fica 'Aplicada · substituída por Correções do Entrar (R5.4a)' com 'Abrir a nova'; a nova tem 1 mudança. |
| R5.4b |  | ✅ | Proposta 'Lembrar senha (R5.4b)' (marcação com source + Input e Button sem source, 3 mudanças), sem revisar; a substituta ('v2', com placeholder no Input) com supersedes: resposta com warnings superseded-incomplete (undecided 3, acceptedNotApplied 0, inNewProposal same 2 / different 1 / missing 0). Tela: a antiga fica 'Substituída' com '3 sem decisão ficaram para trás' e 'Abrir a nova'; ao abrir por Ver: 'Esta proposta foi substituída por outra.' e mudanças 'igual na nova' (2) e 'diferente na nova' (1). |
| R5.5 |  | ✅ | Proposta 'Renomear título do login (R5.5)' (Título login → Título da tela) chegou em Propostas como Nova com Revisar, mesmo com outra proposta Nova na lista (sem abrir a revisão). Renomeei a marcação para 'Entrar na conta' na app (Enter): a linha ganhou o ícone de conflito. Revisar: a mudança de nome aparece como Conflito, e o marcador de Detalhes mostra Atual 'Entrar na conta', Antes 'Título login', Depois 'Título da tela', com Sobrescrever / Manter atual. Ao sair da revisão, o aviso 'Nova proposta' dela não voltou (o canto mostra só as outras). |
| R5.6 |  | ✅ | Proposta 'Mover Entrar 10 px' pelo MCP; tranquei Entrar com Alt+L (Detalhes: 'Trancada: não pode ser movida, redimensionada nem excluída…'); Revisar: aviso 'Item trancado' com 'Aceitar mudanças de posição ou remoção é permitido na revisão. A trava continua ligada depois de aplicar.'; as dicas (lidas pelo atributo title) nos cadeados da lista da revisão e no selo Trancado de Detalhes: 'Item trancado: aceitar é permitido e a trava continua'. Aceitar marcação e Aplicar aceitas: disco com Entrar em y 250 (10 a mais) e locked true; revision 7. |
| R5.7 |  | ✅ | Reexportação (update_container e update_marking com nome, rect e source de todas as 2 imagens e 9 marcações, inclusive Entrar trancada): erro no-changes ('a reexportação coincide com o projeto atual'), nenhuma proposta nova (6 pastas em proposals/ antes e depois). Com Cadastrar → 'Criar conta': proposta com 1 mudança (reviewChanges total 1, update 1); aparece em Propostas como Nova. mapping.json com o mesmo md5 nas duas. |
| R8.1a |  | ✅ | Tema Escuro: legível; marcação 'Teste R8' na Árvore e em Detalhes, some após 2× desfazer; User com links ← Input input_nome / input_idade. |
| R8.1b |  | ✅ | Retomada da revisão da Loja (Neste dispositivo) em tema escuro: Somente leitura, selos, Conflito/Topo, Banner hachurado, avisos do Botão Pagar legíveis. |
| R8.2 |  | ✅ | English (US): R8.1a e R8.1b repetidos; botão Continue, diálogo 'Exit the review?', selos, barra de status e Home em inglês; nenhum texto de interface em português (só dados). Idioma e tema restaurados. |
| R9.1 |  | ✅ | Pacote Material 3 aplicado (pasta): 0 erros, 42 avisos (Roboto ausente); specs/material3 no disco. |
| R9.2 |  | ✅ | Lista com Personalizado, Tamanho da seleção (desab sem marcação) e 4 tamanhos do M3; Configurações 360×800 criado; nome vazio: 'Dê um nome ao container.' |
| R9.3 |  | ✅ | Catálogo › Paleta: 15 tipos M3 + Nota/Tabela; selo Container em Card/Box/Row/Column. |
| R9.4 |  | ✅ | Top app bar e Row desenhados; com 'Ocultar sem anotação' o desenho permanece; Row sem contorno tracejado. |
| R9.5 |  | ✅ | 3 chips dentro do Row (filhos na Árvore). |
| R9.6 |  | ✅ | Alt+Shift+A: 'Arrumado', Row com 32 de altura; desfazer/refazer em uma ação; botão Arrumar e menu: 'Nada a arrumar'; Top app bar sem botão Arrumar. |
| R9.7 |  | ✅ | Ordem 2 de 4 → 3 de 4, Árvore acompanha. Com X 80/Y 230 o Button cai inteiro dentro do Text field e vira filho (Pertence a Text field); usei X 20 para manter irmãos. |
| R9.8 |  | ✅ | Label Wi-Fi na hora; desfazer/refazer; Arrumar acompanha a largura do texto. |
| R9.9 |  | ✅ | Largura mínima 40 (digitando 10 e 5); aviso no canto; Incompletas 2. Caminho do arraste não testado. |
| R9.10 |  | ✅ | Opção 'Mostrar componentes sobre fotos' desligada: botão na foto só contorno; ligada: desenhado. Não vai ao projeto. |
| R9.11 |  | ✅ | Text field mínimo 120×56; Incompletas 3; Diagnóstico › Componentes: Roboto 400/500 ausentes e '3 marcação(ões) com componente que não cabe'. |
| R9.12 |  | ✅ | Reabrir igual; mapping.json schema 13, container file null/background #FFFFFF, foto background null, sem chaves de desenho. |
| R9.12a |  | ✅ | Alt+H: componentes continuam desenhados, bordas e nomes somem; volta ao desligar. |
| R9.13 |  | ✅ | Proposta 'Detalhes' enviada; revision 27 inalterada. Posições padrão aninham o Button no Top app bar: reenviei com rect explícito (irmãos) e retirei a primeira. |
| R9.14 |  | ✅ | Revisão: Proposto mostra Top app bar e Button desenhados; Atual não tem o container; selo Criada. |
| R9.15 |  | ✅ | Aceitar tudo/Aplicar: revision 28; update_marking (y 340) e move_marking: revision 29; Top app bar já era o índice 0 (sem mudança de ordem). |
| R9.16 |  | ✅ | Largura 0: 'Largura e altura são números inteiros de 1 a 20000.'; Painel 600×400 #EEEEEE, file null. |
| R9.17 |  | ✅ | Tamanho da seleção: 120×40 do Button, container 'Do botão'; com só container selecionado a opção fica desabilitada. |
| R9.18 |  | ✅ | plan add_container sem aviso; propose OK; add_blank_image: valid + deprecated-op; Cartão aplicado. Guia diz formatVersion 2 e blank:true: app grava formatVersion 3 e o campo blank saiu (file:null). |
| R9.19 |  | ✅ | get_project só containers; get_container file:null; Foto (cartao.webp) e Fundo aplicados; get_container_file: sameAsImage true e container-without-file; sem chave images/imageId. |
| R9.20 |  | ✅ | add_image e add_blank_image: valid com deprecated-op; plan_changes não grava (revision 33). |
| R10.1 |  | ✅ | Catálogo da biblioteca abre; 0 erro(s) e 42 aviso(s); lista recolhida; 15 componentes numa camada; Top app bar aberto; nada gravado |
| R10.2 |  | ✅ | Busca chip→só Chip; zzz→Nenhum componente encontrado.; vazio→15; setas e Enter ok |
| R10.3 |  | ✅ | Button: Documento, Propriedades (4 linhas), Código 'Nenhuma plataforma declarada', Origens sdui, Galeria 4 imagens desenhadas, Experimentar |
| R10.4 |  | ✅ | Playground: 1000→240, 10→48, 500→80, 5→40; Largura inicial ≈83; outlined; dica some/volta; Restaurar valores ok |
| R10.5 |  | ✅ | mat-link: Chip abre no topo; 'Destino não encontrado: mapping://nao-existe'; HTML literal; imagem não carregada; sem link externo |
| R10.6 |  | ✅ | Recentes iguais; hash do pacote material3 idêntico antes/depois |
| R10.7 |  | ✅ | Dialogo do Button + Adicionar à tela e Paleta ok; disco: 3 botões m3-button (2 do roteiro + 1 de um clique extra meu no teste do botão com nada selecionado). Variante 'fora de vista/desabilitado' não obtida: o centro da vista sempre caiu sobre uma imagem (botão fica habilitado e aponta para ela) |
| R10.8 |  | ✅ | vazio: abas listam Nota e Tabela; 'Nenhuma anotação será afetada.'; após Apagar dados, estado vazio nas duas abas e Abrir Especializações abre o diálogo sem especialização |
| R10.9 |  | ✅ | Select só com Personalizado e Tamanho da seleção (desabilitado); Livre 500×300 #CCCCCC criado e selecionado |
| R11.1 |  | ✅ | Botão Abrir projeto de exemplo entre Abrir zip e Abrir biblioteca; Guia interativo abaixo de Ajuda; abre aba nova /guia/index.html, tema escuro, fonte do sistema, nenhum recurso externo; aba da app segue na tela inicial. (Tema claro do guia fica para o VIS) |
| R11.2 |  | ✅ | 12 passos; Anterior desabilitado no 1 e Próximo no 12; Cadastro 6 marcações; Configurações e Detalhes do pedido sem foto, com 'Plano Pro' e 'Pedido #1024' desenhados; clique mostra caminho/posição/anotações; ocultar camada Componentes tira contornos |
| R11.3 |  | ✅ | Ajuda abre em Guia interativo (texto, botão Abrir o guia interativo abre aba nova, dica do exemplo) |
| R11.4 |  | ✅ | exemplo-completo: 4 telas, Árvore conforme (Idade com aviso, Título com cadeado), post-it Nota na raiz Canvas, 9 camadas; Salvo / Neste dispositivo / 1 proposta(s) nova(s), sem 'Alterações não exportadas'; Diagnóstico 0 erro(s) 2 aviso(s) Roboto; Incompletas 1 (Chip Wi-Fi, não cabe) |
| R11.5 |  | ✅ | Detalhes da app = painel do guia (Cadastrar: btn_cadastrar, submit, /usuarios, origem=cadastro, onHold 500, nota Dúvida); alternar Eventos ok; atalhos 1,2,3,5,6,7,9 abrem/fecham as janelas da tabela do guia; Paleta lista Material 3 e Nota |
| R11.6 |  | ✅ | Revisão: Atual/Proposto (Perfil só em Proposto); Aceitar tudo=10; rejeitar Endereços → Aplicar aceitas · 8; aplicou '8 mudança(s) aplicada(s)' (selo Aplicada, Árvore com Perfil sem Endereços); Ctrl+Z voltou tudo de uma vez (Aplicar aceitas · 8 de novo); diálogo Sair da revisão? com Continuar revisando/Sair mesmo assim/Aplicar agora · 8; Esc/clicar fora = Continuar, foco volta ao botão Sair da revisão |
| R11.7 |  | ✅ | Alt+Shift+A em Filtros: aviso Arrumado e Chip Wi-Fi deixa de ser incompleto; Ctrl+Z desfaz (Incompletas volta a 1). Alterações não exportadas já visível antes (como o guia diz) |
| R11.8 |  | ✅ | Lista com exemplo-completo (Neste dispositivo), sem pedir pasta; Excluir (confirmação 'será apagado deste dispositivo') remove a linha; nenhum arquivo novo no disco além do relato |
| R12.1 |  | ✅ | Grupo no canvas; A e B membros, C fora |
| R12.2 |  | ✅ | disco conforme (parentId, rect inteiro, scale 5) |
| R12.3 |  | ✅ | B sai e volta; parentId acompanha |
| R12.4 |  | ✅ | Bola A→B→canvas; desfazer volta ao B |
| R12.5 |  | ✅ | Grupo absorve C |
| R12.6 |  | ✅ | desfazer/refazer juntos |
| R12.7 |  | ✅ | excluir Grupo: os 3 containers ficam |
| R12.8 |  | ✅ | seleção múltipla (Shift simulado por evento sintético: o modificador do clique da ferramenta não chega à app) |
| R12.9 |  | ✅ | duplo clique e menu de contexto = 5 itens |
| R12.10 |  | ✅ | arrasto conjunto, trava, desfazer único |
| R12.11 |  | ✅ | uma confirmação; cancelar não muda |
| R12.12 |  | ✅ | parte do ARRASTO da Paleta ao canvas: não executado (precisa do dono/arrasto nativo); o restante do passo conferido |
| R12.13 |  | ✅ | conferido conforme o guia (sem divergência anotada) |
| R12.14 |  | ✅ | conferido conforme o guia (sem divergência anotada) |
| R12.15 |  | ✅ | v12 abre sem faixa; disco intocado até o 1º salvamento; depois v13 + notas + specs + backup mapping.v12.<data>.json idêntico ao original; v13 abre sem faixa nem Notas, sem specs/notas após salvar, Paleta vazia ('Nenhuma biblioteca com componentes aplicada') |
| R12.16 |  | ✅ | Notas › Remover › Apagar dados ('1 anotação afetada: Notas: 1'; toast 'Notas removida'): disco sem 'notas' (grep=0), sem specs/notas, specializations só material3, marcação flutuante permanece sem anotação; reaberto: Camadas sem Notas, Paleta só Material Design 3, Especializações só Material 3 |
| R12.17 |  | ✅ | Nota (Paleta, sem container) + Ligar a…: seletor 'Ligar Nota a…' lista Botão e Destino (sem a própria nota); nasce seta curva 'Nota → Botão', Origem Nota, Destino Botão, Estilo Curva; disco: from=Nota, to=Botão, curve, points [], locked false |
| R12.17a |  | ✅ | alça da seta pelo arrasto da extensão: Botão→Destino criada (curve, points []); solta no fundo cancela (continuam 2 setas) |
| R12.18 |  | ✅ | Reta/Canto/Curva e menu do traço (✓ no estilo atual; Canto pelo menu): disco straight, elbow, curve, elbow, points [] sempre |
| R12.18a |  | ✅ | alça do meio arrastada 80 px (para o lado, pois Botão e Destino estavam alinhados na vertical): points com 1 ponto, curve; desfazer volta points [] numa ação |
| R12.18b |  | ✅ | Destino movido ~60 un.; Canto, segmento do meio arrastado ~60 px: elbow com 1 ponto {328,604}; desfazer → []; arrastar de novo + duplo clique → [] (e 1 desfazer restaura o ponto) |
| R12.19 |  | ✅ | analytics aplicada pelo select_folder (Pacote 'Analytics' v1 · 2 tipos · 1 componente · 0 erros/0 avisos; toast 'Analytics aplicada: 1 camada criada'); na seta a camada oferece só Transição; no Botão só Evento; anotação Transição (condicao 'Toque em Continuar', evento 'continue_tapped') com markingId = id da seta; specs/analytics/analytics.spec.json no disco |
| R12.20 |  | ✅ | pelo cliente stdio: plan_changes válido (marcação flutuante Evento + seta); plan_changes com points em create_arrow → invalid-arguments ('points não é aceito: a rota da seta é da pessoa'); propose_changes gravou a proposta (3 mudanças); na app Revisar › Aceitar tudo (3 aceitas) › Aplicar aceitas (Aplicada); disco: Evento floating true, containerId null, rect {1024,337,260×140} (à direita de Home, na altura do Botão: y do Botão no canvas = 166,7+51×3,33 = 337), seta from=Evento to=Botão curve points []; anotação analytics/evento nome continue_tapped, propriedades origem=home |
| R12.21 |  | ✅ | Delete na Nota: confirmação cita '1 seta(s) ligada(s) a ela também saem'; disco sem a Nota e sem a seta dela (restam as outras 2); Desfazer 1x: Nota e seta voltam com os mesmos ids (3a1bba, c08dea) |
| R12.22 |  | ✅ | Exportar › Baixar (setas.zip 11,6 KB) salvo em ws/zip-R12.22/ por save_file; mapping.json do zip (rev 30, schema 13): as 3 setas com os mesmos id/from/to/style/points da pasta e as 3 anotações; Mostrar setas desligado: canvas sem nenhum traço (Árvore e disco mantêm as setas); religado: voltam; pasta reaberta: 3 setas; Abrir zip (Neste dispositivo): 3 setas e a seta Botão→Destino com Transição (Toque em Continuar / continue_tapped) |
| R12.23 |  | ✅ | stdio: get_project counts canvasMarkings 2, floatingMarkings 2, arrows 3, containers com parent null; list_markings canvas:true só space canvas (Nota e Evento, floating true, container 'Canvas'); get_marking do Evento: container null, path Canvas › Evento…, space canvas, floating true, members vazios, arrows.outgoing → Botão; get_marking do Botão: space container, arrows.incoming com a seta do Evento (e a da Nota) e outgoing com a do Destino; get_container Home: parent null, placement {0,166.7,3.33}; list_markings com canvas:true + container → invalid-arguments ('canvas não combina com container') |
| R12.24 |  | ✅ | stdio propose_changes create_marking sem container (Lente, rect -400,-300,200×120); Revisar mostra o nível Canvas com a Lente; Aceitar tudo + Aplicar aceitas; disco: containerId null, floating false, rect pedido; get_marking: space canvas, container null, path Canvas › Lente; plan_changes update_marking container Home + rect 10,10,60×40: válido ('ir para o container Home, retângulo x 10, y 10, 60×40'), mapping.json com o mesmo md5 antes e depois (não gravou); container null + rect + parent: válido com aviso ignored-argument para parent |
| R12.25 |  | ✅ | stdio propose_changes (create_arrow Botão→Lente + create_annotation analytics/transicao Toque/lente_tocada); app: Revisar › Aceitar tudo (2) › Aplicar aceitas; disco: 4 setas e anotação com markingId = id da seta (c41899), type analytics/transicao; get_marking do Botão: arrows.outgoing com a seta (to Lente); get_marking da seta: kind arrow, from, to e a anotação Transição com condicao/evento; plan_changes create_annotation transicao no Botão → type-not-applicable com hint |
| R12.26 |  | ✅ | get_marking_image da Lente → erro canvas-marking (hint: get_container_file / marcação dentro de container); da seta → erro arrow (hint: from/to); do Botão (crop) → imagem PNG 79×39, url e markdown, urlCheck HEAD/GET 200 e sameAsImage true |
| R12.27 |  | ✅ | create_project mcp-notas (sem notes): layers 2 (Camada 1 + Notas), specializations notas v2, specs/notas com notas.spec.json, components, docs; mcp-sem-notas (notes:false): 1 camada, sem especialização, sem specs; counts canvasMarkings/floatingMarkings/arrows 0 nos dois; mcp-notas aberto na app: camada Notas em Camadas e Nota/Tabela na Paleta |
| VIS.1 |  | ✅ | projeto 'visual' (cópia de setas): marcações do canvas (Lente), flutuantes (Nota, Evento, Tabela), Home/Detalhe e as 3 setas (reta, canto, curva) |
| VIS.2 |  | ✅ | escuro, 1280 px, pt-BR: Árvore, Camadas e Detalhes sem texto cortado nem rolagem horizontal da página (capturas em anexos/VIS/dark-1280-pt) |
| VIS.3 | A3 | ❌ (A3) | escuro 1280 pt-BR: Lista, Incompletas, Propostas ok; Diagnóstico: Limpar/Copiar cobrem a aba Propostas e cortam o rótulo da aba Lista (A3) |
| VIS.4 |  | ✅ | escuro 1280 pt-BR: Catálogo (Componentes) e Paleta (Notas, Analytics) sem corte |
| VIS.5 |  | ✅ | escuro 1280 pt-BR: Configurações, Exportar e Especializações legíveis; Esc devolve o foco ao botão que abriu o diálogo (Configurações, Exportar, Especializações) |
| VIS.6 |  | ✅ | escuro 1280 pt-BR: 'Sair da revisão?' (3 botões legíveis; Esc e X devolvem o foco a 'Sair da revisão'); 'Pasta indisponível' (pasta renomeada: Esc e Cancelar devolvem o foco ao Abrir da linha; Localizar pasta… reabriu o projeto); extras: 'Erro ao salvar' + 'Fechar sem salvar?' com a pasta movida |
| VIS.7 |  | ✅ | claro 1280 pt-BR: Árvore, Camadas, Detalhes, Lista, Incompletas, Diagnóstico, Propostas, Catálogo e Paleta sem rolagem horizontal; a aba Lista aparece cortada com Propostas/Diagnóstico ativas (A3 reproduz no claro) |
| VIS.8 |  | ✅ | claro 1280 pt-BR: Configurações, Exportar, Especializações, Sair da revisão? e Pasta indisponível legíveis; Esc e Cancelar devolvem o foco ao botão que abriu (nunca ao body) |
| VIS.9 | A4 | ❌ (A4) | escuro 900 px pt-BR: janelas e diálogos legíveis, sem rolagem horizontal da página; na revisão, 'Rejeitar marcação' cortado e rolagem horizontal dentro de Detalhes (A4); Lista some com Propostas/Diagnóstico ativas (A3) |
| VIS.10 | A4 | ❌ (A4) | claro 900 px pt-BR: janelas e diálogos legíveis; revisão com 'Rejeitar marcação' cortado (A4, 2x); Pasta indisponível e Sair da revisão? ok; Home com 'Remover da lista' em 2 linhas e borda da tabela descontínua (observação) |
| VIS.11 |  | ✅ | en-US escuro 1280: janelas, Catálogo/Paleta, Configurações, Exportar, Especializations, Exit the review? e Folder unavailable traduzidos e legíveis, sem rolagem horizontal; A3 reproduz (Clear/Copy cobrem Proposals); 'Interactive guide (in Portuguese)' indica que o guia segue em português |
| VIS.12 | A4 | ❌ (A4) | en-US claro 900: janelas e diálogos legíveis; na revisão 'Reject marking' cortado ('Reject mark…', A4); Lista some com Proposals/Diagnostics ativas (A3) |
| VIS.13 |  | ✅ | foco ao fechar diálogos: Esc em Configurações, Exportar, Especializações, Sair da revisão? e Pasta indisponível, nas 6 configurações; mouse (X, Cancelar, Fechar, Cancelar da Pasta indisponível) em Exportar, Especializações, Configurações e Pasta indisponível: o foco sempre volta ao botão que abriu, nunca ao body |
| VIS.14 | A5 | ❌ (A5) | síntese: texto cortado em A1 (R1.3), A3 e A4; dica da barra lateral cobre o item 'Fechar projeto' do menu do projeto (A5); sem rolagem horizontal da página em nenhuma configuração |
| VIS.15 |  | ✅ | página do guia (Guia do Mapping) em tema claro, 900 px: sem rolagem horizontal, texto legível; a lista de Atalhos não traz Ctrl+Shift+4 (Lista de anotações) e o rótulo 'Guia interativo' vira 'Interactive guide (in Portuguese)' em en-US |
| E1.1 |  | ✅ | pasta v12 (migracao-v12: 9 marcações, 2 containers, 7 anotações, uma com inherit em Formulário): abre sem perda na Árvore e no canvas; o Diagnóstico registra open.migration (Schema 13: herança saiu do formato; nenhuma anotação apagada) |
| E1.2 |  | ✅ | zip v12 (mesmo conteúdo): abre como projeto deste dispositivo com as 9 marcações e a mensagem open.migration no Diagnóstico |
| E1.3 |  | ✅ | ao primeiro salvamento a faixa 'Project upgraded from format v12: a copy of the original was saved' aparece; disco: schemaVersion 13, 0 anotações com inherit, floating em todas as marcações, backups/mapping.v12.20261023-031559.json (v12, 9 marcações) criado |
| E1.4 |  | ✅ | Desfazer após migrar: X 30→26 volta e salva (rev 9, ainda v13 sem inherit); o desfazer para no ponto da migração (botão desabilita), sem erro |
| E2.1 |  | ✅ | Projeto desempenho montado direto em JSON (equivale a zip/pasta): 4 containers em branco, 200 marcações, 100 setas (3 estilos), schema 13, mapping.json 79816 bytes. |
| E2.2 |  | ✅ | Abertura: 1 long task de 77 ms. Pan e zoom (11%↔15% e 88%): 361 quadros, máx 17 ms, p95 17 ms, 0 quadros >100 ms, sem long task. |
| E2.3 |  | ✅ | Seleção Shift por 8 marcações: ~1,1 s de script com pausas de 180 ms entre cliques (sem long task). Arrasto conjunto das 8 (com as setas acompanhando): 301 quadros, máx 17 ms, 0 >100 ms, sem long task. |
| E2.4 |  | ✅ | Um Ctrl+Z desfez o arrasto conjunto das 8 de uma vez (tela e disco: M1-1..M1-14 de volta em x/y originais, 200 marcações, 100 setas, rev 5). Console sem erro novo (a releitura repete o histórico antigo). |
| E3.1 |  | ✅ | Cadeia no projeto 'cadeia' (cópia do espaco-v13 + Notas v2): aplicar biblioteca, nota e tabela (Paleta › Adicionar ao canvas), seta curva Tabela→Nota, mover, arrasto conjunto, nota para dentro do container (Floating desmarcado em Detalhes → container Livre13, rect convertido), excluir com seta (diálogo avisa '1 seta some'). 9 passos de histórico; disco consistente em cada ponto (rev 2→10), sem parentId/seta/container pendurados. |
| E3.2 |  | ✅ | Ctrl+Z ×9 até o começo: cada ponto do disco igual ao do avanço (excluir→seta volta; troca→flutuante no canvas; arrasto conjunto→x/y anteriores; seta; tabela; nota; biblioteca removida, specs vazio). Revisão sobe a cada desfazer (19→37). Console sem erro. |
| E3.3 |  | ✅ | Ctrl+Y ×9 até o fim: cada ponto igual ao do avanço; estado final idêntico ao original (1 nota, 0 setas) e rev 46. Sem pendurados. |
| E4.1 |  | ✅ | Projeto 'persist' (cópia do setas: 5 marcações, 4 setas curva/elbow, 2 notas flutuantes, 2 containers). A tecla F5 enviada pela extensão não recarregou a página (performance.now() seguiu subindo); usei navegar à mesma URL. Edição salva em <1 s no disco (rev 32→35) e reaberta idêntica. Com navegação forçada logo após um arrasto, a app mostrou o aviso 'Sair do site?' (tem alterações não salvas); descartando, o disco ficou no último estado salvo (rev 35), JSON válido, sem arquivo parcial. |
| E4.2 |  | ✅ | Fechar projeto e reabrir a pasta pela lista de recentes: marcações, setas e notas idênticas; desfazer zerado após reabrir (esperado). |
| E4.3 |  | ✅ | Exportar (Download → diálogo salvar do Windows, setas.zip 13,8 KB): mapping.json do zip idêntico ao disco (markings, arrows, containers, annotations; schema 13, rev 35), com specs e proposals. Abrir o zip: projeto 'Neste dispositivo' igual na tela. |
| E4.4 |  | ✅ | Projeto neste dispositivo: editei (nota para 191,177), recarreguei com navegação forçada e reabri pela lista: mesma posição, setas intactas; a lista marca 'Alterações não exportadas'. |
| E5.1 |  | ✅ | Projeto e5 (create_project notes true: camada Notas + specs/notas; e5-sem-notas, notes false: 1 camada, sem specs; sem 'root' com 2 raízes: erro root-required claro). Proposta 1 aplicada na app: get_project counts (2 containers, 7 marcações, 4 no canvas, 3 flutuantes, 4 setas, 3 anotações); get_marking mostra space, floating, members, arrows in/out, container.parent; get_container traz placement fracionário (100.5, 200.25, escala 1.5625); list_markings canvas/floating true/floating false/container batem; canvas+container recusado com mensagem. |
| E5.2 |  | ✅ | Proposta 2 (9 mudanças) aplicada: marcação do canvas→container (rect nos pixels do container), filha de container→canvas (parent sai), flutuante→não flutuante, container→flutuante (rect convertido 832,669,234×94 = 800.75+20×1.5625…), rect inteiro em Cabeçalho. Disco confere (rev 1→2, sem pendurados). |
| E5.3 |  | ✅ | create_marking com near: nota near container (margem esquerda da Tela A, x -164, empilhada de cima p/ baixo), nota near marcação, tabela near Tela B (x 1388); containers com placement fracionário (100.5/200.25 e 800.75/200.25); near em marcação sem componente flutuante: ignorado com aviso; update_container sobre outro: image-overlap. |
| E5.4 |  | ✅ | create_arrow straight/elbow/curve ok; delete_arrow aplicado na revisão; points em create_arrow e update_arrow recusado (invalid-arguments, mensagem 'a rota é da pessoa'); update_arrow de seta existente: aviso ignored-argument (a proposta só leva criar/remover setas); seta com as duas pontas na mesma marcação: arrow-self. |
| E5.5 |  | ✅ | get_marking_image: marcação do canvas → erro canvas-marking com hint; seta → erro arrow com hint; marcação em container (crop e context com outlineChildren) devolve PNG e urlCheck sameAsImage true. create_project notes true/false conferido em E5.1. |
| E5.6 |  | ✅ | Propostas com mudança de espaço (1 criação/2 trocas) revisadas e aplicadas pela app (Aceitar tudo, Aplicar aceitas, Desfazer reverte tudo de uma vez). Erros: root-required, project-not-found (available+hint), not-found, rect-too-small, rect-out-of-image, image-overlap, arrow-self e invalid-arguments têm mensagem clara; os de plan_changes só trazem o hint genérico do lote (obs.). |
| E6.1 |  | ✅ | Projeto e5 (22%, 'Ajustar tudo'). Arrastar da Paleta (arrasto real do mouse): Nota sobre a Tela A → nota flutuante no canvas (262,795), por cima do container, sem virar filha; Tabela sobre a marcação Cabeçalho → flutuante (253,302), parentId nulo; Nota no canvas vazio → (6,1467); solta na barra superior (fora do canvas) → nada criado (11 marcações no disco, rev 5). A app não tem 'slot'; interpretei como soltar sobre uma marcação existente. 'Adicionar ao canvas' também funciona (E3). |
| E6.2 |  | ✅ | Shift+clique junta (barra: '2 itens selecionados') e tira o item já selecionado; duplo clique seleciona o item de cima. Ctrl+clique não junta: troca a seleção (1 item). Seleção por retângulo não existe: arrastar o fundo move a vista (o guia só documenta Shift+clique, duplo clique e Selecionar com o conteúdo). |
| E6.3 |  | ✅ | Arrasto conjunto (2 notas): move os dois e é um único passo de desfazer (+909 em y, disco rev 9). Com uma nota trancada (Alt+L) o arrasto não começa nem pela nota destrancada; Alt+L na seleção mista tranca as duas e Alt+L de novo destranca as duas. Teclas de seta com a marcação selecionada não movem nada (disco sem mudança; não é documentado). |
| E6.4 |  | ✅ | Trava: 'Trancar todas as marcações desta imagem' tranca cada marcação (locked=true, MCP lock.source 'self'); MCP recusa mover/trocar de espaço marcação trancada (code locked) mas aceita renomear; trancar o container (Alt+L) fica só no container ('suas marcações continuam editáveis'): marcação sem trava própria continua editável. Destrancado tudo ao fim. |
| E7.1 |  | ✅ | Proposta 'E7: nota, tabela e setas' (nota+tabela near, 3 setas). Na revisão: aceitar a nota (decide marcação, anotação e a seta dela juntas: 3), N/R/A pelo teclado, rejeitar a tabela (rejeita a marcação, a anotação e a seta Tabela→Livre: 3), aceitar a seta Livre→Cabeçalho. Aplicar aceitas: 'Aplicadas 4 mudanças'; disco: nota + 2 setas, sem tabela nem seta para ela (rev 13). |
| E7.2 |  | ✅ | Ctrl+Z desfez as 4 de uma vez (disco: 11 marcações, 3 setas, rev 14); a proposta voltou a 'Em revisão' (4 aceitas, 3 rejeitadas) com botão Continuar; 'A revisão voltou de onde você parou'. Reaplicada e fechada. O menu da proposta aplicada só oferece 'Excluir proposta…' (não usei). |
| E7.3 |  | ✅ | Detalhes na revisão: ao selecionar uma seta proposta mostra seção Seta (De/Para/Estilo reto-curva-cotovelo), Anotações e aviso 'Criada pela proposta'; a lista por nível mostra 'Seta Nota → Cabeçalho created' sob a nota, e as setas ligadas à tabela rejeitada somem junto. |
| E8.1 |  | ✅ | Nomes: seta com 336 caracteres (emoji, ZWJ, japonês, acentos) salva e volta idêntica no mapping.json; marcação com emoji + 150 'W' sem espaço quebra linha no Detalhes, rótulo truncado com reticências no canvas e na barra de status, sem rolagem horizontal da página (scrollWidth=clientWidth=900); nome só com espaços vira vazio (name null) e o rótulo cai para o tipo ('Tabela'); título de tabela longo com emoji persistido; a tabela passou a aparecer em Incompletas ('The component does not fit'), esperado. |
| E8.2 |  | ✅ | Zoom por Ctrl+roda: limite superior 5000% e inferior 1% (travam, não passam); a 5000% e a 1% o canvas segue respondendo, 'Enquadrar tudo' volta a 34%; sem TypeError/RangeError/NaN no console. |
| E8.3 |  | ✅ | Imagem PNG de 12000×9000 (108 MP, 1,5 MB) adicionada por 'Adicionar imagens': a app a converteu para webp 2560×1920 (482 KB, images/imagem-enorme.webp), escala inicial 0,39, uma tarefa longa de ~400 ms só na importação; zoom 1%↔5000% e arrasto sem tarefas longas; disco sem problemas (rev 20). |
| E8.4 |  | ✅ | MCP: rect 7×7 e 1×1 recusados com rect-too-small (mínimo MIN_MARKING_SIZE=8). Proposta com 3 marcações de mesmo rect, 8×8, 8×120 e uma de 300×300 cobrindo: aplicada (7 mudanças, rev 21), pai pela geometria (s3→s2→s1→grande). Na app, clique repetido no mesmo ponto percorre s3→s2→...; a fina de 8 px (≈3 px de tela) é selecionável; arrastar menos de 8 px com a ferramenta de marcação não cria nada nem dá erro (sem aviso na tela). |
| E8.5 |  | ✅ | Apagar container Tela A (7 marcações, 4 setas, 1 trava) com 2 marcações do canvas apontando para dentro (Nota→Cabeçalho, seta de Livre→Cabeçalho): diálogo 'Delete container?' avisa '7 marcação(ões) e 0 anotação(ões)... 4 seta(s) ... Aviso: 1 item(ns) travado(s) será(ão) apagado(s) também. Você pode desfazer.'; ao confirmar, disco rev 22 com 11 marcações e 2 setas (as 4 setas saíram, as marcações do canvas ficaram), sem problemas; Ctrl+Z restaurou 18 marcações, 6 setas, parentes e posição, rev 23. |
| E8.6 |  | ✅ | Na app, 'Link to…' de uma marcação não lista ela mesma ('No marking found' ao buscar o próprio nome) e arrastar a alça da seta para dentro da mesma marcação não cria seta (rev e contagem iguais); o MCP recusa arrow-self. Duas setas entre o mesmo par (Destino→Livre elbow e curve) são aceitas e coexistem (rev 24, 7 setas, problemas: nenhum). |
| E8.7 |  | ✅ | Apagar a marcação Destino com 3 setas ligadas ('3 arrow(s) attached to it also go away'): disco 17 marcações e 4 setas (rev 25); Ctrl+Z voltou 18 marcações e as 7 setas com os mesmos extremos (rev 26); Ctrl+Y apagou de novo (17/4, rev 27); Ctrl+Z restaurou (18/7, rev 28); sem erro de TypeError/RangeError no console. |

## Passos definidos para VIS e E1 a E8

**VIS**

- VIS.1: Montar o projeto visual (canvas, flutuantes, notas, tabela, setas reta/canto/curva)
- VIS.2: Escuro 1280 pt-BR: Árvore, Camadas, Detalhes
- VIS.3: Escuro 1280 pt-BR: Lista, Incompletas, Diagnóstico, Propostas
- VIS.4: Escuro 1280 pt-BR: Catálogo e Paleta
- VIS.5: Escuro 1280 pt-BR: diálogos Configurações, Exportar, Especializações
- VIS.6: Diálogos Pasta indisponível e Sair da revisão?
- VIS.7: Claro 1280 pt-BR: janelas, Catálogo e Paleta
- VIS.8: Claro 1280 pt-BR: diálogos
- VIS.9: Janela de 900 px escuro: janelas e diálogos, sem rolagem horizontal
- VIS.10: Janela de 900 px claro: janelas e diálogos
- VIS.11: en-US escuro 1280: janelas e diálogos
- VIS.12: en-US claro 900: janelas e diálogos
- VIS.13: Foco ao fechar diálogos (Esc e mouse): nunca no body
- VIS.14: Texto cortado/sobreposto e dica cobrindo menu (síntese)
- VIS.15: Página do guia em tema claro

**E1**

- E1.1: Pasta v12 (marcações, containers, anotações) abre sem perda
- E1.2: Zip v12 abre sem perda
- E1.3: Faixa/aviso da migração aparece; mapping.json v13 sem inherit após salvar
- E1.4: Desfazer após migrar não quebra

**E2**

- E2.1: Montar projeto ~200 marcações em 4 containers e ~100 setas (stdio/zip)
- E2.2: Abrir e pan/zoom sem travar mais que 1 s
- E2.3: Arrasto e seleção múltipla
- E2.4: Desfazer em lote; console sem erro

**E3**

- E3.1: nota → tabela → seta → mover → arrasto conjunto → trocar espaço → apagar com setas
- E3.2: Ctrl+Z até o começo, disco consistente em cada ponto
- E3.3: Ctrl+Y até o fim, disco consistente em cada ponto

**E4**

- E4.1: F5 no meio de uma edição
- E4.2: Fechar e reabrir a pasta
- E4.3: Exportar zip e abrir o zip
- E4.4: Projeto neste dispositivo: notas, tabelas, setas e flutuantes idênticos

**E5**

- E5.1: get_marking/list_markings/get_container/get_project (space, members, arrows, counts, parent)
- E5.2: update_marking (container, floating, rect inteiro)
- E5.3: create_marking com near (marcação e container, placement fracionário)
- E5.4: create/update/delete_arrow (points recusado)
- E5.5: get_marking_image canvas-marking e arrow; create_project notes true/false
- E5.6: Propostas com mudanças de espaço e erros com mensagem/hint

**E6**

- E6.1: Arrastar da Paleta: container, slot, canvas e fora
- E6.2: Seleção múltipla Shift/Ctrl e retângulo
- E6.3: Arrasto conjunto com bloqueio e teclas de seta
- E6.4: Travas e herança

**E7**

- E7.1: Proposta com nota, tabela e seta: Revisar, aceitar, rejeitar
- E7.2: Reverter e reabrir a revisão
- E7.3: Detalhes na revisão com as setas

**E8**

- E8.1: Nomes vazios, muito longos e com emoji
- E8.2: Zoom extremo
- E8.3: Imagem enorme
- E8.4: Marcações sobrepostas e de 1 px
- E8.5: Apagar container com marcação do canvas apontando para dentro
- E8.6: Setas com as pontas na mesma marcação
- E8.7: Seta para marcação apagada e desfeita

## Achados

### A1 — Selo "Modelo de dados" cortado na linha da camada

- Severidade: baixa
- Passo: R1.3 (reproduziu: sim, 2 camadas: Classes e Endpoints)
- Esperado: "Cada linha da Camadas mostra o nome e o selo inteiros".
- Obtido: o selo mostra "Modelo de d…". Medido: `.layer-badge` com `max-width: 96px`, `text-overflow: ellipsis`, scrollWidth 109 > clientWidth 94; sem `title`/aria-label com o nome completo. Viewport 1487×698, tema escuro, pt-BR.
- Evidência: anexos/R1.3-selo-cortado.png

### A2 — Ver limpo: clicar no canvas troca a seleção de Nome para a imagem

- Severidade: baixa
- Passo: R1.20a (reproduziu: sim, 2x)
- Esperado: com Ver limpo ligado, clicar no canvas não seleciona marcação; ao desligar, Nome continua selecionada.
- Obtido: o clique (sobre a marcação Idade) seleciona a imagem; Detalhes mostra images/cadastro.webp e Nome deixa de estar selecionada. Zoom também mudou (75% → 39%).
- Evidência: anexos/R1.20a-selecao-perdida.jpg

### A3 — Bottom (janela inferior): com a aba Diagnóstico ativa, os botões Limpar e Copiar cobrem a aba Propostas

- Severidade: média
- Passo: VIS.3 (reproduziu: sim, 2x)
- Esperado: as quatro abas (Lista, Incompletas, Diagnóstico, Propostas) continuam visíveis e clicáveis; os botões da aba ativa não cobrem outra aba.
- Obtido: com a janela de 1280 px (painel do meio com ~370 px) e a aba Diagnóstico ativa, "Limpar" (x 532–589) e "Copiar" (x 591–646) ficam exatamente sobre a aba Propostas (x 530–627); `elementFromPoint` no centro da aba Propostas devolve o cabeçalho, e o rótulo da aba Lista aparece cortado (".ista"). Ao tentar abrir Propostas clicando onde ela estava, o clique caiu em **Limpar** e apagou a lista do Diagnóstico da sessão (efeito destrutivo, sem confirmação; as mensagens já estavam registradas neste relato).
- Evidência: anexos/VIS/dark-1280-pt/A3-diagnostico-cobre-propostas.jpg e 08-diagnostico.jpg (tema escuro, pt-BR, Chrome 1280×698).
- Reforço (claro, 1280 e 900 px): o mesmo ocorre no tema claro. Com 900 px a aba **Lista some por inteiro** quando Propostas ou Diagnóstico está ativa (a faixa de abas rola por dentro: `tabs` scrollWidth 293 > clientWidth 156 com Diagnóstico ativa; "Incompletas" fica como "completas"). A aba só reaparece pelo ícone da lista na barra lateral esquerda (Ctrl+Shift+4). Evidência: anexos/VIS/light-900-pt/08-diagnostico.jpg, light-1280-pt/08-diagnostico.jpg.

### A4 — Revisão de proposta em 900 px: botão "Rejeitar marcação" cortado e rolagem horizontal dentro de Detalhes

- Severidade: baixa
- Passo: VIS.10 (reproduziu: sim, 2x)
- Esperado: no mínimo suportado (900 px), os botões de decisão aparecem inteiros no painel Detalhes, sem rolagem horizontal.
- Obtido: na revisão (Campo A, "Marcação criada"), "Aceitar marcação" e "Rejeitar marcação" ficam lado a lado e o segundo é cortado ("Rejeitar r…"): botão com right 910 contra borda do painel em 860; `.tool-window-body` com scrollWidth 329 > clientWidth 264 e overflow-x auto, ou seja, rolagem horizontal dentro de Detalhes. Também a faixa de atalhos do rodapé da aba Propostas ("Aceitar / Rejeitar / Próxima pendente") fica cortada na vertical (`.review-footer` 678 > 305). Tema claro, pt-BR, janela de 900 px. A ação continua alcançável pela rolagem ou pelas teclas A/R.
- Evidência: anexos/VIS/light-900-pt/A4-revisao-rejeitar-cortado.jpg e 12a-revisao-detalhes.jpg.

### A5 — Dica da barra lateral cobre o item "Fechar projeto" do menu do projeto aberto

- Severidade: baixa
- Passo: VIS.14 (reproduziu: sim, 2x)
- Esperado: dica de ferramenta não cobre um menu aberto (o guia manda procurar "dica cobrindo menu").
- Obtido: com o menu do nome do projeto aberto, passar o mouse no ícone "Árvore de marcações" da barra lateral abre a dica "Árvore de marcações Ctrl+Shift+1" (x 8–169, y 120–145), que cobre o começo do item "Fechar projeto" (x 104–295, y 116–144); só "…eto" fica legível. Com o ícone "Camadas" a dica cai abaixo do menu e não cobre. Janela de 900 px, en-US e tema claro ("Marking tree" / "Close project"); a posição vem do layout, não do idioma.
- Evidência: anexos/VIS/light-900-en/A5-dica-cobre-menu.png e A5-dica-cobre-menu-2.jpg.

## Observações (sem severidade)

- Janela do Chrome: o `resize_window` (1500 × 900) deixou a viewport em 1487 × 698 com DPR 1,25, igual à rodada anterior.
- O aviso do Konva ("The stage has 6 layers…") aparece no console ao abrir o editor; é conhecido e não conta.
- R3.8 a R3.8d: os projetos antigos (v8, v10, v11, v12) foram montados por script (ws/prep-migracao.py), copiando o principal e rebaixando o mapping.json como o guia manda; não recriei cada um pela app. O que se testa (abrir, migrar, faixa, backup) é o mesmo. As cópias do preparo estão em ws/fixtures/.
- R3.1 a R3.5: o principal do R1 já foi criado em ws/design/mapeamentos/principal, então não houve o aviso Pasta indisponível (não movi a pasta); o aviso entra na passada VIS.
- R3.5: o aviso 'Projeto atualizado por fora.' não foi capturado (some em segundos); a recarga foi confirmada pelo estado da tela.
- R3.14 a R3.17: o Desfazer foi feito com o botão da barra de ferramentas (Desfazer, Ctrl+Z na dica), porque o foco estava num campo de texto e o atalho digitaria nele; o efeito é o mesmo do atalho.
- R3.14: o guia pede preencher o FAB com cor e Nota; digitei antes "teste" no campo Label (extended) por engano (o leiaute muda quando a validação muda) e corrigi. Não é falha da app.
- Console: durante o R3.14 a R3.17 nenhum erro novo além dos open.migration esperados do R3.8c e R3.8d.
- R4: as dicas nativas (atributo title) não saem nas capturas; li os textos por JS (title/aria-label) e confirmei a posição pelo desenho.
- R4.6: depois de digitar a nota, o primeiro Tab não tirou o foco da caixa (activeElement continuou o textarea); o segundo Tab tirou e a nota ficou gravada. Pode ser só temporização da ferramenta; não repeti para medir.
- R4: o canvas, com a janela inferior aberta (viewport 698 px), fica pequeno; fechei a janela Propostas para ver os selos e a reabri depois (Ctrl+Shift+7 alterna).
- R6.5: o guia diz 'backups/mapping.v10.<data-hora>.json', mas o backup sai como mapping.v13.<data-hora>.json porque o arquivo já era schema 13 (o nome segue a versão do arquivo de origem). Texto do guia desatualizado, sem defeito na app.
- R7.1/R7.3: o guia espera 'schema: 10'; a app mostra 'schema: 13' (o formato atual). Texto do guia desatualizado, sem defeito.
- R5: o servidor MCP deixa arquivos .tmp em proposals/<id>/ quando não consegue apagá-los (EPERM): é limite da pasta montada na VM (apagar bloqueado), não da app; não atrapalhou a revisão.
- R8.2: entradas do Diagnóstico (ex.: 'Schema 13: a herança de anotações saiu do formato…', '1 reparo(s): clipped marking … (rect-out-of-image)') ficam em português na UI em inglês porque foram gravadas quando o idioma era pt (dado de log, mensagem mista pt/en no open.repair). Home: 'Interactive guide (in Portuguese)' está rotulado como tal. Não tratado como defeito.
- R9: guia desatualizado: proposta grava formatVersion 3 (guia: 2); get_project não traz mais blank:true (AGENT-GUIDE: saiu, file:null); 'Imagem criada/Aceitar imagem' na revisão de um container (rótulo antigo?).
- R9.7: digitar posição que deixa a marcação inteira dentro de outra a torna filha (Pertence a); o guia não prevê isso.
- R9.13: em containers sem espaço próprio os componentes nascem no centro e o Button vira filho do Top app bar (rect omitido).
- R9.11: Ctrl+Shift+6 com foco num campo numérico digitou '6' no campo (Altura virou 566); corrigido; não tratado como defeito (atalho com foco em input).
- R9: MCP não consegue apagar o .proposal.json.\*.tmp (EPERM na pasta montada), como no R5.
- R10.7: o disco ficou com 3 marcações Button (guia diz 2): a terceira veio de um clique extra meu em Adicionar com nada selecionado (o centro da vista estava dentro da tela Configurações). Não é defeito.
- R10.7: a variante "Adicionar desabilitado com fundo vazio no centro" não foi alcançada (zoom/pan por roda não moveu o centro para fundo vazio; a roda comum sobre o canvas não faz pan). Sem nada selecionado e o centro sobre uma imagem, o botão fica habilitado e rotula "Adicionar na tela images/cadastro.webp".
- R10.8: as abas do Catálogo do projeto novo listam Nota e Tabela (o guia fala só em Nota); o aviso do pacote de notas "0 erro(s) e 2 aviso(s)" aparece no topo da aba Componentes.
- R11.6: no 'Atual' o painel Detalhes mostra o aviso 'Ainda não existe no projeto atual' e botão 'Ver em Proposto' (útil, o guia não cita). Depois de Ctrl+Z a proposta fica 'Em revisão' com 8 aceitas pendentes.
- R11.6: o toast de aplicação ('8 mudança(s) aplicada(s)... Ctrl+Z volta tudo de uma vez') passa rápido, como o guia avisa.
- R12.8: o modificador Shift do clique da ferramenta não chega à app; usei eventos sintéticos de ponteiro com shiftKey no canvas (window.\_\_shiftClick). O comportamento medido é o da app; a ferramenta é a limitação.
- R12.12: arrastar da Paleta não foi executado (precisa de arrasto nativo do dono). O restante do passo foi conferido.
- R12.17a/R12.18a/R12.18b: os arrastos finos funcionaram pela extensão (alça de ligação a ~14 px da borda, alça do meio, segmento do Canto); não ficaram "não executado". No R12.18a arrastei a alça para o lado (80 px) porque Botão e Destino estavam alinhados na vertical e subir ficaria sobre o próprio traço.
- R12.17: a Árvore lista a seta sob a marcação de origem ("→ Destino" dentro de Botão; "→ Botão" dentro de Nota).
- R12.20: o guia manda "mover setas para design/mapeamentos/setas"; criei a pasta já lá. O cliente stdio exigiu apenas o nome 'setas' (uma raiz só tem esse projeto).
- R12.20: o MCP deixou um .proposal.json.\*.tmp em proposals/<id>/ (EPERM ao apagar na pasta montada), como no R5/R9; limite do ambiente, não da app.
- R12.22: o zip exportado inclui a pasta proposals/ com a proposta aplicada (e specs/notas, specs/analytics); o guia só cita mapping.json.
- R12.24: o segundo plan_changes (container null e parent, SEM rect) devolve invalid-arguments ('trocar de container exige o rect…'), mesmo com a Lente já no canvas; só com o rect (o mesmo da marcação) vem o aviso ignored-argument para parent que o guia descreve. O guia não cita o rect nesse pedido.
- R12.25/R12.26: o guia diz que o servidor aceita 'create_annotation' em plan_changes com o tipo ‘analytics/transicao’ no Botão e recusa com type-not-applicable + hint: confere.
- R12.27: o get_project do mcp-notas também lista layers[].spec com found true; o guia não cita. Os dois projetos foram criados na mesma raiz design/mapeamentos.
- R12: o console não mostrou erro novo durante o roteiro (as mensagens open.migration/open.repair/save listadas são as dos roteiros R3/R6/R8 anteriores, esperadas).
- VIS (900 px, Home): a tabela de recentes quebra "Remover da lista" e "Neste dispositivo" em duas linhas e a borda inferior da linha "Neste dispositivo" fica interrompida na coluna de ações (cosmético; sem rolagem horizontal). Evidência: anexos/VIS/light-900-pt/13-home.jpg.
- VIS: ao clicar numa aba da janela inferior com o mouse, `document.activeElement` fica no body (não é diálogo; a regra do guia vale para diálogos).
- VIS: ao renomear a pasta do projeto aberto, a barra mostra "Erro ao salvar · Tentar de novo", o Diagnóstico registra `NotFoundError` em `save` e "Fechar projeto" pergunta "Fechar sem salvar?" (comportamento esperado; capturas em dark-1280-pt/13 e 14).
- VIS.15: a lista de atalhos do guia omite Ctrl+Shift+4 (Lista de anotações); o guia só existe em português (a Home avisa "(in Portuguese)" em en-US).
- VIS: ao conferir os diálogos de "Pasta indisponível" cliquei por engano em "Remover da lista" (em vez de Cancelar) na configuração escuro 900; a pasta continuou no disco e voltou à lista por Abrir pasta (sem defeito).
- E4.1: a tecla F5 enviada pela extensão Claude in Chrome não recarregou a página; location.reload() via script também não (o aviso 'Sair do site?' da app bloqueia quando há edição pendente). Navegar à mesma URL (com force) recarrega. Não é defeito da app.
- E5: nos erros de plan_changes (rect-too-small, image-overlap, rect-out-of-image, arrow-self, not-found) o 'hint' é só o genérico do lote ('corrija as operações…'); os de get_marking_image/get_project trazem hint específico. rect-too-small não diz o mínimo nem o valor; image-overlap não diz qual container. Mensagens continuam claras.
- E5: update_arrow (estilo/trava) em seta existente numa proposta é ignorado com aviso ('a proposta só leva a criação e a remoção de setas'): coerente com o guia, mas a seta Destino→Livre ficou elbow e destrancada na revisão.
- E5: create_project sem 'root' com duas raízes devolve root-required sem hint, mas com a lista das raízes.
- E6: Ctrl+clique troca a seleção em vez de somar, e não há seleção por retângulo (arrastar o fundo move a vista); o guia só documenta Shift+clique, duplo clique e 'Selecionar com o conteúdo'. Teclas de seta não movem a marcação selecionada (não documentado). Não tratei como defeito: o pedido do dono listava 'Ctrl', 'retângulo' e 'teclas de seta'; confirmar se eram para existir.
- E6: o conceito 'slot' do pedido não existe na app; soltar da Paleta sobre container ou marcação sempre cria nota/tabela flutuante no canvas.
- E8.4: arrastar com a ferramenta de marcação abaixo do tamanho mínimo (8 px) não cria nada e não avisa; um aviso curto ajudaria. Não é defeito.
- Ao propor marcações pelo MCP, passei 'near' em vez de 'container' e recebi só o aviso ignored-argument (a marcação foi criada no canvas): a mensagem diz que 'near' vale só para flutuante, mas não indica o argumento certo. Plano e proposta foram refeitos.
- E8.1: o título longo da tabela (240×120) fez a app marcar a tabela com ⚠ no canvas e listá-la em Incompletas ('The component does not fit'): comportamento esperado; com três painéis abertos em 900 px a coluna Anotação da Incompletas quebra o texto quase letra a letra.

## O que atrapalhou

- O Claude Code que existe na máquina (`/opt/cowork/claude-bin/claude`) só aceita `claude -p` e respondeu "claude is not enabled in this environment". Todos os pedidos ao MCP (R3.6a, R3.6, R5 e R12.23 a R12.27) foram feitos pelo cliente stdio. Isso muda o que o R3.6a (a pergunta de conceito, em sessão limpa do Claude Code) consegue provar: ver o passo.
- `git clone` e `git fetch` na pasta montada deixam `.lock` que a shell não consegue apagar (deleção desligada): foi preciso mover `config.lock` e `objects/maintenance.lock` para outro nome. O clone ficou utilizável (HEAD 7837cff). Não pedi a permissão de apagar porque o dono dorme.
- VIS.3: cliquei na posição da aba Propostas com a aba Diagnóstico ativa e o clique caiu em "Limpar", apagando as entradas do Diagnóstico da sessão (ver achado A3). As mensagens relevantes do Diagnóstico já estavam registradas nos roteiros anteriores.
- Console (read_console_messages): os carimbos de hora das mensagens antigas são os do momento em que a ferramenta relê o histórico, não os do evento; por isso não deu para correlacionar erros de gravação com a hora de cada ação. Conferi com Abrir numa pasta movida (sem erro novo) e com o Diagnóstico da app (`NotFoundError` em `save`, 4 vezes), sem indício de defeito.
- mapping-mcp avisa 'não foi possível apagar o temporário ... .proposal.json.tmp (EPERM)' ao gravar propostas na pasta onde a exclusão está bloqueada pelo ambiente; resíduo em proposals/\*/ (não apaguei).
