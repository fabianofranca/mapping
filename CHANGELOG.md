# Changelog

Este arquivo registra, por etapa (épico), o que mudou para quem usa a app e o servidor MCP. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), adaptado: uma seção por épico ou etapa mesclada na `main`, da mais recente para a mais antiga.

**Regra:** toda entrega de `epic/*` para a `main` atualiza este arquivo no próprio PR do épico, com uma nova seção no topo. A entrada `[Não lançado]` vira a data do merge quando o dono mesclar. Os detalhes de cada etapa estão nas issues fechadas com o rótulo `etapa` e, antes delas, no histórico do git.

## Semântica acessível — [Não lançado] (épico `epic/semantica-acessivel`, PR a definir, MCP 0.13.0, schema v13)

### Alterado

- Guia interativo: uma nota embaixo da tabela de atalhos explica o atalho de janela. Com o foco fora da janela, o atalho leva o foco a ela e a abre, se estiver fechada; com o foco dentro, ele esconde a janela.
- Ajuda › Atalhos: a linha de cada janela diz as duas coisas ("Ir para Árvore de marcações (com o foco, esconde)", numa linha só, também em pt-BR a 900 px). O comportamento do atalho não muda.

### Corrigido

- Detalhes: o seletor segmentado de um campo (por exemplo `estilo` do Button) não passa mais da borda do painel nem cria barra de rolagem horizontal: em coluna estreita as opções quebram de linha, cada uma inteira e clicável. A tabela de um campo `table` continua rolando na própria caixa.
- Leitor de tela: os menus em popover (o do projeto, no nome do projeto, e o **Em lote** da revisão em janela estreita) agora são menus de verdade. Os itens são anunciados como itens de menu, o foco vai ao primeiro ao abrir, ↑/↓ andam entre eles em círculo e Esc fecha e devolve o foco ao botão, que anuncia que abre um menu.
- Comando de voz: o nome dos botões com texto da revisão passa a começar pelo texto visível, no formato "texto: alvo" — "Aceitar imagem: Confirmação", "Rejeitar marcação: Topo", "Sobrescrever: Nome", "Manter atual: Nome". O estado (aceita ou rejeitada) fica só no estado do botão, e o efeito do conflito (sobrescreve ou mantém o valor atual) na descrição. O mesmo vale para o botão do menu do projeto ("Meu projeto: ações do projeto"), o do **Em lote**, o zoom ("100%: zoom atual…") e o **Adicionar** da paleta da Biblioteca ("Adicionar: Button").

## Acabamento a 900 px — 2026-11-02 (épico `epic/acabamento-900`, PR #337, MCP 0.13.0, schema v13)

### Corrigido

- Revisão de proposta em janela estreita (até 1199 px): o rodapé de atalhos mostra só **Aceitar**, **Rejeitar** e **Próxima pendente**, numa linha, e cabe inteiro dentro da janela inferior (a 900×698 ele passava da base). Os outros atalhos (conflito, alternar a visão, aplicar) continuam valendo pelo teclado e seguem em Ajuda › Atalhos; em janela larga o rodapé mostra os seis.
- Tela inicial a 900 px: o selo (Neste dispositivo / Na pasta) e os botões de cada projeto ficam numa linha só, a borda entre as linhas da tabela é contínua e a tabela não rola na horizontal.
- Guia interativo: a tabela de atalhos passa a trazer `Ctrl+Shift+4` (Lista).
- Tela inicial: fechar o aviso **Pasta indisponível** com Esc ou **Cancelar**, sem remover, devolve o foco ao **Abrir** da linha que abriu o aviso, e não ao da primeira linha. Remover da lista pelo aviso continua levando o foco à linha que ficou no lugar.

## Avisos que faltam — 2026-11-02 (épico `epic/avisos-faltantes`, PR #333, MCP 0.13.0, schema v13)

### Adicionado

- Soltar um arrasto de retângulo menor que o mínimo de 8 px, com a ferramenta de marcação, agora mostra o aviso "Cada lado precisa ter pelo menos 8 px." em vez de não fazer nada. Clique simples, Esc e arrasto válido seguem sem aviso.

### Alterado

