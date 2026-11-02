# Relato de teste — Mapping

- Modo: dirigido pelas fases do plano — seção 13 do `docs/TESTING-COWORK.md` (etapa Exemplos enxutos, EX1 a EX3), depois do R0 inteiro e do R1 inteiro (a lista pede o R1 antes do R3)
- Alvo: PR #273 (`epic/exemplos-enxutos` → `main`)
- Build id: 36f7215 · 2026-11-02 (esperado: 36f7215 · 2026-11-02; confere)
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`). Ao abrir, o preview estava com `11d9b65 · 2026-11-01`; a faixa **Atualizar** trouxe o `36f7215`. Não foi preciso disparar o Deploy.
- Navegador e versão: Chrome 156.0.0.0 (extensão Claude in Chrome; aba "Mapping" aberta pelo link clicado)
- Sistema operacional: Windows (x64), computador `galaxy-book-ff`
- DPR e viewport: DPR 1,1; 1440 × 650; tema escuro, pt-BR
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-11-01-exemplos-enxutos\` (repo em `repo/` no commit `36f7215`; `material3-compose/` com 105 arquivos)
- Passada visual pedida: Catálogo, Especializações, Privacidade
- Estado prévio do navegador: Privacidade com 0 origens permitidas; 18 projetos em **Projetos recentes** (`vazio`, `telas`, `principal`, `Tela M3`, `Variantes`, `remotas`×2, `Loja`×3, `Sugestões Kotlin`, `espaco`, `principal`, `Telas`×2, `Lab`…); `preview:mapping.reviewResume` preenchido (v2, com itens em `seen`). Nada foi apagado.
- Data: 2026-11-01

## Tempo por roteiro

Não cronometrado por roteiro. Rodada inteira ≈ 1 h 20 min (≈ 21:30 a 22:50, horário local), com o R15 (servidor local) e o R13 sendo os mais longos.

## Ferramenta

- Chrome pela extensão Claude in Chrome (nunca o painel do app); dialog-pilot para `select_folder`, `open_file` e `save_file`.
- MCP por stdio: `mapping-mcp.js` 0.12.0 gerado localmente do clone no commit `36f7215` (`npm run build:mcp`), cliente `client.mjs` na shell da nuvem.
- Servidor de imagens do R15: Node no computador do Chrome, subido pelo `iniciar-servidor.cmd` com duplo clique pelo controle do computador (Explorer em nível "clique").

## Resumo

**Falhas e pendências primeiro**

- 🟡 **R15.9** (Diagnóstico): com os interruptores http e rede local ligados e o servidor sem CORS, o pedido acontece (1 linha nova no `servidor.log`) mas o Diagnóstico segue mostrando "endereço não aceito" para a URL e **não** mostra "não carregou". Detalhe em Achados (A1).
- 🟡 **Valor da URL com `\n` no fim** ao confirmar o campo com Enter (A2).
- ⏭️ **Não executado:** R1.7–R1.24, R9.13–R9.20 (incl. R9.16 e R9.17), R8.1b e a repetição em inglês do R8.1a/R8.1b.
- 🟡 **Parciais:** R9.9 (arraste da alça), R9.10 (Ocultar e centralizar), R10.7 (variantes do canvas e fora da vista), R12.12 (arrastar da Paleta, disco, "uma entrada de desfazer", borda tracejada), R8.1a (`Teste R8`), R8.2.
- Passos terminados "não executado (precisa do dono)": o arraste da Paleta (R12.12) e o R8.1b.

**Totais:** 76 linhas de passo: 68 ✅ (3 delas marcadas "parcial"), 4 🟡, 4 ⏭️ (R1.7–R1.24, R9.13–R9.20, R9.16/R9.17 e R8.1b). Achados de produto: 0 graves, 2 médios/baixos (A1, A2). Nada aqui impede o uso com pessoas; as portas de segurança do R15 (consentimento por origem, política de URL, interruptores, imagem nunca gravada) passaram.

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1 | | ✅ | Sobre com `36f7215 · 2026-11-02`, sem barra horizontal; **Ver os atalhos de teclado** trocou por Ajuda (Atalhos); Esc fechou e o foco ficou no botão **Configurações** da lateral. |
| R0.2 | | ✅ | `fumaca-web` por `select_folder` (`permissionButton: "Permitir"`); campo "Nome do projeto" vazio (só placeholder). Disco: `mapping.json` (revision 0), `.gitignore` (`backups/`), `specs/notas/` completo. |
| R0.3 | | ✅ | `cadastro.png` (484 × 450) por `open_file`; `images/cadastro.webp`; 1 container, 1 marcação (37,145 · 361 × 200), `revision` 2. Fechar voltou à tela inicial, `fumaca-web` no topo com **Pasta**. |
| R0.4a | | ✅ | F5, **Abrir**: abriu sem seletor e sem pedido de permissão. A aba não caiu. |
| R0.4b | | ✅ | A 634 px só o aviso "Abra numa janela maior"; Delete a essa largura não excluiu: ao alargar, o editor voltou com a marcação selecionada; disco com 1 marcação. |
| R0.7 | | ✅ | Pasta renomeada para `fumaca-web-2`; aviso **Pasta indisponível** (texto do guia); **Localizar pasta…** + `select_folder`; linha `fumaca-web` / `fumaca-web-2`; **Remover da lista** tirou a linha. Disco intacto. |
| R1.1 | | ✅ | Projeto `principal` criado; `cadastro.webp`; container 484 × 450. |
| R1.2 | | ✅ | Camada `Model` gravada em disco. |
| R1.3 | | ✅ | SDUI aplicado (3 camadas) e Modelo de dados (2 camadas); `specs/sdui.json` e `specs/modelo-dados.json`; 3 especializações (`notas`, `sdui`, `modelo-dados`); 8 camadas. |
| R1.4 | | ✅ | Nome da camada de especialização desabilitado com tooltip "Camada de especialização: não pode ser renomeada nem excluída. Só dá para remover a especialização."; **Excluir camada** desabilitado; Esc devolve o foco ao ⋮; cor de Componentes mudou `#1E88E5` → `#D32F2F`. |
| R1.5 | | ✅ | "Nada a fazer": "SDUI já está no projeto na versão 3. O arquivo é a versão 3; só versões maiores atualizam." |
| R1.6 | | ✅ | 6 marcações: Formulário (19,121 · 409×288); Nome, Idade, E-mail, Cadastrar filhos de Formulário; Título na raiz. |
| R1.6a | | ✅ | Marcação cobrindo tudo (4,4 · 480×446) adotou Formulário e Título como filhos; clique no rótulo do nome selecionou o container; desfazer restaurou a árvore. |
| R1.7–R1.24 | | ⏭️ não executado | Não são pré-requisito dos passos da lista da seção 13. |
| R3.10 | | ✅ | Pasta `material3-compose`: "v1 · 50 tipo(s) · 50 componente(s) · 50 documento(s) · 2 fonte(s)", 0 erro(s) e 0 aviso(s); "3 camada(s) criada(s)"; disco com 50 components, 50 docs, 4 arquivos em fonts; sem `specs/material3-compose.json`. |
| R3.11 | | ✅ | Sem seção Biblioteca no Diagnóstico; "Nenhum erro registrado." |
| R3.12 | | ✅ | Remover com "Converter em camadas livres"; `specs/material3-compose/` sumiu; zip com conteúdo na raiz e zip com pasta-raiz deram a mesma janela (0/0) e disco idêntico ao pacote (md5 igual). |
| R3.13 | | ✅ | Zip sem `components/button.json`: erro "arquivo não encontrado: components/button.json" em `layers[2].annotationTypes[1].component`; Aplicar desabilitado; projeto intacto. `.json` solto recusado ("Arquivo de especialização inválido"). |
| R3.14 | | ✅ | v2: "Atualização aditiva: os dados ficam como estão."; 0 erros e 1 aviso (campo `note`); linha v2; FAB manteve `containerColor: secondary`. |
| R3.15 | | ✅ | v3: "Renomear o campo containerColor → tone em fab", 1 anotação, 1 valor; depois `tone=secondary`, `note=teste`, linha v3, sem `containerColor` no disco; Desfazer voltou a v2 com `containerColor` (inclusive `specs/`); refeito até v3. |
| R3.16 | | ✅ | v4: "Remover o campo note em fab", aviso "Esta atualização apaga 1 valor(es) e 0 anotação(ões)", perda `note`="teste"; depois Detalhes sem Nota, disco sem `note`, spec v4; Desfazer trouxe Nota=teste e spec v3; refeito até v4. |
| R3.17 | | ✅ | v5: erro "o tipo \"badge\" foi removido; declare um passo \"remove-type\" ou \"rename-type\" em migrations"; "Esta atualização não pode ser aplicada: faltam migrações declaradas para estas quebras."; 1 erro e 2 avisos (`components/badge.json`, `docs/badge.md` órfãos); Atualizar desabilitado; Cancelar deixou disco em v4, 50 componentes. |
| R9.1 | | ✅ | `telas` em pasta nova; Aplicar pasta: 0 erros e 0 avisos, "Material 3 (Compose) aplicada: 3 camada(s) criada(s)"; disco com `components/` (50), `docs/` (50) e `fonts/` (2 woff2 + LEIA-ME + LICENSE). |
| R9.2 | | ✅ | Nome vazio: "Dê um nome ao container."; lista: Personalizado, Tamanho da seleção e, sob Material 3 (Compose), Celular 360×800, Celular grande 412×915, Tablet 800×1280, Desktop 1440×900; container `Configurações` branco e selecionado. (Estado desabilitado de "Tamanho da seleção" conferido no R9.17.) |
| R9.3 | | ✅ | 50 tipos nas camadas Layout, Conteúdo e Componentes, mais Nota e Tabela em Notas; Button 136 × 40, Row 380 × 48; os tipos com slot com selo Container; botões habilitados. **Roteiro:** o botão se chama "Adicionar na tela Configurações" (ou "Adicionar dentro de Row", "Adicionar no canvas"), não só "Adicionar". |
| R9.4 | | ✅ | Top app bar (360×64) em X 0/Y 0; Row em Y 100; ambos desenhados. A anotação do Row fica na camada **Layout** (a do Top app bar na Componentes), não as duas em "Componentes" como o texto do roteiro diz. O filtro "Ocultar sem anotação" não foi exercitado aqui. |
| R9.5 | | ✅ | Dois Buttons dentro do Row (Pertence a = Row), lado a lado, desenhados "Salvar". |
| R9.6 | | ✅ | Espaçamento 8; Alt+Shift+A: "Arrumado", botões 87 px em x 0 e 95 (8 de espaço); Ctrl+Z voltou os dois botões numa ação (136/144), Ctrl+Shift+Z arrumou de novo; botão Arrumar e menu do canvas: "Nada a arrumar". **Roteiro:** com o foco num campo de texto, Alt+Shift+A digita "a" no campo; é preciso tirar o foco do campo antes. |
| R9.7 | | ✅ | Text field (X 40, Y 220) e Button (X 120, Y 340); Row "2 de 4"; Mover para a frente: "3 de 4" e a Árvore acompanhou. **Roteiro:** com o Button em X 80/Y 230 (inteiro dentro do campo) ele virou filho do Text field ("Pertence a Text field", Ordem 1 de 1), e não dá para comparar frente/atrás; cruzando a borda (Y 205) ele volta a ser irmão e Mover para trás (2 de 4) o põe atrás do campo. |
| R9.8 | | ✅ | Rótulo "Confirmar compra" na hora; Ctrl+Z volta "Salvar", Ctrl+Shift+Z volta "Confirmar compra"; Arrumar de novo: botão com 162 de largura e o outro em x 170 (8 de espaço). |
| R9.9 | | ✅ (parcial) | Digitando `10` a Largura voltou para 58; no outro botão `5` → 58. O caminho do arraste da alça não foi executado. |
| R9.10 | | ✅ (parcial) | Com a opção desligada o Button sobre a foto fica só o contorno (sem desenho); ligada, "Salvar" desenhado sobre a foto; desligada de novo; nada no `mapping.json`. O teste com "Ocultar" e camada ativa sem anotação não foi feito; "centralizar" a imagem também não. |
| R9.11 | | ✅ | Text field: `80` e `30` viram 280 × 56. Diagnóstico › Componentes: sem Roboto "ausente" e sem componente que não carregou; só "Avisos do desenho" dos 2 botões de 58 px ("conteúdo maior que a caixa"). **Roteiro:** Ctrl+Shift+6 com o foco no campo digita "6" nele (foi preciso corrigir). |
| R9.12 | | ✅ | Fechar e reabrir: mesmo desenho. Disco (da pasta): `schemaVersion` 13, container `Configurações` com `file: null` e `background: "#FFFFFF"`, foto com `background: null`, marcações com `rect`/`parentId`, anotações com `values`; sem cena, fonte ou cor calculada; `images/` só com `cadastro.webp`. O Exportar › Baixar não foi usado: li a pasta. |
| R9.12a | | ✅ | Alt+H: componentes continuam desenhados, bordas e seleção somem; Alt+H volta. |
| R9.13–R9.20 | | ⏭️ não executado | Usam o MCP (stdio) e não estão na lista da seção 13. |
| R9.16, R9.17 | | ⏭️ não executado | Fora da lista (R9.17 só confere "Tamanho da seleção"). |
| R10.1 | | ✅ | Tela "Catálogo da biblioteca": título "Material 3 (Compose)", "versão 1", 50 componentes (Layout 11, Conteúdo 3, Componentes 36) com tamanhos; o Scaffold aberto. **Roteiro:** a linha de validação diz "Pacote válido, sem erros nem avisos.", não "0 erro(s) e 0 aviso(s) no pacote.". Disco intacto (md5 do pacote igual). |
| R10.2 | | ✅ | `chip`: Chip, LazyRow e FlowRow; `zzz`: "Nenhum componente encontrado."; vazio: 50. Setas movem o foco entre os itens sem rolar; Enter abre o item focado e o marca. |
| R10.3 | | ✅ | Button: Documento, Campos/Propriedades (7 linhas), Compose com `androidx.compose.material3.Button`, `Button.kt` e variantes por Estilo, "Nenhuma origem declarada para este componente.", Galeria (Prévia, Preenchido, Contornado, Com ícone) desenhada, Experimentar. O Documento já traz uma tabela "Campos" e a página outra "Propriedades". |
| R10.4 | | ✅ | Rótulo `Confirmar compra` e Estilo `outlined`: Largura 87 → 162, botão contornado com o texto inteiro; `1000` → 272, `10` → 58, `500` → 80, `5` → 40, dica "Largura acompanha o conteúdo" some; Restaurar valores: 87/40, `Salvar`, `filled`, dica de volta. |
| R10.5 | | ✅ | `mat-link`: "Ir para o Chip" abre o Chip no topo; "Destino que não existe": "Destino não encontrado: mapping://nao-existe" visível no alto, sem navegar; `<b>negrito em HTML</b>` literal e imagem só como texto "imagem". |
| R10.6 | | ✅ | Tela inicial com a lista de recentes idêntica à de antes (texto igual); pasta do pacote sem arquivo novo nem alterado (md5 igual); nenhum `mapping.json` na biblioteca. |
| R10.7 | | ✅ (parcial) | Aba Componentes com seletor Biblioteca (Notas, Material 3 (Compose)) e 50 componentes; Button abre em diálogo; **Adicionar à tela** coloca um botão em `Configurações` e o diálogo **continua aberto** (fechei com Fechar); Paleta adicionou outro. Disco: 2 marcações com anotação `button`. Observações: a Paleta com o primeiro Button selecionado criou o novo **dentro** dele (Pertence a Button, mesmo rect), porque cai inteiro na geometria; sem seleção e com o centro da vista sobre uma imagem, o destino foi essa imagem, não o canvas. As variantes canvas/tela fora de vista não foram executadas. |
| R10.8 | | ✅ | Projeto `vazio-r10` (já existia um `vazio` do dono, não mexi): as duas abas listam Nota e Tabela; remoção de Notas com "Nenhuma anotação será afetada." (só aparece depois de escolher Apagar dados); depois, "Nenhuma biblioteca com componentes aplicada." com **Abrir Especializações**, que abre o diálogo sem especialização. |
| R10.9 | | ✅ | Lista só com Personalizado e Tamanho da seleção (desabilitado); `Livre` 500 × 300 `#CCCCCC` selecionado. |
| R10.10 | | ✅ | "SDUI do backend", versão 2, "Pacote válido, sem erros nem avisos."; Interface: Column, Button, FAB, Bottom sheet, Scrim (5) e, sob API, Endpoint na lista; Button: Origens `sdui`/`Button` e `figma`/`DS/Button 3f2a9c`, Propriedades `label`, `variant`, `mode`, `disabled`, Galeria Prévia, Padrão, Link e **Do sistema externo** desenhadas; Column com `sdui` `(slot content)`; FAB sem erro. |
| R10.11 | | ✅ | Por stdio (`mapping-mcp.js` 0.12.0 gerado do clone, `--root` numa cópia `sdui-backend-lib`): `validate_library` → `valid: true`, `summary` nível 3 (6 tipos, 5 componentes, 6 documentos, 11 exemplos, 0 fontes), `spec` com `origins: 1` e `migrations: 1`, `errors` e `warnings` vazios; md5 da pasta igual antes e depois. |
| R12.12 | | 🟡 | Projeto `vazio-r10` (só no dispositivo, disco não lido). Containers A, B, C criados. Catálogo › Paleta com Box e Button: clique no fundo de A → "Adicionar na tela A" (Box); com Box selecionado → "Adicionar dentro de Box" (Button filho); com B selecionado → "Adicionar na tela B" (Button no centro 112,380, sem pai); vista enquadrada numa área vazia → "Adicionar no canvas" (Button "Em Canvas", rect 3202,1189, sem pai). Árvore: Canvas › Button; A › Box › Button; B › Button. Não executado (precisa do dono): arrastar da Paleta, leitura do disco, "uma entrada de desfazer por adição", borda tracejada. |
| R13.1 | | ✅ | Projeto "Telas" aberto por zip; Propostas "Em revisão" (13 sem decisão, 2 aceitas, 2 rejeitadas); **Continuar** abre a revisão com Proposto ativo e "Somente leitura". |
| R13.2 | | ✅ | `data-components` 6 (Proposto) / 1 (Atual) / 6 (Proposto de novo). |
| R13.3 | | ✅ | Pendente: rótulo "Pendente", linha tracejada, selo +, "Criada pela proposta", "Marcação criada 0 aceitas, 0 rejeitadas, 2 sem decisão". |
| R13.4 | | ✅ | Aceito idêntico ao Pendente no canvas; Detalhes "1 aceitas…". |
| R13.5 | | ✅ | Rejeitado fora da árvore; no canvas só o fantasma pontilhado com ✕. Legenda: "Rejeitada: pontilhada e esmaecida, selo ✕" e "Inválida: tracejada vermelha e ⚠ (bloqueia Aplicar)". |
| R13.6 | | ✅ | Atual e Proposto mantêm o fantasma; nada além. |
| R13.7 | | ✅ | Inválido com ⚠ e "Bloqueia aplicar"; "Aplicar aceitas · 2" desabilitado (tooltip "Aplicar bloqueado: o conjunto aceito é inválido  Ctrl+Enter"); Detalhes: `rect-too-small`. |
| R13.8 | | ✅ | Existente: "Novo valor" (Proposto) / "Antigo" (Atual), selo ∿. Valor do Rótulo em Detalhes não conferido. |
| R13.9 | | ✅ | "Sem rótulo" desenhado como "Label" com ⚠ tracejado; Incompletas lista Inválido ("O componente não cabe") e Sem rótulo ("Rótulo: obrigatório vazio"), não Pendente. |
| R13.10 | | ✅ | "Do pacote" com +; Atual mostra 1 componente; Especializações lista só material3-compose (m3novo ausente). |
| R13.11 | | ✅ | Pasta descompactada em `componentes/`; alternei Atual/Proposto 2×, selecionei cada marcação, **Sair da revisão › Sair mesmo assim**. sha256 dos 212 arquivos idêntico antes/depois (sem `specs/m3novo/`, `mapping.json` e `proposal.json` inalterados, status `open`). Diagnóstico: "Nenhum erro registrado." |
| R13.12 | | ✅ | English (US): legenda "Rejected: dotted and faded, ✕ badge" e "Invalid: red dashed line and ⚠ (blocks Apply)", sem "(Current only)" nem português; fantasma presente, count 6 (com zoom 175% o count cai a 5 por corte de viewport — medido; no enquadrar tudo volta a 6). Idioma e tema restaurados (Português, Escuro). |
| R15.1 | | ✅ | Pasta `servidor-imagens` com `servidor-imagens.mjs`, `foto.png` e `iniciar-servidor.cmd`; duplo clique pelo controle do computador (Explorer, nível clique). `http://127.0.0.1:8765/foto.png` abriu a imagem 96×96 no Chrome; `servidor.log` com 1 linha `GET /foto.png origin=none`. O `curl` ao Pages foi barrado pelo proxy da shell (403 `blocked-by-allowlist`), como o guia prevê; a imagem do Pages é provada no R15.4. |
| R15.2 | | ✅ | Projeto `remotas` em pasta, Material 3 aplicado, container Tela 360×800 `#FFFFFF`, Image pela Paleta ("Adicionar na tela Tela"), Descrição `Ana`, Escala `Crop`, URL apagada. Antes de apagar, faixa "Este projeto tem imagens de https://example.com". Depois: sem faixa, `data-component-images` 0, Incompletas com "URL da imagem: obrigatório vazio", Privacidade "Nenhuma origem permitida neste navegador." com os 4 interruptores desligados. Disco: `contentDescription` `Ana`, `contentScale` `Crop`, `url` `null`. |
| R15.3 | | ✅ | URL do Pages digitada: faixa "Este projeto tem imagens de https://fabianofranca.github.io…" com Agora não / Permitir estas; `data-component-images` 0; 0 pedidos a `foto.png` (`performance`); Diagnóstico › Imagens remotas lista a URL com "origem sem permissão" (e também `https://example.com/foto.jpg`, o valor de prévia). |
| R15.4 | | ✅ | Permitir estas: faixa some, foto de 4 quadrantes no Image (Crop), `data-component-images` 1, 1 pedido. Privacidade lista `https://fabianofranca.github.io`; Sobre: "Imagens remotas: 1 origens permitidas neste navegador". |
| R15.5 | | ✅ | **Exportar › Baixar** (`save_file` no diálogo do Chrome): zip de 272 KB com `mapping.json` e `specs/…`, 0 PNG. Pasta: sem `images/`, sem `.png`; `mapping.json` guarda só a URL. Projeto reaberto pelos recentes: foto sem faixa, `data-component-images` 1. |
| R15.6 | | ✅ | Revogar: "Nenhuma origem permitida neste navegador."; `data-component-images` 0; faixa de volta com a origem. |
| R15.7 | | ✅ | `http://127.0.0.1:8765/foto.png`, `https://192.168.0.10/foto.png` e `isto não é um endereço`: reservado, sem faixa, `servidor.log` continua com 1 linha. Diagnóstico: "endereço não aceito" para cada URL. |
| R15.8 | | ✅ | Interruptores http e rede local ligados: faixa "…imagens de http://127.0.0.1:8765 (sem criptografia, rede local)…"; `servidor.log` ainda com 1 linha. |
| R15.9 | | 🟡 | Permitir estas: `data-component-images` 0 e **um** pedido novo (2 linhas; a nova com `origin=https://fabianofranca.github.io`), sem nova tentativa. **Falha parcial:** o Diagnóstico segue mostrando "endereço não aceito" (a razão do R15.7, a mesma URL) e **não** mostra "não carregou" (ver Achados). |
| R15.10 | | ✅ | "Mostrar imagens de servidores sem CORS" ligado: `data-component-images` 1 e **um** pedido novo (3 linhas; `origin=none`). Desligado: `data-component-images` 0, sem pedido novo. |
| R15.11 | | ✅ | Pages com "qualquer origem" ligado: foto sem faixa (`data-component-images` 1). `http://localhost:8765/foto.png`: faixa "(sem criptografia, rede local)"; Agora não esconde a faixa, `data-component-images` 0, `servidor.log` ainda com 3 linhas. Privacidade lista `http://127.0.0.1:8765` e não `localhost`. |
| R15.12 | | ✅ | Quatro interruptores desligados e origens revogadas (Privacidade igual ao estado inicial: nenhuma origem, 4 desligados); projeto fechado; `/parar` mostrou "parado" e `http://127.0.0.1:8765/foto.png` passou a "conexão recusada". |
| R8.1a | | 🟡 | Tema escuro foi o tema de toda a rodada e tudo ficou legível (Catálogo, Especializações, Privacidade, revisão do R13 com selos, legenda e Detalhes). Tema claro conferido nas três janelas (sem corte, sem barra horizontal; Esc devolve o foco ao botão que abriu: Configurações, Especializações). **Não executado:** a marcação `Teste R8` no `principal` e a User do Formulário (fora da lista desta etapa). |
| R8.1b | | ⏭️ | **Não executado (precisa do dono).** Exige a revisão da Loja do R4 em "Neste dispositivo", que é dado do dono; retomá-la mexeria no `reviewResume` dele. A revisão do R13 (Proposto, Atual, legenda, selos) foi vista em escuro e em inglês. |
| R8.2 | | 🟡 | English (US): sem português na interface de Configurações (incl. Privacidade), Especializações, Catálogo (Componentes e Paleta), Diagnóstico › Remote images e legenda da revisão ("Rejected: dotted and faded, ✕ badge"). Só ficaram em português dados: `Notas`, `Nota`, `Tabela`, `Tela`, e os motivos do Diagnóstico para URLs antigas. Voltei para Português e Escuro. Repetição do R8.1a/R8.1b em inglês: não executada (ver acima). |

