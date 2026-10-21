# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, as da etapa Canvas limpo, no fim do documento; a etapa Código de instanciação foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa em andamento é **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos), detalhada no fim deste documento. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v11)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 5 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
| [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md)   | Formato do arquivo de componente (`mapping-component`): nós, dimensionamento, expressões, avisos do motor |
| [`docs/component.schema.json`](docs/component.schema.json) | JSON Schema do arquivo de componente (documentação; o código é a fonte da verdade) |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 retirada do roadmap) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/history/PLAN-etapa-5.md`](docs/history/PLAN-etapa-5.md) | Histórico: etapa 5, pré-voo para uso real (fases 5.1 a 5.9 concluídas; decisões consolidadas dos PRs; prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-6.md`](docs/history/PLAN-etapa-6.md) | Histórico: etapa 6, correções da primeira rodada de testes (fases 6.1 a 6.7 concluídas; decisões consolidadas dos PRs; relato da rodada 1 e prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-7.md`](docs/history/PLAN-etapa-7.md) | Histórico: etapa 7, correções da rodada dirigida (fases 7.1 a 7.4 concluídas; decisões consolidadas dos PRs; relato da rodada 2 e prompt do coordenador ao lado) |
| [`docs/history/PLAN-etapa-8.md`](docs/history/PLAN-etapa-8.md) | Histórico: etapa 8, consolidação por subsistema (fases 8.1 a 8.7 concluídas; decisões consolidadas dos PRs, auditoria e portão; ao lado, as notas de desenho em `docs/history/etapa-8-notas/`, a segunda leitura `auditoria-etapa-8.md` e o prompt do coordenador) |
| [`docs/history/PLAN-etapa-9.md`](docs/history/PLAN-etapa-9.md) | Histórico: etapa 9, ajustes do teste manual avançado (fases 9.1 a 9.7 concluídas; decisões consolidadas dos PRs; schema v9 e MCP 0.4.0) |
| [`docs/history/PLAN-etapa-10.md`](docs/history/PLAN-etapa-10.md) | Histórico: etapa 10, correções da rodada dirigida da etapa 9 (fases 10.1 e 10.2 concluídas; decisões consolidadas dos PRs #154 e #155 e do fechamento) |
| [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md) | Histórico: laboratório de componentes, fases L1 e L2 concluídas; decisões registradas que a etapa Biblioteca herda |
| [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md) | Histórico: etapa Biblioteca, fases B1 a B5 e Fechamento concluídas; decisões consolidadas dos PRs, rodada do Cowork do Fechamento (e reteste) e o que ficou para depois |
| [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md) | Histórico: etapa Código de instanciação, fases C1 a C4 concluídas; decisões consolidadas dos PRs, rodada do Cowork e reteste, e o que ficou para depois |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/relato-2026-10-20-instanciacao.md`](docs/history/relato-2026-10-20-instanciacao.md) | Relato da rodada dirigida do Cowork sobre o build `dee8666` (etapa Código de instanciação): 54 ✅, 1 ❌ (R3.6a) |
| [`docs/history/relato-2026-10-20-instanciacao-reteste.md`](docs/history/relato-2026-10-20-instanciacao-reteste.md) | Reteste do R3.6a no Claude Code com a `mcp-v0.6.0-rc.2`: passou |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapa Código de instanciação concluída), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

## Etapa em andamento — Canvas limpo (épico `epic/canvas-limpo`)

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

- [ ] `semanticText.ts` só com `semanticMode` (`'none' | 'header'`, sem `enabled` nem área livre) e os limiares; `cards.ts` apagado; `semanticCard.ts` só com o cabeçalho (sem `updateCard`, sem "…"); `Frame` sem `semantic` e `card`; `CanvasController` sem `cards` e sem assinar `locale` por causa deles; renderer das marcações sem `semanticPlacement`
- [ ] Botão Texto no canvas, `Choice` de Configurações, `semanticText`/`setSemanticText` e a chave `mapping.semanticText` removidos; chaves `view.semanticText*` fora dos dois i18n; `tests/i18n` verdes
- [ ] Tokens `t-cv-card` e `t-cv-caption` e os estilos `card` e `caption` de `canvas/theme.ts` removidos; `color-card` fica (minimapa); `tests/theme/tokenLiterals.test.ts` verde
- [ ] Testes: `cards.test.ts` apagado; `semanticText.test.ts` só com "quando aparece" (cabeçalho pelo tamanho na tela); `typedText.test.ts` sem as partes do cartão; `markings.test.ts`, `settings.test.ts` e `harness.ts` ajustados; um teste novo prova que a marcação grande mostra só o nome (sem cartão), mesmo sem filhas
- [ ] `docs/TESTING.md`: seção 5 sem o botão; R1.20 passa a conferir só o cabeçalho com o nome no zoom alto e o conteúdo nos Detalhes; R3.3 sem a condição da área livre e do cartão (o texto do Screen é conferido nos Detalhes e na Lista). `docs/ARCHITECTURE.md` (linhas 185 e 239) sem o cartão. `grep -rn "semanticText\|cardCache\|semanticCard\|zoom semântico" src tests docs/*.md` só encontra `docs/history/` e `docs/redesign/`