- MCP 0.13.0: `rect-too-small` no `plan_changes` e no `propose_changes` agora diz o tamanho recebido e o mínimo que valeu (8 px ou o `minSize` do componente, o maior) no `detail`, com uma `hint` para aumentar `width` e `height`; `image-overlap` diz a referência do outro container com que há sobreposição, com uma `hint` para mudar `x`/`y`/`scale` ou o tamanho, ou mover o outro container antes.
- MCP: o `detail` dos erros do modelo não é mais cortado quando tem `: ` dentro. Ao mover vários containers juntos, o `image-overlap` cita o container que não se move (antes citava o movido).

## Foco nos chamadores das janelas — 2026-11-02 (épico `epic/foco-chamadores`, PR #336, MCP 0.12.0, schema v13)

### Corrigido

- Fechar os Detalhes, as Propostas ou as Incompletas abertas pela revisão, por "mostrar o problema", pelo "ir para a anotação" de Incompletas ou pela atualização de especialização devolve o foco do teclado a quem as abriu, ou ao botão da faixa. Abrir a revisão a partir da Lista não perde mais o foco.

## Exemplo gerado das fontes — 2026-11-02 (épico `epic/exemplo-gerado`, PR #334, MCP 0.12.0, schema v13)

### Alterado

- O `examples/exemplo-completo.zip` é o mesmo (byte a byte), mas agora sai da pasta do exemplo mais um manifesto que aponta as fontes das quatro especializações; `examples/exemplo-completo/specs/` deixou de ser versionado. Abrir a pasta `examples/exemplo-completo/` direto, com **Abrir pasta**, pede `npm run build:example` antes (ele materializa `specs/`).

## Foco nas janelas — 2026-11-02 (épico `epic/foco-janelas`, PR #315, MCP 0.12.0, schema v13)

### Corrigido

- Fechar uma janela de ferramenta (Árvore, Camadas, Detalhes, Catálogo e as da janela inferior), pelo X, pelo atalho ou pela faixa, não deixa mais o foco do teclado perdido: ele volta a quem abriu a janela, ou ao botão dela na faixa, ou ao canvas. Trocar de aba da janela inferior também mantém o foco na aba.

## Teste primeiro e portão de complexidade — 2026-11-02 (épico `epic/teste-primeiro`, PR #321, MCP 0.12.0, schema v13)

### Adicionado

- Portão de complexidade por função: a regra `complexity` do ESLint (limite 10, erro) vale em `src/**` e `mcp/**` e roda no `npm run lint` do CI. As 319 funções do legado acima do limite estão em `eslint-suppressions.json`, que só pode encolher (`npx eslint --prune-suppressions` quando uma é reduzida). Um teste de tooling prova que a regra pega em `src/` e `mcp/` e não vale em `tests/`, `scripts/`, `viewer/` e `pwa/`.

### Alterado

- Quem desenvolve com agentes: o briefing dos subagentes e a mensagem da sessão da fase passam a exigir **teste primeiro** para mudança de comportamento ou correção (teste visto falhando antes do código; o retorno traz o nome do teste e a falha). Refatoração, documentação e trabalho mecânico só exigem os testes existentes passando antes e depois.
- Nada muda na app nem no servidor MCP.

## Planejamento nas issues — [Não lançado] (épico `epic/fluxo-issues`, PR a definir, MCP 0.12.0, schema v13)

### Alterado

