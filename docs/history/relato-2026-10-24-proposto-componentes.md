# Relato de teste — Mapping

- Modo: dirigido — fases PC1 e PC2 do épico `epic/proposto-componentes` (seção 11 do `docs/TESTING-COWORK.md`): R0 inteiro, R13.1 a R13.12, R4.1 a R4.11, R8.1b e R8.2; passada visual: Detalhes e Propostas. Não é "sem interação"; lista confirmada pelo dono na conversa.
- Build id: 70cc7ee · 2026-10-24 (igual ao esperado; conferido em Configurações › Sobre)
- Canal (como a app mostra): prévia (versão do formato 13; schema v13)
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`), já com o build esperado; nenhum Deploy foi disparado
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows 10/11 x64 (galaxy-book-ff)
- DPR e viewport: DPR 1; 1490 × 766 (janela restaurada, 1506 × 951 externo)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-24-proposto-componentes` (clone do branch em `repo/`, commit 70cc7ee)
- Ferramenta: agente com extensão do navegador (Claude in Chrome) e shell (`device_bash` numa VM com a pasta montada); dialog-pilot (versão não informada pela ferramenta); pedidos ao MCP: não usados (a rodada não precisa de MCP)
- Estado prévio do navegador: 1 projeto pré-existente na tela inicial: "Lab" (neste dispositivo, 24/10/2026 16:23, "Alterações não exportadas"); `preview:mapping.reviewResume` já tinha um registro `v: 2` com várias revisões vistas. Nada foi apagado.
- MCP: não usado
- Data: 2026-10-24 (sábado), noite
- Tempo por roteiro: R0 ~12 min; os demais não foram cronometrados

## Resumo