**Aceite:** com uma marcação grande na tela, aparece só o nome dela no canto; as anotações aparecem só nos Detalhes e na Lista; `npm run build` gera o `index.html` dentro do orçamento; gates verdes.

#### V2 — Ver limpo e fechamento

**Coordenador:** Sonnet. A especificação do estado, do caminho `'hidden'` e do controle está nas decisões acima. **Esforço:** medium; subagentes medium; mecânicos Haiku low.

**Toca em:**

- Estado e derivado: `src/store/ui.ts` (signal, ação de ligar e desligar, e o reset ao abrir projeto, onde `hiddenLayers` é zerado) e `src/store/derived.ts` (`markingVisibility` devolve tudo `'hidden'` quando ligado; `layerDots` e `incompleteMarkings` não precisam mudar, porque o renderer esconde o nó inteiro).
- Canvas: `src/canvas/CanvasController.ts` (o `frame` com `selection`, `hoverLock`, `hoverMarking` e `review` nulos quando ligado, para o overlay não desenhar; conferir que o `dropTarget` de arrastar arquivos continua funcionando) e `src/canvas/input/pointer.ts` (nenhum gesto `draw` enquanto ligado, por garantia além do modo).
- Interface e atalho: `src/app/EditorTools.tsx` (`CleanViewButton` no lugar de `SemanticTextButton`; `ModeButtons` com Desenhar desabilitado quando ligado), `src/app/EditorWindows.tsx`, `src/app/shortcuts.ts` (`{ kind: 'clean-view' }`, `Alt+H`, `SHORTCUT_LABELS.cleanView`) e o ponto onde os atalhos são tratados (em `src/app/`; procurar `toggle-lock`), `src/ui/shortcutList.ts` (grupo Ver) e i18n (`view.cleanView`, `view.cleanViewHint`, `shortcuts.cleanView`).
- Testes: `tests/store/ui.test.ts`, `tests/app/` (o atalho), `tests/canvas/` (com o modo ligado, a camada de marcações e a de overlay não têm nós visíveis e a de componentes continua) e `tests/components/` (o botão).
- Docs e fechamento: `docs/TESTING.md` (seção 5: o botão e o atalho em "Outros atalhos"; um passo novo no R1, depois do R1.20; um passo no R9 ou no R3 com uma tela de componentes limpa), `docs/ARCHITECTURE.md` (estado da UI e o caminho `'hidden'`), `docs/history/PLAN-etapa-canvas-limpo.md` (esta seção com as decisões consolidadas dos PRs), `PLAN.md`, `docs/ROADMAP.md` e `CLAUDE.md`.

- [ ] Estado, ações e reset ao abrir projeto, com teste
- [ ] Canvas só com imagens e componentes quando ligado (teste no harness); modo Navegar forçado e Desenhar desabilitado
- [ ] Botão e atalho `Alt+H` com dica, lista de atalhos da Ajuda e i18n nos dois idiomas
- [ ] Roteiros do `docs/TESTING.md`: seção 5; passo novo no R1 depois do R1.20 (ligar pelo botão e pelo atalho, conferir imagem e componentes sem nada por cima, Desenhar desabilitado, Árvore e Detalhes iguais, desligar e ver tudo voltar com a seleção mantida); passo no R9 ou no R3 com uma tela de componentes limpa
- [ ] `docs/ARCHITECTURE.md` com o estado da UI e o caminho `'hidden'`
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-canvas-limpo.md`, `PLAN.md` sem etapa em andamento, `docs/ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** numa foto com marcações e numa tela com componentes, `Alt+H` deixa só a imagem ou os componentes, sem borda, nome, ponto, alça ou cadeado; o painel direito continua mostrando a seleção; `Alt+H` de novo devolve tudo; gates verdes.