- O roadmap e o plano das etapas passam a viver em issues do GitHub: os itens futuros têm o rótulo `roadmap`, a etapa em andamento tem o rótulo `etapa`, com uma sub-issue (rótulo `fase`) por fase; a issue fechada é o histórico.
- `PLAN.md` e `docs/ROADMAP.md` saíram do repositório. O histórico da etapa Marcação pai foi arquivado em `docs/history/PLAN-etapa-marcacao-pai.md`, o último no formato antigo.
- O índice da documentação de referência está no `README.md` e o do histórico, em `docs/history/README.md`.
- Limpeza do repositório: saíram `docs/history/` (planos das etapas, prompts antigos, auditoria e relatos de teste), `docs/redesign/` e `docs/sdui/`; o git guarda essa história. As regras que o código ainda citava foram para o `docs/ARCHITECTURE.md` ou para o próprio comentário.
- O visualizador embutível mudou de `lab/viewer/` para `viewer/`, com a demonstração em React em `viewer/demo/` (`npm run dev:viewer`) e as bibliotecas de exemplo em `viewer/samples/`. O pacote `mapping-viewer`, o `npm run build:viewer` e o `dist-viewer/` não mudam.
- O laboratório de componentes saiu, com o `dist/lab/` publicado ao lado da app e os scripts `dev:lab`, `dev:lab:react` e `build:lab`.
- O testador da nuvem (sessão do Claude Code no ambiente "Mapping - testes") é o único agente testador: o prompt do Cowork (`docs/TESTING-COWORK.md`) saiu, o `docs/TESTING-NUVEM.md` passou a valer sozinho, junto com o `docs/TESTING.md`, e a cobertura de Windows/Edge por agente deixou de existir. Os roteiros sob demanda continuam manuais, feitos pelo dono.
- O relato de uma rodada de teste passa a ser um comentário na sub-issue da fase testada (em partes, se passar de 65 mil caracteres), com aviso ao coordenador; não há mais PR de relato.
- Fluxo automatizado com três chats (roadmap, detalhamento e implementação): o chat de implementação orquestra uma sessão por fase, e cada uma mescla o próprio PR no épico com o CI verde; depois chama o testador, corrige uma vez se houver ❌ e só chama o dono para confirmar o merge do épico na `main`. As mensagens prontas estão em `docs/FLOW.md`.
- A tabela de modelos da etapa ganha a linha Orquestrador (padrão Sonnet).
- Nada muda na app nem no servidor MCP.

## Sincronia do design system — 2026-11-02 (épico `epic/sincronia-ds`, PR #287, MCP sem mudança, schema v13)

### Adicionado

- `docs/DESIGN-SYSTEM.md`: o registro vivo do design system do projeto (o artefato **Mapping** do Claude Design, curado à mão). Traz a URL, o mapa de cada componente, seção, token e ícone do DS para a origem no código, os gatilhos que obrigam a verificar o DS, as pendências abertas e o histórico de sincronização.

### Alterado

- Fluxo de trabalho: toda descrição de PR passa a declarar o **Impacto no DS**, e o fechamento de cada épico aplica as pendências acumuladas no design system. O job `epic` do CI exige que o PR do épico toque o `docs/DESIGN-SYSTEM.md`, como já exigia o `CHANGELOG.md`.
- O design system foi posto em dia com as entregas desde 2026-10-24: Proposto com componentes, Sugestões no campo de texto, Imagens remotas, Biblioteca Material 3 e o **Envolver** da Marcação pai.

## Testes na nuvem — 2026-11-02 (épico `epic/testes-nuvem`, PR #279, MCP sem mudança, schema v13)

### Adicionado

- As rodadas dirigidas do testador podem rodar numa sessão do Claude Code na nuvem (ambiente "Mapping - testes"), sem o dono no computador: prompt em `docs/TESTING-NUVEM.md` e receitas dos diálogos nativos no apêndice A do `docs/TESTING.md`.

### Alterado

- O fluxo de épico dispara a rodada dirigida sozinho depois do merge da última fase: o agente da fase cria a sessão do testador, o testador avisa quando abre o PR do relato e, sem ❌ e com o CI verde, o agente da fase mescla o relato no épico.

## Exemplos enxutos — [Não lançado] (épico `epic/exemplos-enxutos`, PR #273, MCP 0.12.0, schema v13)

### Adicionado

- Todo recurso dos formatos de especialização e de componente tem um exemplo, de preferência nas bibliotecas prontas de `libraries/`; um teste (`tests/examples/featureCoverage.test.ts`) quebra se um recurso novo do schema ficar sem exemplo. A única exceção é `fonts[].style` (`italic` e `normal`): a fonte é fixa no cliente mobile, fora do SDUI.
- Biblioteca de exemplo **SDUI do backend** (`examples/libraries/sdui-backend/`, 6 tipos e 5 componentes): um sistema externo fictício que descreve telas, com a origem executável (`origins`, `sources`, a tela de exemplo na galeria) e `migrations`. O roteiro R10 ganhou os passos da origem.
- `examples/README.md`: guia dos exemplos, com uma seção para cada biblioteca de `libraries/` e cada exemplo de `examples/`, os roteiros que os usam e a tabela "Onde ver cada recurso"; um teste exige uma seção por exemplo no disco.