## Achados

**Produto**

- **A1 [média-baixa] Diagnóstico › Imagens remotas guarda a primeira razão por URL.** R15.7: `http://127.0.0.1:8765/foto.png` entra como "endereço não aceito". R15.9: com `http` e rede local ligados, a app pede a imagem (confirmado no `servidor.log`) e o navegador recusa (sem CORS), mas a linha continua "endereço não aceito"; "não carregou" não aparece. Esperado: razão atualizada. Passo: R15.9 (🟡).
- **A2 [baixa-média] Enter no campo URL da imagem grava um `\n` no valor.** O `mapping.json` ficou com `"url": "http://localhost:8765/foto.png\n"`. A imagem carrega assim, mas o valor muda e o `\n` iria para o código gerado. Passos: R15.2 a R15.11 (o roteiro manda confirmar com Enter).

**Roteiro (texto errado, produto certo; o texto correto vai entre aspas)**

- R9 (Catálogo): o botão da Paleta não se chama "Adicionar", e sim "Adicionar na tela <container>", "Adicionar dentro de <Box/Row>" ou "Adicionar no canvas", conforme a seleção e o centro da vista.
- R9: a anotação de Row fica na camada **Layout**, não em "Componentes".
- R9: `Alt+Shift+A` e `Ctrl+Shift+6` só funcionam com o foco fora do campo (clicar no título de Detalhes basta).
- R9: um Button totalmente dentro do Text field vira filho dele; para comparar frente e fundo use uma posição que atravesse a borda (Y 205).
- R9.12: a leitura de disco vem da pasta, não de Exportar › Baixar.
- R10: a linha de validação é "Pacote válido, sem erros nem avisos.", não "0 erro(s) e 0 aviso(s) no pacote.".
- R10.7: "Adicionar à tela" deixa o diálogo aberto; com um Button selecionado, a Paleta aninha o novo dentro dele (mesmo `rect`).
- R10: "Nenhuma anotação será afetada." só aparece depois de escolher **Apagar dados**; "Endereço/Endpoint" aparece sob API na lista do `sdui-backend`.
- R13.5: a legenda diz "Rejeitada: pontilhada e esmaecida, selo ✕" (sem "(só em Atual)") e "Inválida: tracejada vermelha e ⚠ (bloqueia Aplicar)".
- R13.12: com zoom 175% o `data-components` cai para 5 por corte da vista; a conta de 6 vale com **Enquadrar tudo**.
- R15.2: o Image nasce com a Descrição "Foto" e a URL de prévia `https://example.com/foto.jpg`; o roteiro deve avisar que a faixa de consentimento aparece antes do campo ser apagado (já cita). O botão da Paleta se chama "Adicionar na tela Tela".
- R15.11: a Privacidade lista `http://127.0.0.1:8765` (com esquema e porta), não só `127.0.0.1`.

