# Histórico — Etapa Canvas limpo (seção do antigo PLAN.md)

> Fases V1 e V2 concluídas no épico `epic/canvas-limpo` (V1 no PR #201; V2 no PR da fase, com o fechamento). Origem: pedido do dono em 2026-10-21. Sem schema, formato nem MCP novos (0.6.0 continua).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs.

---

## Etapa — Canvas limpo (épico `epic/canvas-limpo`)

### Objetivo

Dois pedidos do dono (2026-10-21), ambos sobre o que o canvas desenha por cima da imagem. (1) Uma opção de **ver o canvas limpo**: a imagem, ou os componentes instanciados, sem nenhuma borda, nome, indicador ou alça por cima. (2) **Remover o cartão de texto do zoom semântico**: o cartão com as anotações que o canvas desenha dentro da marcação quando o zoom é grande. Essa visualização passa a existir só no painel direito (Detalhes e Lista), que já a mostra.

Hoje não dá para ver a imagem limpa. A camada ativa nunca pode ser escondida, então sempre sobra pelo menos uma camada de marcações, e "Ocultar sem anotação" só esconde as marcações vazias. O cartão sai porque repete o que o painel direito já mostra, e com ele saem uma preferência por dispositivo e cerca de 800 linhas do canvas (`semanticText.ts`, `renderers/cards.ts` e o cartão de `renderers/semanticCard.ts`).

Nada muda no modelo, no schema v11, no `mapping.json`, no formato das especializações nem no MCP: a versão 0.6.0 continua e esta etapa **não** gera versão nova do MCP nem rótulo `mcp-rc`.

**Fora:** exportar imagem limpa (o Ctrl+Alt+C já copia o recorte da marcação); esconder a camada ativa; esconder só o cabeçalho ou o nome; persistir o Ver limpo; layout de celular.

### Decisões

- **O cabeçalho fica, o cartão sai.** No zoom alto a marcação continua mostrando a linha de cabeçalho (nome e indicadores), com os mesmos limiares de hoje (180 × 100 px na tela), agora só `'none' | 'header'`; nunca mais "…" nem cartão. A marcação com componente desenhado continua igual: borda só em hover e seleção, e o desenho no lugar do nome.
- **Preferência antiga ignorada.** A chave `mapping.semanticText` do `localStorage` deixa de ser lida e escrita; não há migração nem limpeza.
- **Ver limpo é estado de UI, não preferência.** Um signal booleano em `EditorUi` (sugestão de nome: `cleanView`), desligado ao abrir qualquer projeto e nunca gravado (`src/store/settings.ts` guarda preferências por dispositivo e não serve para ele). Quando ligado, toda marcação é `'hidden'` em `markingVisibility` (inclusive a selecionada e as que desenham componente), e o overlay não desenha seleção, alças, etiqueta, cadeado nem marcas da revisão: sobram só as camadas de imagens e de componentes. Pan, zoom, minimapa e o restante da interface (Árvore, Detalhes, Lista, revisão) continuam normais; a seleção continua existindo no painel, só não aparece no canvas. É o mesmo caminho do `'hidden'` que já existe, sem cálculo novo no canvas.
- **Sem desenhar nem selecionar no canvas enquanto ligado.** Ligar o Ver limpo muda o modo para Navegar e desabilita Desenhar; clicar no canvas não seleciona (as marcações são `'hidden'`, então `selectableMarkings` já devolve vazio). Desligar não muda o modo.
- **Onde fica o controle.** Um `IconButton` (ícone `eyeOff`, `pressed` quando ligado) no lugar do botão Texto no canvas, na `canvas-bar-end`, antes de Enquadrar tudo; atalho `Alt+H` (tecla física `KeyH`, como os outros com Alt), com o rótulo em `SHORTCUT_LABELS` e na lista de atalhos da Ajuda. Nenhum texto na barra de status. Textos novos: `view.cleanView` ("Ver limpo" / "Clean view") e `view.cleanViewHint` (dica: "Esconde marcações, nomes e seleção; só a imagem e os componentes" e o equivalente em inglês); os textos exatos são decisão da fase.
- **Sem MCP, sem schema, sem formato novo.** `mcp/version.ts` não muda; não há rótulo `mcp-rc`, rc nem tag.
- **Rodada do Cowork.** Não há rodada obrigatória; a V2 atualiza os roteiros e deixa para o dono, no PR, a decisão de rodar uma rodada dirigida (R1.20, R3.3 e o passo novo).
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar): V1 **Sonnet**, medium (subagentes Sonnet medium; mecânicos Haiku low); V2 **Sonnet**, medium (subagentes medium; mecânicos Haiku low). A especificação está fechada neste plano: não há decisão de formato ou arquitetura nova.
- **Fluxo:** épico `epic/canvas-limpo` a partir da `main` (que já tem a etapa Código de instanciação e a tag `mcp-v0.6.0`); um branch e um PR por fase com base no épico; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`); descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR; a V2 faz o fechamento (histórico, `PLAN.md`, `ROADMAP.md`, `CLAUDE.md`).

### Fases

A V1 vem primeiro porque simplifica o renderer que a V2 toca.

#### V1 — Sem cartão no canvas

**Coordenador:** Sonnet. A fase é remoção guiada por uma lista fechada de arquivos. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:**

- Zoom semântico no canvas: `src/canvas/semanticText.ts` (276 linhas; `semanticMode` devolve `'none' | 'header' | 'full'` a partir de `enabled`, do tamanho da marcação na tela, `SEMANTIC_MIN_WIDTH` 180 e `SEMANTIC_MIN_HEIGHT` 100, e da área livre; `cardSections`, `cardRows`, `layoutCard` e os tipos `CardRow`, `CardLabels`, `CardLayout` são só do cartão), `src/canvas/renderers/semanticCard.ts` (340 linhas; `createSemanticNode` cria o grupo com `card` e `header`, e `updateSemanticText` desenha o cabeçalho, com "…" quando o cartão não cabe, e chama `updateCard`: o cabeçalho fica, o cartão sai), `src/canvas/renderers/cards.ts` (167 linhas; `cardCache`, `semanticPlacement`, `NO_CARD`, tipo `MarkingCard`: sai inteiro), `src/canvas/renderers/markings.ts` (linhas ~185 a 215: chama `semanticPlacement` e `updateSemanticText` com `card: frame.card(marking)`; a marcação com componente desenhado, `withDrawing`, já mostra o desenho no lugar do cartão), `src/canvas/frame.ts` (campos `semantic: boolean` e `card` do `Frame`), `src/canvas/CanvasController.ts` (computed `cards` com `cardCache`, que assina `locale` só por causa dos rótulos do cartão; `semantic: semanticText.value` e `card: this.cards.value` no `frame`; o import de `semanticText` de `../store/settings`), `src/canvas/theme.ts` (`card` e `caption`, que só o cartão usa) e `src/theme/tokens.ts` (fontes `t-cv-card` e `t-cv-caption` saem; o token `color-card` **fica**, o minimapa o usa em `src/theme/editor.css`).
- Preferência e controles: `src/store/settings.ts` (signal `semanticText`, `setSemanticText`, chave `mapping.semanticText`), `src/app/EditorTools.tsx` (`SemanticTextButton`, ícone `text`), `src/app/EditorWindows.tsx` (linha ~151, que o põe na `canvas-bar-end` entre `ReviewCanvasControls` e `FitButton`), `src/ui/SettingsBar.tsx` (`Choice` "Texto no canvas"), `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts` (`view.semanticText` e `view.semanticTextHint`).
- Testes: `tests/canvas/semanticText.test.ts` (168 linhas; ficam só os do `describe` "quando aparece"), `tests/canvas/renderers/cards.test.ts` (sai), `tests/ui/typedText.test.ts` (importa `cardRows` e `cardSections`; só essas partes saem), `tests/canvas/renderers/markings.test.ts` (`render({ semantic: false })`), `tests/settings.test.ts` (as linhas sobre `semanticText`) e `tests/canvas/harness.ts` (`semantic: true` e `card: cardCache(...)` no quadro).
- Docs: `docs/TESTING.md` (linha 125, seção 5, "Barra do canvas", que descreve o botão Texto no canvas; R1.20, linha 295, que aproxima o zoom até o texto aparecer dentro da marcação; R3.3, linha 371, que cita o cartão do Formulário e a área livre de 180 × 100 px) e `docs/ARCHITECTURE.md` (linhas 185, `semanticText.ts` e zoom semântico, e 239, "o zoom semântico mostra o desenho no lugar do cartão de texto"). `docs/redesign/HANDOFF.md` e `docs/history/` são referência histórica e **não mudam**. O guia interativo (`public/guia/`, fonte em `scripts/guia`) não cita o cartão: nada a fazer nele.

- [x] `semanticText.ts` só com `semanticMode` (`'none' | 'header'`, sem `enabled` nem área livre) e os limiares; `cards.ts` apagado; `semanticCard.ts` só com o cabeçalho (sem `updateCard`, sem "…"); `Frame` sem `semantic` e `card`; `CanvasController` sem `cards` e sem assinar `locale` por causa deles; renderer das marcações sem `semanticPlacement`
- [x] Botão Texto no canvas, `Choice` de Configurações, `semanticText`/`setSemanticText` e a chave `mapping.semanticText` removidos; chaves `view.semanticText*` fora dos dois i18n; `tests/i18n` verdes
- [x] Tokens `t-cv-card` e `t-cv-caption` e os estilos `card` e `caption` de `canvas/theme.ts` removidos; `color-card` fica (minimapa); `tests/theme/tokenLiterals.test.ts` verde
- [x] Testes: `cards.test.ts` apagado; `semanticText.test.ts` só com "quando aparece" (cabeçalho pelo tamanho na tela); `typedText.test.ts` sem as partes do cartão; `markings.test.ts`, `settings.test.ts` e `harness.ts` ajustados; um teste novo prova que a marcação grande mostra só o nome (sem cartão), mesmo sem filhas
- [x] `docs/TESTING.md`: seção 5 sem o botão; R1.20 passa a conferir só o cabeçalho com o nome no zoom alto e o conteúdo nos Detalhes; R3.3 sem a condição da área livre e do cartão (o texto do Screen é conferido nos Detalhes e na Lista). `docs/ARCHITECTURE.md` (linhas 185 e 239) sem o cartão. `grep -rn "semanticText\|cardCache\|semanticCard\|zoom semântico" src tests docs/*.md` só encontra `docs/history/` e `docs/redesign/`

**Aceite:** com uma marcação grande na tela, aparece só o nome dela no canto; as anotações aparecem só nos Detalhes e na Lista; `npm run build` gera o `index.html` dentro do orçamento; gates verdes.

#### V2 — Ver limpo e fechamento

**Coordenador:** Sonnet. A especificação do estado, do caminho `'hidden'` e do controle está nas decisões acima. **Esforço:** medium; subagentes medium; mecânicos Haiku low.

**Toca em:**

- Estado e derivado: `src/store/ui.ts` (signal, ação de ligar e desligar, e o reset ao abrir projeto, onde `hiddenLayers` é zerado) e `src/store/derived.ts` (`markingVisibility` devolve tudo `'hidden'` quando ligado; `layerDots` e `incompleteMarkings` não precisam mudar, porque o renderer esconde o nó inteiro).
- Canvas: `src/canvas/CanvasController.ts` (o `frame` com `selection`, `hoverLock`, `hoverMarking` e `review` nulos quando ligado, para o overlay não desenhar; conferir que o `dropTarget` de arrastar arquivos continua funcionando) e `src/canvas/input/pointer.ts` (nenhum gesto `draw` enquanto ligado, por garantia além do modo).
- Interface e atalho: `src/app/EditorTools.tsx` (`CleanViewButton` no lugar de `SemanticTextButton`; `ModeButtons` com Desenhar desabilitado quando ligado), `src/app/EditorWindows.tsx`, `src/app/shortcuts.ts` (`{ kind: 'clean-view' }`, `Alt+H`, `SHORTCUT_LABELS.cleanView`) e o ponto onde os atalhos são tratados (em `src/app/`; procurar `toggle-lock`), `src/ui/shortcutList.ts` (grupo Ver) e i18n (`view.cleanView`, `view.cleanViewHint`, `shortcuts.cleanView`).
- Testes: `tests/store/ui.test.ts`, `tests/app/` (o atalho), `tests/canvas/` (com o modo ligado, a camada de marcações e a de overlay não têm nós visíveis e a de componentes continua) e `tests/components/` (o botão).
- Docs e fechamento: `docs/TESTING.md` (seção 5: o botão e o atalho em "Outros atalhos"; um passo novo no R1, depois do R1.20; um passo no R9 ou no R3 com uma tela de componentes limpa), `docs/ARCHITECTURE.md` (estado da UI e o caminho `'hidden'`), `docs/history/PLAN-etapa-canvas-limpo.md` (esta seção com as decisões consolidadas dos PRs), `PLAN.md`, `docs/ROADMAP.md` e `CLAUDE.md`.

- [x] Estado, ações e reset ao abrir projeto, com teste
- [x] Canvas só com imagens e componentes quando ligado (teste no harness); modo Navegar forçado e Desenhar desabilitado
- [x] Botão e atalho `Alt+H` com dica, lista de atalhos da Ajuda e i18n nos dois idiomas
- [x] Roteiros do `docs/TESTING.md`: seção 5; passo novo no R1 depois do R1.20 (ligar pelo botão e pelo atalho, conferir imagem e componentes sem nada por cima, Desenhar desabilitado, Árvore e Detalhes iguais, desligar e ver tudo voltar com a seleção mantida); passo no R9 ou no R3 com uma tela de componentes limpa
- [x] `docs/ARCHITECTURE.md` com o estado da UI e o caminho `'hidden'`
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-canvas-limpo.md`, `PLAN.md` sem etapa em andamento, `docs/ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** numa foto com marcações e numa tela com componentes, `Alt+H` deixa só a imagem ou os componentes, sem borda, nome, ponto, alça ou cadeado; o painel direito continua mostrando a seleção; `Alt+H` de novo devolve tudo; gates verdes.

---

## Decisões consolidadas dos PRs

- **V1 (PR #201):** o cartão de texto do zoom semântico e a preferência `mapping.semanticText` saíram; o cabeçalho (nome e indicadores) fica, com os limiares de 180 × 100 px; `color-card` fica por causa do minimapa.
- **V2 (Ver limpo):**
  - `EditorUi.cleanView` (signal) e `setCleanView(ui, on)` em `src/store/ui.ts`: ligar volta ao modo Navegar; desligar não mexe no modo. Nasce desligado com o `EditorUi` de cada projeto aberto, então não precisa de reset explícito.
  - `markingVisibility` (em `src/store/derived.ts`) devolve toda marcação `'hidden'` quando ligado, inclusive a selecionada. `drawnMarkings` não depende da visibilidade, então a camada de componentes continua desenhando sem cálculo novo.
  - No `CanvasController`, o quadro leva `selection`, `hoverLock`, `hoverMarking` e `review` nulos quando ligado (o overlay não desenha). O ponteiro (`input/pointer.ts`) trata o modo como Navegar, por garantia além do botão Desenhar desabilitado. O `dropTarget` de arrastar arquivos não foi tocado.
  - Botão `CleanViewButton` (ícone `eyeOff`, `pressed`) antes de Enquadrar tudo, atalho `Alt+H` (tecla física `KeyH`) no grupo Ver da Ajuda; textos `view.cleanView`, `view.cleanViewHint` e `shortcuts.cleanView`.
  - Roteiros: R1.20a (foto) e R9.12a (tela de componentes) no `docs/TESTING.md`. Nenhuma rodada do Cowork é obrigatória; fica a cargo do dono decidir no PR.