### Alterado

- O projeto de exemplo (`examples/exemplo-completo.zip`), o guia interativo, o `proposta-componentes.zip` e os roteiros (R3, R9, R10, R12, R13 e R15) usam a biblioteca **Material 3 (Compose)** no lugar do pacote antigo de 15 tipos. O zip do projeto de exemplo cresceu (289.104 bytes, eram 64.988).
- O botão **Abrir projeto de exemplo** e o zip embutido saíram da app, porque embutir o zip levaria o `dist/index.html` a 1.868.223 bytes, acima do orçamento de 1,5 MiB: a Ajuda e o guia orientam a baixar `examples/exemplo-completo.zip` do repositório e abri-lo como zip.
- `examples/libraries/` ficou só com a `analytics` e a `sdui-backend`; saíram a `material3` de 15 tipos, a `pessoas` e `examples/specs/biblioteca.json`, e o gerador (`npm run build:examples`). Os testes passaram a ler cópias congeladas em `tests/fixtures/`.
- Roteiro R8.1b passou a abrir a própria cópia da Loja pelo `proposta-exemplo.zip`, sem depender do R4; textos dos roteiros R9, R10, R13 e R15 corrigidos pelas duas rodadas do Cowork.

### Corrigido

- Diagnóstico › Imagens remotas: quando a mesma URL muda de situação (de "endereço não aceito" a "origem sem permissão" e a "não carregou"), a linha troca a razão no lugar, em vez de ficar com a razão antiga.
- O editor de texto de várias linhas tira a quebra de linha do fim ao gravar: a `url` de uma imagem remota deixa de ir ao `mapping.json` com `\n` quando se confirma com Enter.

## Biblioteca Material 3 — 2026-11-01 (épico `epic/material3`, PR #260, MCP 0.12.0, schema v13)

### Adicionado

- Especialização `formatVersion` 9 com `variants` no `code` de uma plataforma: um campo `enum` do tipo escolhe a variante do código, que troca o `symbol` (em Compose, `Button`, `OutlinedButton`, `TextButton`), o `path` e as `notes` e soma `params` e `values` aos da base. Um nível só; as versões 1 a 8 continuam aceitas sem mudança, e `variants` numa versão anterior é o erro `só é permitido com formatVersion 9`, no caminho exato.
- Tabela de variantes no Catálogo: abaixo do código da plataforma, "Variantes (campo)" lista cada valor e o símbolo dele.
- Roteiro de teste R16 (Variantes no código), feito pelo agente sozinho.
- A biblioteca **Material 3 (Compose)** traz a fonte Roboto (400 e 500, `.woff2` do Fontsource, licença OFL em `fonts/LICENSE-Roboto.txt`) e valida sem nenhum aviso.
- `examples/material3-compose.zip`: o pacote `libraries/material3-compose/` compactado (o conteúdo na raiz), para aplicar em Especializações › **Aplicar zip…**; gerado por `npm run build:material3-zip` e conferido por teste.
- Roteiro de teste R17 (Biblioteca Material 3 (Compose)), feito pelo agente sozinho: confere o zip e o pacote, aplica o zip na app, mapeia uma tela (Scaffold, Top app bar, LazyColumn com List items, Button outlined e FAB) por proposta e confere que `get_code_hints` devolve a árvore com os composables certos (`Scaffold`, `TopAppBar`, `LazyColumn`, `ListItem`, `OutlinedButton`, `FloatingActionButton`).
- Biblioteca **Material 3 (Compose)** pronta para uso em `libraries/material3-compose/` (especialização `formatVersion` 9, não embutida: aplique pela pasta ou por um zip dela): 50 tipos em três camadas (Layout: Scaffold, Surface, Box, Row, Column, LazyColumn, LazyRow, LazyVerticalGrid, FlowRow, Spacer, HorizontalPager; Conteúdo: Text, Icon, Image; Componentes: Top app bar, Button, FAB, Extended FAB, Text field, Switch, Checkbox, Chip, Card, List item, Navigation bar, Bottom sheet, Icon button, Icon toggle button, Segmented button, Radio button, Slider, Search bar, Date picker, Time picker, Badge, Snackbar, Tooltip, Progress indicator, Secure text field, Divider, Alert dialog, Dropdown menu, Navigation rail, Short navigation bar, Navigation drawer, Tabs, Bottom app bar, Carousel, Pull to refresh, Swipe to dismiss), cada um com o composable do `compose.material3` 1.4.0 no `code` (o arquivo no androidx, os parâmetros e as variantes que trocam o composable), componente, documento e exemplos.