## Regressões fora do alvo

Nenhuma observada.

## Observações

- A janela Especializações ainda diz "Uma biblioteca (versão 4 a 7) …" (texto de versões que parece defasado; só observação).
- O Diagnóstico de imagens remotas continua listando URLs depois de fechar e reabrir o projeto (a janela diz "nesta sessão"; consistente, só anotado).
- O foco volta ao botão que abriu a janela no Esc (Configurações, Especializações); sem barra horizontal em Privacidade, Especializações e Catálogo nos temas claro e escuro.
- O R8.1b (Loja do R4) não foi feito para não mexer no `reviewResume` nem nas revisões do dono.
- Entradas que **eu** criei em Projetos recentes: pastas `principal`, `biblioteca`, `telas`, `fumaca-web-2` (removida da lista no R0.7), `remotas`, `componentes` (nome "Telas"), e do dispositivo `vazio-r10` e "Telas" (do zip). Entradas do dono (`vazio`, `telas` antigas, `Loja`…) não foram tocadas.
- No computador do Chrome, a janela do `iniciar-servidor.cmd` pode ter ficado aberta com "pressione uma tecla" (o servidor já parou com `/parar`).
- No clone da nuvem, o build do MCP criou `dist-mcp/` (saída de build); o repositório não foi editado.