- Total de passos: 33 (R0 ×6: R0.1, R0.2, R0.3, R0.4a, R0.4b, R0.7; R13 ×12; R4 ×11; R8 ×2; Visual ×2)
- ✅: 29 · ⚠️ parcial: 4 (R13.8, R13.11, R8.2, Visual: Propostas) · ❌: 0
- Achados por severidade: crítica 0 · alta 0 · média 1 (R13.11) · baixa 3 (R13.8, R8.2, Visual: Propostas)
- Impede uso? Não
- Não executado: R8.1a (fora da lista da seção 11); passada estreita (`resize_window`); foco de janelas de ferramenta e o teclado completo do R4 na passada visual; o fim do R4.12/R4.13 (apagar a proposta), que não faz parte da lista dirigida

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 |  | ✅ | Sobre mostra `70cc7ee · 2026-10-24`, canal prévia; sem barra de rolagem horizontal; **Ver os atalhos de teclado** troca para a Ajuda; Esc fecha e o foco volta ao botão **Configurações** da lateral |
| R0.2 |  | ✅ | Seletor de pasta e permissão pelo `select_folder` (`permissionButton: "Permitir"`); campo "Nome do projeto" vazio (o nome da pasta é só placeholder); disco: `mapping.json` (schema 13, revision 0), `.gitignore` com `backups/`, `specs/notas/` (`notas.spec.json`, `components/nota.json`, `components/tabela.json`, `docs/nota.md`, `docs/tabela.md`); sem `images/` ainda |
| R0.3 |  | ✅ | `cadastro.png` (484 × 450) pelo `open_file`; marcação desenhada (X 56, Y 310, L 155, A 86); **Salvo**; fechar volta à tela inicial sem perguntar; `fumaca-web` nos recentes com o selo **Pasta**; disco: `images/cadastro.webp`, 1 container, 1 marcação, `revision` 2 |
| R0.4a |  | ✅ | F5 e **Abrir** na linha: abriu sem o seletor e **sem pedido de permissão** (a concedida pelo `select_folder` valeu) |
| R0.4b |  | ✅ | `resize_window(800, 700)` → `innerWidth` 784: só o aviso "Abra numa janela maior"; Delete apertado; alargado a 1506 × 951 o editor voltou com a marcação selecionada; disco: ainda 1 marcação, `revision` 2 |
| R0.7 |  | ✅ | Pasta renomeada pela shell para `fumaca-web-2` com o projeto fechado; **Abrir** → "Pasta indisponível" com o texto esperado → **Localizar pasta…** + `select_folder` → abriu; na lista, nome `fumaca-web` e embaixo `fumaca-web-2`; **Remover da lista** tirou a linha; disco intacto (1 container, 1 marcação, `images/cadastro.webp`, `specs/notas/`) |
| R13.1–R13.6 |  | ✅ | Conferidos na rodada (projeto Telas, proposta "Componentes novos", canvas e Detalhes conforme o guia) |
| R13.7 |  | ✅ | Inválido (Proposto): círculo com linha vermelha tracejada + ⚠; Detalhes com "Criada pela proposta", "Bloqueia aplicar" e caixa "Aplicar bloqueado… (rect-too-small)"; **Aplicar aceitas · 2** desabilitado (título "Aplicar bloqueado: o conjunto aceito é inválido  Ctrl+Enter"); barra "1 conjunto(s) inválido(s)" |
| R13.8 |  | ⚠️ parcial | Proposto: "Novo valor", selo ∿, Label "Novo valor" em Detalhes. Atual: "Antigo" ✅, mas **linha dupla cinza e selo ∿ continuam no desenho da Atual** (guia: "sem marca de alteração no desenho"). Medido: `data-canvas-markings=0` nas duas vistas |
| R13.9 |  | ✅ | Sem rótulo (Proposto): desenhado com o texto padrão "Label" (não espaço vazio), linha tracejada de criada + ⚠ âmbar; Detalhes "Incompleta: 1 pendência · Button · Label: obrigatório vazio"; Incompletas (2) lista Sem rótulo ("Label: obrigatório vazio") e também Inválido ("O componente não cabe"); Pendente não está lá |
| R13.10 |  | ✅ | Do pacote: Proposto com texto "Do pacote", tracejada e +; Atual: canvas vazio e Árvore só com Existente (banner "Ainda não existe no projeto atual"); Especializações lista só material3 (v1 · 1 camada); fechou com Esc |
| R13.11 |  | ⚠️ parcial | **Disco ✅:** `componentes/` com `mapping.json` sha256 `b103c3b5…f0fb6` (revision 0) idêntico antes e depois; `specs/` só tem `material3/`, sem `specs/m3novo/`; `proposal.json` (sha `afb02c31…`) inalterado, status `open`, decisões c4 aceita, c5 rejeitada, c12 rejeitada, c6 aceita; lista de 34 arquivos igual. Fluxo: Abrir pasta (`select_folder`) → botão **Continuar** (não "Revisar") → Atual/Proposto ×2 → cada marcação selecionada → Sair da revisão → "Sair mesmo assim" → Salvo. **Tela ⚠️:** Diagnóstico (`Ctrl+Shift+6`) mostra "Biblioteca: material3: 16 erro(s) e 2 aviso(s)" (`docs/m3-*.md` não encontrado), o guia espera nenhum erro |
| R13.12 |  | ✅ | English (US): menus em inglês; **Continue** → "The review is back where you left off."; legenda (Mark legend) traz "Rejected: dotted and faded, ✕ badge" e "Invalid: red dashed line and ⚠ (blocks Apply)", sem "(Current only)" e sem português; `data-components=6`; voltei para Português (Brasil) e a legenda reapareceu em português |
| R4.1 |  | ✅ | `open_file` com o zip: projeto Loja Neste dispositivo, status "1 proposta(s) nova(s)", Propostas com "Checkout a partir do Figma" **Nova** e botão **Revisar** (11 sem decisão) |
| R4.2 |  | ✅ | Cabeçalho renomeado para `Topo` pelo campo Nome em Detalhes (Enter). Revisar → "Somente leitura" nas duas barras; lista com selos; Árvore sem Banner promoção na Proposto; Detalhes "Marcação alterada" + ⚠ no Nome; o marcador abre quadro com Atual `Topo`, Antes `Cabeçalho`, Depois `Cabeçalho do checkout`, **Sobrescrever** / **Manter atual** |
| R4.3 |  | ✅ | Proposto: Confirmação e Campo Cupom (tracejado), Banner hachurado com selo −; selo + do Campo Cupom só aparece em 85% (não em 28% nem 54%); Atual: sem Confirmação nem Campo Cupom, Banner hachurado, Árvore com `Topo` |
| R4.4 |  | ✅ | Botão Pagar: aviso "Item trancado" com o texto do guia; títulos lidos no DOM: selo e cadeado da linha "Item trancado: aceitar é permitido e a trava continua"; cadeado da Árvore desabilitado, título "Destrancar Botão Pagar" (os tooltips não saem em screenshot) |
| R4.5 |  | ✅ | Quadro do **+** do Nome ("Faz parte da criação da marcação: decida no cabeçalho, acima."); Esc devolveu o foco ao marcador; `R` rejeitou: "1 mudança(s) rejeitada(s) junto: Anotação Input criada" + Desfazer, "sugerida numa rejeição", Campo Cupom segue selecionado e sai da Árvore; ✓ na Input → "2 aceitas, 0 rejeitadas, 0 sem decisão" |
| R4.6 |  | ✅ | Aceitar Confirmação → 4 aceitas; Árvore mostra `Cabeçalho do checkout` na Proposto; Rejeitar marcação → `Topo`; nota gravada no item; proposta **Parcial: 4 aceitas, 1 rejeitadas, 6 sem decisão**; **Aplicar aceitas · 4**. O primeiro `Tab` não tirou o foco do campo da nota (o segundo tirou) |
| R4.7 |  | ✅ | "4 mudança(s) aplicada(s). Desfazer (Ctrl+Z) volta tudo de uma vez."; Sair da revisão sem lembrete; "Somente leitura" some; Árvore com Confirmação, Campo Cupom, Topo e Banner promoção |
| R4.8 |  | ✅ | `Ctrl+Z` único tirou Confirmação e Campo Cupom; `Ctrl+Shift+Z` trouxe de volta |
| R4.9 |  | ✅ | Continuar; Banner promoção na Atual → **Aceitar remoção**; Propostas "1 aceita aguardando aplicação"; Fechar projeto sem lembrete; reabri a linha Loja → Continuar: "A revisão voltou ao ponto onde você parou.", decisões e nota preservadas; Sair da revisão → lembrete com "1 aceita(s) aguardando aplicação" e **Aplicar agora · 1** / **Sair mesmo assim** / **Continuar revisando**; revisão continua aberta |
| R4.10 |  | ✅ | Exportar › Baixar (`save_file` → `Loja-R4.10.zip`, 15,8 KB), descompactado em `zip-R4.10/`: `proposals/checkout-figma/proposal.json` (status `open`, decisões c6/c10/c3/c7/c8 aceitas e c4 rejeitada, nota "O nome antigo do cabeçalho estava certo." no item M1) e `proposals/checkout-figma/images/carrinho-v2.png`. Abrir zip → Propostas mostra as mesmas decisões (5 sem decisão · 5 aceitas · 1 rejeitada); Continuar → Topo com a nota preservada. Diagnóstico: "Nenhum erro registrado" (sem `drawImage`) |
| R4.11 |  | ✅ | Pasta `loja` (mapping.json sha `7c0ed0d4…faf4b5`, revision 0) aberta com `select_folder`; Revisar; Aceitar Confirmação → "2 mudança(s) aceita(s)" (imagem e Mensagem de sucesso); Cabeçalho sem conflito, nome `Cabeçalho do checkout` na Proposto; Rejeitar marcação; Sair da revisão › Sair mesmo assim; linha da proposta "2 aceitas aguardando aplicação". **Disco:** `proposal.json` status `open` com c3 e c7 aceitas e c4 rejeitada; `mapping.json` com o mesmo sha e revision 0; lista de 6 arquivos igual à de antes |
| R8.1b |  | ✅ | Tema Escuro (já era o ativo): Loja deste dispositivo (linha do R4.1) → Abrir → Propostas › Continuar ("A revisão voltou ao ponto onde você parou."); "Somente leitura"; alternei Atual/Proposto; Botão Pagar com cadeado, selo Trancado e os avisos do R4.4 legíveis; Banner hachurado; Confirmação e Campo Cupom nas duas visões; Cabeçalho = `Topo` com conflito |
| R8.2 |  | ⚠️ parcial | English (US): menus, barras, lista da revisão, lembrete "Exit the review?" (Keep reviewing / Exit anyway / Apply now · 1), Detalhes e dicas todos em inglês; retomada com **Continue**; varredura por regex de palavras em português no texto visível e em title/aria-label/placeholder não achou nada. **Achado baixo:** cabeçalho de coluna oculto (`visually-hidden`) "Mudança" na grade Key/Value das anotações em Detalhes continua em português. Voltei para Português (Brasil). **R8.1a não executado:** fora da lista da seção 11 (que só pede a parte de revisão do R8.2) |
| Visual: Detalhes |  | ✅ | Na revisão, nos temas claro e escuro e nas visões Atual/Proposto: cabeçalho do item, marcador ⚠ com o quadro Atual/Antes/Depois (**Sobrescrever** / **Manter atual** / Limpar), aviso "Item trancado", "Outras mudanças" e Detalhes da marca de decisão legíveis, sem sobreposição; nenhuma barra horizontal em Detalhes (medido por `scrollWidth`). Único texto sem tradução: "Mudança" oculto em inglês (achado do R8.2). Foco: após Esc nas Configurações volta ao botão Configurações |
| Visual: Propostas |  | ⚠️ | Lista, filtros, menu ⋯ da linha e diálogo "Apagar proposta?" legíveis nos dois temas, sem barra horizontal; o diálogo abriu com foco em **Cancelar**; **Esc** e **Cancelar** (mouse) devolveram o foco ao botão "Ações da proposta: Checkout a partir do Figma" (nunca ao `body`). **Texto cortado:** com Detalhes aberto, linhas da lista da revisão como "images/carrinho.png (390 × 844 px) → images/carrinho-v2.png", "Mensagem de sucesso · x 95 · y 220 · l 200 · a 200" e "estilo: primary → estilo: secondary" ficam com reticências sem `title` (scrollWidth 520/352/246 > 232) |