### Alterado

- MCP: `get_annotation` e `get_marking` devolvem o `code` já resolvido para a variante de cada anotação (sem `variants` na saída); `get_code_hints` mantém o `code` cru da base em `types` e traz o `code` resolvido da variante nas anotações da `tree` de tipos com `variants`; `get_specialization` e `get_component` continuam devolvendo o JSON cru.
- MCP: `find_by_code` compara com o código resolvido de cada anotação (buscar o símbolo da base só traz as anotações da base, o de uma variante só as dela; buscar por `path` traz todas). Nas especializações 1 a 8 nada muda.
- A "Definição" dos Detalhes mostra o arquivo e o símbolo da variante da anotação.
- `validate_specialization`, `validate_library` e `apply_specialization` aceitam a `formatVersion` 9, com os mesmos erros da app.

### Corrigido

- A validação da biblioteca não avisa mais "campo não usado pelo desenho" quando o `code` do tipo usa o campo (`params`, `values`, `variants` ou as `notes`): a Material 3 (Compose) passou de 82 para 50 avisos. O tamanho mínimo (`minSize`) dos componentes da biblioteca ficou só onde o código do androidx define um mínimo nos dois eixos (valores corrigidos: Button 58 × 40, campos de texto 280 × 56, Search bar 360 × 56); nos demais o campo foi removido, e a prova de desenho da validação passou a desenhar só o tamanho inicial (o tamanho mínimo não é mais desenhado): a Material 3 (Compose) passou a trazer a fonte Roboto (`.woff2` do Fontsource, licença OFL) e validar sem nenhum aviso, e a biblioteca de exemplo `examples/libraries/material3/` foi de 42 para 3.
- O zip exportado passa a levar, sem alteração, a cópia em `specs/` de uma especialização que a app não consegue ler (versão de formato maior, arquivo inválido ou `id` diferente); antes ela ficava de fora e o zip citava uma cópia ausente.

## Imagens remotas — 2026-11-01 (épico `epic/imagens-remotas`, MCP 0.11.0, schema v13)

### Adicionado

- Nó `image` nos componentes (componente `formatVersion` 3; as versões 1 e 2 continuam aceitas): um componente pode exibir uma imagem por URL `https://`, ligada a um campo `string`.
- Consentimento por origem: uma faixa acima do canvas lista as origens novas e só pede a imagem à rede depois de "Permitir estas"; o padrão é "Agora não".
- Configurações › Privacidade: origens permitidas com Revogar e interruptores (desligados por padrão) para qualquer origem, `http:`, rede local e servidores sem CORS.
- Visualizador embutível 0.3.0 com a opção `remoteImages` (desligada por padrão) e `allowOrigin`.
- Roteiro de teste R15 e um exemplo de biblioteca com componente de avatar.

### Alterado

- A CSP do `index.html` passa a liberar `https:` e `http:` em `img-src`, com Trusted Types e `no-referrer`; `connect-src` continua `'none'`.
- A imagem nunca é gravada (projeto, zip, IndexedDB ou cache): só a URL fica no `mapping.json`.
- O MCP nunca baixa imagens: desenha o reservado e devolve a URL como texto.
- Imagens que falham ou são bloqueadas aparecem no Diagnóstico e ficam no reservado.

## Proposto com componentes — 2026-10-25 (PR #226, MCP 0.9.0, schema v13)

### Adicionado

- A visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, com a marca de criada.
- Roteiro R13 e o exemplo `examples/proposta-componentes.zip`.

### Alterado

- A criação rejeitada vira só o fantasma pontilhado, nas duas visões.

## Marcações espaciais, notas e setas — 2026-10-23 (PR #217, MCP 0.9.0, schema v13)

### Adicionado