## O que atrapalhou

- `computer_screenshot` do controle do computador esconde o Chrome ("willHide"): depois dele, a captura da extensão deu timeout até eu restaurar o Chrome pela barra de tarefas. Medi com `document.visibilityState` (visível) antes de concluir.
- Digitei a URL no campo errado (o nome da anotação) uma vez; apaguei e refiz no campo certo (o nome ficou vazio de novo, como estava). Sem efeito no resultado.
- Naveguei a aba de apoio por engano para `/parar` e `foto.png`; devolvi a `https://example.com/` e o título.
- Seletor de idioma e de dropdown não são `<select>` nativos nos dois casos: usei teclado (seta + Enter) e `form_input` só no Escala.
- Exclusão na pasta conectada não é permitida (nada foi apagado); `file_upload` não esteve disponível; leitura de JS bloqueada em alguns pontos.

## Tratamento dos achados (EX4)

- **A1:** corrigido. `reportRemoteImageIssue` (`src/store/diagnostics.ts`) guardava só a primeira razão por URL; agora a linha troca a razão no lugar (ex.: "endereço não aceito" vira "não carregou"), sem duplicar. Testes em `tests/components/DiagnosticsView.test.tsx`.
- **A2:** sem mudança no produto. Shift+Enter abre o campo de várias linhas por desenho e grava a quebra; a extensão do navegador provavelmente mandou o Enter com `\n` no texto. O roteiro R15 passou a mandar confirmar com a tecla Enter e conferir no disco que o `url` não termina em `\n`. Se aparecer com a tecla Enter de verdade, vira achado de produto.
- **Textos dos roteiros:** todos os itens da lista "Roteiro" acima foram corrigidos no `docs/TESTING.md`.
- **Pendentes sem dono:** R1.7–R1.24 e R9.13–R9.20 ficam fora da lista desta etapa; R8.1b depende de dado do dono e segue como "não executado (precisa do dono)".
