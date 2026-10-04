# Histórico — Etapa 2.3, redesign da interface (seção do antigo PLAN.md)

> Fases R1 a R9 concluídas; R10 movida para Evoluções no ROADMAP.
>
> Arquivo histórico: seção "Fases pendentes — Etapa 2.3" do `PLAN.md`, movida sem alterações de conteúdo. A especificação continua em [`../redesign/HANDOFF.md`](../redesign/HANDOFF.md). As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md), a etapa 2.1 em [`PLAN-etapa-2-1.md`](PLAN-etapa-2-1.md) e a 2.2 em [`PLAN-etapa-2-2.md`](PLAN-etapa-2-2.md).

---

## Etapa 2.3: redesign da interface

A especificação completa está em [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) e nos dois artifacts do Claude Design citados nele (canvas "Mapeador — Redesign" e design system "Mapeador de Imagens 2.0"). Os códigos **B#** (mudanças de comportamento) e **P#** (propostas) abaixo são os do HANDOFF; as decisões tomadas estão na seção 5 dele.

Regras da etapa:

- R1 a R3 **não mudam comportamento**.
- Da R4 em diante, cada PR lista no "Como testar" as mudanças **B#** e **P#** que entrega.
- Os testes e2e afetados são atualizados no mesmo PR.
- O roteiro da 13.9 (`docs/history/PLAN-etapas-1-2.md`) continua passando nos dois layouts (desktop e 380 px) e nos dois temas.

#### R1 — Tokens

Tokens de design a partir de uma fonte única. Não muda comportamento.

- [x] Tokens gerados de uma fonte única (`src/theme/tokens.ts` → `virtual:tokens.css`, sem bloco escuro duplicado)
- [x] Todas as famílias de tokens da seção 2 do HANDOFF
- [x] `--space-3` → `--space-4` em todo o CSS, no mesmo commit em que `space-3` passa a valer 12px
- [x] `color-border-control` em todo limite de controle
- [x] `theme-color` claro e escuro
- [x] Constante TS dos breakpoints

**Aceite**: nenhum valor de espaço, raio, opacidade, duração, z-index ou fonte fixo fora de `tokens.css` (lint de CSS ou teste que procura literais); contrastes da seção Contraste do DS 2.0.

#### R2 — Ícones e controles base

Conjunto de ícones e controles novos, com todos os estados. Não muda comportamento.

- [x] Ícones novos em `ui/icons.tsx`
- [x] Button, IconButton, TextField, Select, Choice, Segmented, Tabs e Tooltip com todos os estados
- [x] Densidade do desktop

**Aceite**: prévias do DS 2.0 reproduzidas; foco visível em tudo; 44px no celular.

#### R3 — Canvas

Desenho do canvas lendo os tokens novos. Não muda comportamento.

- [x] `readCanvasTokens` com `cv-*`, `color-card`, opacidades e `--font-sans`
- [x] Renderers sem constantes fixas
- [x] Halo nas linhas
- [x] Etiqueta do nome da marcação selecionada

**Aceite**: testes de canvas atualizados; orçamentos de desempenho estáveis.

#### R4 — Estrutura do editor (desktop)

Barra principal, faixas, janelas de ferramenta, breadcrumbs e barra de status. Muda comportamento.

- [x] Barra principal
- [x] Faixas laterais e inferior
- [x] Contêiner de janelas com redimensionar e recolher (B1, B2)
- [x] Breadcrumbs (B11)
- [x] Barra de status (B8, B13)
- [x] Atalhos (B12): Ctrl+Shift+número como atalho oficial das janelas, Alt+número como extra, e Ctrl (não Cmd) no macOS
- [x] Minimapa (P3)
- [x] Campo de zoom (P4)

As janelas Camadas (atalho 2), Incompletas (5) e Diagnóstico (6) vieram com as fases R6 e R7. Do B12, vieram os atalhos ligados a esta fase (janelas, redimensionar, breadcrumbs, zoom, Ctrl+E, Ctrl+L, F1 e Ctrl+,); Ctrl+B, Alt+N e Alt+Enter vêm com a R5.

**Aceite**: abrir, fechar, redimensionar e persistir cada janela; nenhuma função atual sumiu.

#### R5 — Detalhes

Painel de detalhes (inspetor) redesenhado. Muda comportamento (B14, B15, P5, P6).

- [x] Identidade e PropertyGrid
- [x] LayerGroup recolhível (B15)
- [x] KeyValueGrid, com reordenar pares por arrasto (P6)
- [x] Campos tipados e DataGrid, com reordenar linhas por arrasto (P6)
- [x] ReferenceField e seletor de referência (B14), com filtro por etiqueta (P5)
- [x] Pendências com links para o campo

Os atalhos Ctrl+B (escolher o alvo da referência em foco), Alt+N (nova anotação na camada ativa) e Alt+Enter (novo par ou nova linha) vieram nesta fase, com Alt+Shift+↑/↓ para mover o par ou a linha em foco.

**Aceite**: edição, validação e desfazer iguais aos atuais.

#### R6 — Árvore e Camadas

Árvore e Camadas viram janelas à esquerda. Muda comportamento (B3). No celular as camadas seguiram no diálogo até a R8 (agora, tela cheia).

- [x] Janela Árvore
- [x] Camadas como janela, com paleta em popover e modo "sem anotação" (B3)

**Aceite**: todas as ações do `LayersDialog` disponíveis.

#### R7 — Janela inferior

Lista, Incompletas e Diagnóstico na janela inferior. Muda comportamento (B4, B5, P7).

- [x] Lista em tabela (P7)
- [x] Incompletas (B5)
- [x] Diagnóstico (B4)

**Aceite**: filtros atuais preservados.

#### R8 — Celular

Layout do celular com Painéis, telas cheias e gaveta de três alturas. Muda comportamento (B6, B7).

- [x] Barra de cima
- [x] Barra de baixo com Painéis
- [x] Menu Painéis
- [x] Telas cheias com faixa de abas
- [x] Gaveta com três alturas (B6, B7)

A barra de cima e o menu Painéis substituem o Menu e o diálogo de Camadas do celular; a aba Canvas | Lista e as abas Detalhes | Árvore da gaveta saíram (cada janela abre em tela cheia).

**Aceite**: toda função do desktop alcançável em 380px; gestos de toque mantidos.

#### R9 — Diálogos e tela inicial

Diálogos novos, tela inicial e faixas. Muda comportamento (B9, B10, B16, P8, P10).

- [x] Dialog novo
- [x] Especializações
- [x] Ajuda, com a seção Atalhos (P10)
- [x] Configurações
- [x] Exportar (B16)
- [x] Tela inicial (B10)
- [x] Faixa de preview dispensável na sessão, com o selo PREVIEW permanente (B9, P8)

O que dependia do layout do celular veio com a R8: o Menu do celular deu lugar à barra de cima e ao menu Painéis.

**Aceite**: roteiro 13.9 completo nos dois layouts e temas.

#### R10 — Propostas adiadas

Propostas adiadas, a decidir. Muda comportamento. Fora do caminho crítico: no [`ROADMAP`](docs/ROADMAP.md) ficam em Evoluções.

- [ ] P1 — paleta de comandos
- [ ] P2 — busca global

**Aceite**: uma proposta por PR. (P9 e P11 estão fora do escopo por enquanto.)

> **Ordem e paralelismo**: R1; depois R2 e R3 em paralelo; depois R4; depois R5, R6, R7 e R9 em paralelo (a R9 só depende da R2 e pode começar antes); depois R8; R10 quando decidido.
