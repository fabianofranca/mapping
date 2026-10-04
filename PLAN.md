# Mapeador de Imagens — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes**. Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1, 1.1, 2, 2.1 e 2.2 concluídas**; **etapa 2.3 (redesign da interface)** em andamento, fases abaixo. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **desktop primeiro e utilizável no celular**, com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v4)                                       |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual, 13.9) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3): componentes, tokens, mudanças B#, propostas P# e decisões |

## Etapas futuras (não implementar ainda)

- **Etapa 3 — Servidor MCP:** servidor em Node/TypeScript, no mesmo repositório, que reutiliza `src/model/` para um agente criar projetos, aplicar especializações e adicionar imagens, camadas, marcações e anotações direto na pasta. WebMCP pode vir depois, como adaptador sobre as mesmas funções.
  - Sincronização com o Figma: identidade e dono dos dados vindos do Figma; reexportação por página ou nó, com relatório e pendências.
  - Mapeamento Figma e código por plataforma nas especializações.
  - Campo de referência de código nas instâncias.
  - Telas para isso, a desenhar no Claude Design com o design system 2.0.
  - Só itens registrados por enquanto; o plano detalhado vem depois.
- **Etapa 4 — Editor de especializações:** criar e editar especializações dentro da app.

## Fases pendentes — Etapa 2.3: redesign da interface

A especificação completa está em [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) e nos dois artifacts do Claude Design citados nele (canvas "Mapeador — Redesign" e design system "Mapeador de Imagens 2.0"). Os códigos **B#** (mudanças de comportamento) e **P#** (propostas) abaixo são os do HANDOFF; as decisões tomadas estão na seção 5 dele.

Regras da etapa:

- R1 a R3 **não mudam comportamento**.
- Da R4 em diante, cada PR lista no "Como testar" as mudanças **B#** e **P#** que entrega.
- Os testes e2e afetados são atualizados no mesmo PR.
- O roteiro da 13.9 (`docs/history/PLAN-etapas-1-2.md`) continua passando nos dois layouts (desktop e 380 px) e nos dois temas.

#### R1 — Tokens

Tokens de design a partir de uma fonte única. Não muda comportamento.

- [ ] `tokens.css` gerado de uma fonte única (sem bloco escuro duplicado)
- [ ] Todas as famílias de tokens da seção 2 do HANDOFF
- [ ] `--space-3` → `--space-4` em todo o CSS, no mesmo commit em que `space-3` passa a valer 12px
- [ ] `color-border-control` em todo limite de controle
- [ ] `theme-color` claro e escuro
- [ ] Constante TS dos breakpoints

**Aceite**: nenhum valor de espaço, raio, opacidade, duração, z-index ou fonte fixo fora de `tokens.css` (lint de CSS ou teste que procura literais); contrastes da seção Contraste do DS 2.0.

#### R2 — Ícones e controles base

Conjunto de ícones e controles novos, com todos os estados. Não muda comportamento.

- [ ] Ícones novos em `ui/icons.tsx`
- [ ] Button, IconButton, TextField, Select, Choice, Segmented, Tabs e Tooltip com todos os estados
- [ ] Densidade do desktop

**Aceite**: prévias do DS 2.0 reproduzidas; foco visível em tudo; 44px no celular.

#### R3 — Canvas

Desenho do canvas lendo os tokens novos. Não muda comportamento.

- [ ] `readCanvasTokens` com `cv-*`, `color-card`, opacidades e `--font-sans`
- [ ] Renderers sem constantes fixas
- [ ] Halo nas linhas
- [ ] Etiqueta do nome da marcação selecionada

**Aceite**: testes de canvas atualizados; orçamentos de desempenho estáveis.

#### R4 — Estrutura do editor (desktop)

Barra principal, faixas, janelas de ferramenta, breadcrumbs e barra de status. Muda comportamento.

- [ ] Barra principal
- [ ] Faixas laterais e inferior
- [ ] Contêiner de janelas com redimensionar e recolher (B1, B2)
- [ ] Breadcrumbs (B11)
- [ ] Barra de status (B8, B13)
- [ ] Atalhos (B12): Ctrl+Shift+número como atalho oficial das janelas, Alt+número como extra, e Ctrl (não Cmd) no macOS
- [ ] Minimapa (P3)
- [ ] Campo de zoom (P4)

**Aceite**: abrir, fechar, redimensionar e persistir cada janela; nenhuma função atual sumiu.

#### R5 — Detalhes

Painel de detalhes (inspetor) redesenhado. Muda comportamento (B14, B15, P5, P6).

- [ ] Identidade e PropertyGrid
- [ ] LayerGroup recolhível (B15)
- [ ] KeyValueGrid, com reordenar pares por arrasto (P6)
- [ ] Campos tipados e DataGrid, com reordenar linhas por arrasto (P6)
- [ ] ReferenceField e seletor de referência (B14), com filtro por etiqueta (P5)
- [ ] Pendências com links para o campo

**Aceite**: edição, validação e desfazer iguais aos atuais.

#### R6 — Árvore e Camadas

Árvore e Camadas viram janelas à esquerda. Muda comportamento (B3).

- [ ] Janela Árvore
- [ ] Camadas como janela, com paleta em popover e modo "sem anotação" (B3)

**Aceite**: todas as ações do `LayersDialog` disponíveis.

#### R7 — Janela inferior

Lista, Incompletas e Diagnóstico na janela inferior. Muda comportamento (B4, B5, P7).

- [ ] Lista em tabela (P7)
- [ ] Incompletas (B5)
- [ ] Diagnóstico (B4)

**Aceite**: filtros atuais preservados.

#### R8 — Celular

Layout do celular com Painéis, telas cheias e gaveta de três alturas. Muda comportamento (B6, B7).

- [ ] Barra de cima
- [ ] Barra de baixo com Painéis
- [ ] Menu Painéis
- [ ] Telas cheias com faixa de abas
- [ ] Gaveta com três alturas (B6, B7)

**Aceite**: toda função do desktop alcançável em 380px; gestos de toque mantidos.

#### R9 — Diálogos e tela inicial

Diálogos novos, tela inicial e faixas. Muda comportamento (B9, B10, B16, P8, P10).

- [ ] Dialog novo
- [ ] Especializações
- [ ] Ajuda, com a seção Atalhos (P10)
- [ ] Configurações
- [ ] Exportar (B16)
- [ ] Tela inicial (B10)
- [ ] Faixa de preview dispensável na sessão, com o selo PREVIEW permanente (B9, P8)

**Aceite**: roteiro 13.9 completo nos dois layouts e temas.

#### R10 — Propostas adiadas

Propostas adiadas, a decidir. Muda comportamento.

- [ ] P1 — paleta de comandos
- [ ] P2 — busca global

**Aceite**: uma proposta por PR. (P9 e P11 estão fora do escopo por enquanto.)

> **Ordem e paralelismo**: R1; depois R2 e R3 em paralelo; depois R4; depois R5, R6, R7 e R9 em paralelo (a R9 só depende da R2 e pode começar antes); depois R8; R10 quando decidido.