- Marcação que pertence ao canvas (sem container) e que pode envolver containers; o pertencimento é resolvido pela geometria e gravado (o agente lê `parent`/`members`, nunca calcula).
- Seleção múltipla e arrasto conjunto.
- Notas: biblioteca embutida de marcações flutuantes (`floating`).
- Setas como marcações que apontam (coleção `arrows`, `appliesTo`) e tabelas com `repeat`.
- Especialização `formatVersion` 7, proposta `formatVersion` 3 e componente `formatVersion` 2.

### Alterado

- A herança entre marcações foi removida (schema v13).

## Container — 2026-10-22 (PR #213, MCP 0.8.0, schema v12)

### Alterado

- O objeto de topo do canvas passa a se chamar container (`containers` e `containerId` no `mapping.json`; tools `*_container` no MCP, com as antigas aceitas com aviso por uma versão).
- Os presets de dispositivo vêm da especialização (`formatVersion` 6) e a proposta passa à `formatVersion` 2.

## Recorte com URL — 2026-10-21 (PR #198, MCP 0.7.0)

### Alterado

- As tools de imagem do MCP, com `save`, gravam o recorte em `crops/` e devolvem `path`, `url` e `markdown`.

## Canvas limpo — 2026-10-21 (PR #203)

### Adicionado

- Ver limpo (`Alt+H`): mostra só a imagem e os componentes, sem gravar nada no projeto.

### Alterado

- O cartão de texto do zoom semântico saiu do canvas; as anotações ficam só no painel direito.

## Código de instanciação — 2026-10-20 (PR #190, MCP 0.6.0, schema v11)

### Alterado

- O `code` das especializações passa a ser o código com que se cria uma instância do tipo.
- `platforms[].repo` fica na especialização e o projeto guarda só o clone local (especialização `formatVersion` 5).

## Biblioteca — 2026-10-19 (PR #180, MCP 0.5.0, schema v10)

### Adicionado

- Biblioteca como pacote: a pasta da especialização com componentes, fontes, documentos e exemplos.
- Telas com componentes e o Catálogo.
- Atualização da biblioteca com migrações; `validate_library` no MCP.

### Alterado

- Especialização `formatVersion` 4 e formato de componente (`docs/COMPONENT-FORMAT.md`).

## Laboratório de componentes — 2026-10-17 (PR #160)

### Adicionado

- `lab/components/`: experimentos fora do produto que provaram o formato de componente (template de primitivas com expressões sobre os campos), containers e fontes do design system.

## Etapa 10 — 2026-10-15 (PRs #154 e #155, MCP 0.4.0, schema v9)

### Corrigido

- Nota sugerida e foco ao rejeitar pelo marcador na revisão; seleção depois de rejeitar a criação.
- Guia do testador atualizado.

## Etapa 9 — 2026-10-15 (PRs #145 a #152, MCP 0.4.0, schema v9)

### Adicionado

- Apagar proposta que não está aberta.
- `path` (arquivo do símbolo) no `code` da especialização.
- Detalhes na revisão, com o painel normal e um marcador por campo.

### Alterado

- `codeRef` removido (schema v9).

## Etapa 8 — 2026-10-14 (PR #141, MCP 0.3.4)

### Alterado

- Consolidação por subsistema: sessão com fila única, revisão pelo projeto à vista e um dono de foco por fechamento.

## Etapas 1 a 7 e 2.x

- **Etapa 7 (PRs #117 a #120, MCP 0.3.2):** o foco nunca cai no `body` ao fechar diálogos.
- **Etapa 6 (PRs #108 a #114, MCP 0.3.2):** correções da primeira rodada de testes; recentes de pasta na tela inicial.
- **Etapa 5 (MCP 0.3.1):** pré-voo para uso real e guia do testador.
- **Etapa 4 (MCP 0.3.0, schema v8):** propostas de alteração com revisão.
- **Etapa 3b (schema v7):** referências de código nas especializações.
- **Etapa 3a:** servidor MCP (base).
- **Etapa 2.5 (schema v5):** trava (`locked`) de marcações e imagens.
- **Etapa 2.4:** privacidade garantida por CSP gerada no build.
- **Etapa 2.3:** redesign da interface (fases R1 a R9).
- **Etapas 2.1 e 2.2:** revisões técnicas, sem mudança de comportamento visível.
- **Etapas 1 e 2:** marcações retangulares, camadas, anotações chave-valor, `mapping.json` e especializações.