## Achados

- **Média — R13.11:** ao abrir a pasta descompactada do `proposta-componentes.zip`, o Diagnóstico (`Ctrl+Shift+6`) lista "Biblioteca: material3: 16 erro(s) e 2 aviso(s)" (`docs/m3-*.md` não encontrado), e o guia espera nenhum erro. Não impede o uso; provavelmente faltam os `docs/` no zip de teste ou o texto do guia está desatualizado.
- **Baixa — R13.8:** na vista Atual do Existente alterado o desenho mantém a linha dupla e o selo ∿, e o guia diz "sem marca de alteração no desenho". Pode ser texto do guia desatualizado.
- **Baixa — Visual: Propostas:** texto cortado com reticências e sem dica (`title`) em linhas da lista da revisão quando o Detalhes está aberto (exemplos no passo).
- **Baixa — R8.2:** em English (US), a grade Key/Value das anotações em Detalhes tem o cabeçalho de coluna oculto (leitor de tela) "Mudança" sem tradução.

## Regressões fora do alvo

- Nenhuma encontrada. Fora da lista: a Árvore tem barra horizontal de 4 px (`scrollWidth` 274 > 270) nas capturas medidas.

## Observações (sem severidade)

- Ao abrir o editor pela primeira vez o Catálogo mostrou "0 erro(s) e 7 aviso(s) no pacote" e, instantes depois e nas aberturas seguintes, "2 aviso(s)" (avisos de tamanho mínimo da `nota` na biblioteca `notas` embutida). Número instável nos primeiros segundos; sem efeito no teste.
- O painel **Catálogo** vem aberto à esquerda ao criar o projeto.
- R13.9: o guia fala em "espaço vazio ou nó desconhecido"; o app desenha o texto padrão "Label". Incompletas lista também o Inválido (motivo "O componente não cabe").
- R13.11: o guia diz **Revisar**, o botão aparece como **Continuar** (a proposta já tem decisões); o guia cita decisões "aceita, rejeitada, aceita", o arquivo tem 4 (aceita, rejeitada, rejeitada, aceita), coerente com 2 aceitas · 2 rejeitadas na barra.
- R4.6: o primeiro `Tab` não tirou o foco do campo da nota (o segundo tirou); a nota foi gravada mesmo assim.
- R4.4: dicas (`title`) não aparecem em captura de tela; foram lidas no DOM.
- Passada visual: o foco ao fechar janelas de ferramenta (Árvore, Detalhes, abas da janela inferior) não foi medido; o teclado do R4 (`Tab` até o marcador, `A`, `Backspace`, setas) também não, só `R`, `Esc` e `Tab`.

## O que atrapalhou

- O prompt chamava a "seção 11 deste prompt", que só existe no branch `epic/proposto-componentes`; os clones antigos de `~/mapping-testes` não a tinham (o mais recente era o 78ee8ef). O branch foi clonado na nuvem e trazido pela VM com `git fetch --depth 1` por URL; o checkout deixou avisos de `unlink` (deleção desligada na pasta montada), sem efeito.
