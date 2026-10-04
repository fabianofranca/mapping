# Redesign da interface — passagem para implementação

Documento de passagem do redesenho feito com o Claude Design. É a referência para as fases de implementação; o `PLAN.md` aponta para cá.

| Fonte                                      | Endereço                                          | O que tem                                                                                                       |
| ------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Canvas “Mapeador — Redesign”               | https://claude.ai/artifact/F5cJUBA5wHycHNBHPyhCk5 | Entrega 1 (editor no desktop), Entrega 2 (11 telas e 6 estados, desktop e celular, claro e escuro)              |
| Design system **Mapeador de Imagens 2.0**  | https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9 | Tokens completos, 23 componentes com estados, 60 ícones, seções Canvas, Layouts, Atalhos, Contraste e Propostas |
| Design system **Mapeador de Imagens** (v1) | https://claude.ai/artifact/RG34r7Pt4RDnVWfZDofssS | Retrato do estado atual (commit `351fe9b`), base deste comparativo                                              |

Os artifacts são privados: só abrem para quem tiver acesso compartilhado pelo dono.

**Regras que continuam valendo** (CLAUDE.md): um único `dist/index.html` que funciona em `file://`; nenhuma fonte, imagem ou requisição externa; `src/model/` sem APIs de navegador; toda mutação por action do store; estado do projeto separado do estado da UI; nenhuma string fixa (pt-BR e en-US); nenhuma cor fixa; Konva só em `src/canvas/`; um gesto = uma entrada de desfazer; desktop primeiro e utilizável em 380px com toque.

---

## 1. Correspondência entre componentes atuais e novos

“DS 2.0” é o nome do componente no design system novo; as classes de referência estão em `components/bundle.css` dele (prefixo `mp-`). A implementação pode manter os nomes de classe atuais, desde que siga os tokens e estados.

### Estrutura do editor

| Atual (arquivo · classe)                            | Novo (DS 2.0)                                                              | O que muda                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/EditorTopBar.tsx` · `.topbar.editor-bar`       | Barra principal (40px)                                                     | Fechar sai da barra e vai para o menu do projeto (▾ no nome); estado de salvamento vai para a barra de status; entram Especializações, Ajuda e Configurações como botões; Lista e Texto no canvas saem da barra (Lista vira janela; Texto e Enquadrar vão para os breadcrumbs) |
| `app/EditorTools.tsx` · `.toolbar`                  | Grupo de ferramentas da barra principal                                    | Ícones novos de 16px; atalhos nos `title` e dicas                                                                                                                                                                                                                              |
| `ui/ToolButton.tsx` · `.tool-button`                | IconButton                                                                 | 28px no desktop (44px no celular); hover, pressionado e desabilitado novos                                                                                                                                                                                                     |
| —                                                   | ToolStripButton (faixas esquerda e direita)                                | **Novo**                                                                                                                                                                                                                                                                       |
| `app/EditorPanel.tsx` · `.side-panel`               | ToolWindow “Detalhes” (direita, 360px)                                     | Redimensionável e recolhível; sem as abas Detalhes \| Árvore (a Árvore vira janela própria)                                                                                                                                                                                    |
| `ui/PanelTabs.tsx` · `.tabs .tab`                   | Tabs (janela inferior) e faixa de abas do celular                          | Sublinhado de 2px (3px no celular), hover                                                                                                                                                                                                                                      |
| `ui/MarkingTree.tsx` · `.tree .tree-item`           | ToolWindow “Árvore de marcações” + TreeRow                                 | Janela à esquerda; linhas de 28px; bolinhas das camadas na linha; ações Localizar e Recolher tudo                                                                                                                                                                              |
| `ui/LayersDialog.tsx` · `.layer-list .layer-item`   | ToolWindow “Camadas” + TreeRow + popover de paleta                         | Deixa de ser diálogo: janela à esquerda, embaixo da Árvore; renomear na linha; paleta em popover; modo “sem anotação” no rodapé                                                                                                                                                |
| `ui/ListView.tsx` · `.list-pane .list-marking`      | ToolWindow “Lista” (inferior) + DataGrid                                   | Deixa de ser painel lateral de 320px; tabela Marcação \| Camada \| Anotação \| Conteúdo (proposta P7)                                                                                                                                                                          |
| filtro “Só incompletas” da `ListView`               | ToolWindow “Incompletas” (inferior)                                        | **Nova janela**: pendências agrupadas por imagem; o filtro da Lista continua                                                                                                                                                                                                   |
| `ui/DiagnosticsDialog.tsx`                          | ToolWindow “Diagnóstico” (inferior)                                        | Deixa de ser diálogo: registro em tabela, Copiar e Limpar no cabeçalho, ponto de alerta na faixa                                                                                                                                                                               |
| `ui/SaveStatus.tsx` · `.status`                     | StatusBar (item de salvamento)                                             | Vai para a barra de status com Salvo (`color-success`), Salvando…, Erro + Tentar de novo                                                                                                                                                                                       |
| —                                                   | Breadcrumbs                                                                | **Novo** (acima do canvas)                                                                                                                                                                                                                                                     |
| —                                                   | StatusBar (seleção, cursor, zoom, schema, canal)                           | **Novo**                                                                                                                                                                                                                                                                       |
| `app/CanvasNotices.tsx` · `.canvas-overlay .notice` | Notice sobre o canvas                                                      | Centralizado, até 460px, com ação; erro ao salvar ganha aviso com “Tentar de novo”                                                                                                                                                                                             |
| `ui/PreviewBanner.tsx` · `.preview-banner`          | Selo PREVIEW na barra + canal na barra de status + `mp-banner` dispensável | Ver B9                                                                                                                                                                                                                                                                         |
| `ui/UpdateBanner.tsx` · `.update-banner`            | `mp-banner` (mesmo padrão da faixa)                                        | Visual: raio e cores dos tokens                                                                                                                                                                                                                                                |

### Detalhes (inspetor)

| Atual                                                     | Novo                                              | O que muda                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ui/SelectionPanel.tsx` · `.panel-details .panel-name`    | Bloco de identidade + PropertyGrid                | Nome 15px, caminho, ID mono com copiar no mesmo bloco                                                          |
| `ui/MarkingPanel.tsx` · `.rect-fields`                    | Seção “Marcação” recolhível + PropertyGrid        | Grade de 2 colunas (rótulo 92px); Posição e Tamanho em pares X/Y e L/A                                         |
| `ui/IdField.tsx` · `.id-field`                            | Botão “M2 ⧉” no bloco de identidade               | Visual                                                                                                         |
| `ui/MarkingColorField.tsx` · `.palette`                   | Grupo de rádios de cor (Tema + 8)                 | Visual; alvos de 24px (44px no celular)                                                                        |
| `ui/AnnotationsPanel.tsx` · `.layer-section`              | LayerGroup                                        | Grupo com borda e faixa de 3px na cor da camada, recolhível, resumo quando recolhido                           |
| `ui/AnnotationEditor.tsx` · `.annotation .entries .entry` | KeyValueGrid                                      | Grade em tabela com edição na célula, menu ⋯ por linha e alça de arraste (P6); celular: cartões                |
| `.field-check` (Aplicar às filhas)                        | Choice                                            | Corrige o empilhamento (rótulo na mesma linha)                                                                 |
| `ui/TypedFields.tsx` · `.typed-field .typed-options`      | PropertyGrid + Segmented + Select                 | Rótulo na coluna da esquerda; enum ≤3 segmentado, >3 select; inválido também em select/data/segmentado         |
| `ui/TypedFields.tsx` · `.typed-table .typed-row`          | DataGrid                                          | Coluna # numerada, ações por linha; celular: um cartão por linha                                               |
| `ui/TypedFields.tsx` · `.ref-field .ref-picker`           | ReferenceField + seletor “ir para símbolo”        | Popup de 600px no topo, sem fundo escurecido, filtro por etiqueta (P5), atalhos no rodapé; celular: tela cheia |
| `.issues`                                                 | Notice de pendências                              | Cada motivo é link para o campo                                                                                |
| `.inherited`                                              | Caixa de herdadas (LayerGroup)                    | Visual                                                                                                         |
| `.backlinks`                                              | Linha “Referências recebidas”                     | Visual                                                                                                         |
| `ui/AnnotationSummary.tsx` · `.mini-table`                | Resumo no cabeçalho recolhido / DataGrid na Lista | Visual                                                                                                         |

### Celular

| Atual                                    | Novo                                          | O que muda                                                                           |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ui/BottomSheet.tsx` · `.sheet`          | BottomSheet                                   | Três alturas (64px, 72%, tela cheia) com botão de tela cheia; só Detalhes (sem abas) |
| `app/EditorBottomBar.tsx` · `.bottombar` | Barra de ferramentas de baixo                 | Acrescenta “Painéis”                                                                 |
| `.viewtabs` (Canvas \| Lista)            | Menu Painéis + telas cheias com faixa de abas | Ver B6                                                                               |
| `.canvas-float` (botão T)                | Botão T flutuante + pílula de zoom            | Visual (pílula é P4)                                                                 |
| Menu (`.menu-actions`)                   | Menu ⋯ “Painéis e ações”                      | Reúne janelas e ações do projeto                                                     |

### Diálogos e telas

| Atual                                               | Novo                                                    | O que muda                                                          |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `ui/Dialog.tsx` · `.dialog`                         | Dialog                                                  | Cabeçalho de 44px com fechar, rodapé com borda; celular: tela cheia |
| `ui/SpecsDialog.tsx`                                | Dialog “Especializações” (560px)                        | Aviso de sucesso com `color-success`                                |
| `ui/SpecHelpDialog.tsx` · `.help .help-toc`         | Dialog “Ajuda” (820px) com índice lateral e busca       | Índice vira navegação lateral; nova seção Atalhos (P10)             |
| `ui/SettingsBar.tsx` · `.settings`                  | Dialog “Configurações”                                  | Tema em segmentado; link para atalhos                               |
| `app/ExportDialog.tsx`                              | Dialog                                                  | Visual                                                              |
| `app/Home.tsx` · `.home .action-card .project-item` | Tela inicial nova                                       | Ver B10                                                             |
| `ui/InstallHint.tsx` · `.install-hint`              | Cartão na coluna lateral (desktop) e na lista (celular) | Visual                                                              |
| `ui/icons.tsx` (14 ícones, 24px, traço 2)           | Grupo Icons do DS 2.0 (60 ícones, 16px, traço 1.25)     | Conjunto novo, original; `currentColor`                             |

### Canvas (`src/canvas/`)

| Atual                                          | Novo                                                                                       | O que muda                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `theme.ts` · `readCanvasTokens` (8 cores)      | Lê também `cv-*`, `color-card`, `opacity-*` e `--font-sans`                                | `marking` sai; entram `line`, `halo`, `select`, `invalid`, `warning` (canvas), `nameTag`, `card`, opacidades e família de fonte |
| `renderers/markings.ts`                        | Linha `cv-line` + halo por fora e por dentro; selecionada `cv-select` com etiqueta do nome | Ver seção Canvas do DS 2.0                                                                                                      |
| `renderers/overlay.ts` (alças, rascunho, pego) | `size-handle` 10px (14px no toque), `cv-invalid`, `shadow-grabbed`                         | Constantes viram tokens                                                                                                         |
| `renderers/semanticCard.ts`                    | `color-card`, `radius-md`, `t-cv-card`/`t-cv-caption`                                      | Raio 6px vira token; fonte da app                                                                                               |
| `renderers/images.ts`, `metrics.ts`            | Tamanhos dos tokens; carregando com indicador                                              | Constantes viram tokens                                                                                                         |

---

## 2. Tokens: antigos e novos

Os nomes de cor continuam `--color-*` (o código já usa). O bloco escuro duplicado de `tokens.css` passa a ser gerado de um só lugar (sugestão: um mixin no CSS ou `apply.ts` escrevendo as duas regras a partir de um objeto TS em `src/theme/`). Valores completos e usos: `tokens.json` do DS 2.0.

### Cores que existiam

| Token v1            | Claro v1 → 2.0            | Escuro v1 → 2.0          | Observação                                                                               |
| ------------------- | ------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `color-bg`          | `#f6f7f9` =               | `#12151a` =              | —                                                                                        |
| `color-canvas-bg`   | `#e4e7eb` =               | `#0b0d11` =              | —                                                                                        |
| `color-surface`     | `#ffffff` =               | `#1c2027` =              | —                                                                                        |
| `color-text`        | `#1b1f24` =               | `#e8eaed` =              | —                                                                                        |
| `color-text-muted`  | `#5b6470` =               | `#9aa3ad` =              | —                                                                                        |
| `color-border`      | `#d3d8de` → `#dfe3e8`     | `#343b45` → `#2c323b`    | **Muda de papel**: só divisória. O limite de controle passa a ser `color-border-control` |
| `color-accent`      | `#1e6fe0` → **`#1a63cc`** | `#5b9bff` =              | Corrige 4,45:1 sobre bg                                                                  |
| `color-accent-text` | `#ffffff` =               | `#0b1220` =              | —                                                                                        |
| `color-marking`     | `#2b2f36` → **removido**  | `#d5d9df` → **removido** | Substituído por `cv-line` + `cv-halo`                                                    |
| `color-danger`      | `#c62828` =               | `#ff8a80` =              | —                                                                                        |
| `color-danger-bg`   | `#fdecea` =               | `#3b1d1d` =              | —                                                                                        |
| `color-warning`     | `#8a5a00` =               | `#ffd27a` =              | —                                                                                        |
| `color-warning-bg`  | `#fff4d6` =               | `#3a2f14` =              | —                                                                                        |
| `color-backdrop`    | `rgba(0,0,0,.45)` =       | `rgba(0,0,0,.6)` =       | —                                                                                        |

### Cores novas

| Token                     | Claro                   | Escuro                | Uso                                                |
| ------------------------- | ----------------------- | --------------------- | -------------------------------------------------- |
| `color-border-control`    | `#7d8590`               | `#6b7480`             | Borda de campos, botões, segmentados, selos (≥3:1) |
| `color-hover`             | `#eef1f4`               | `#262b33`             | Hover                                              |
| `color-pressed`           | `#e3e7ec`               | `#2f353f`             | Pressionado                                        |
| `color-accent-hover`      | `#1757b5`               | `#7aaeff`             | Hover do primário e da alternância ligada          |
| `color-accent-pressed`    | `#134a99`               | `#9cc3ff`             | Primário pressionado                               |
| `color-focus`             | = `color-accent`        | = `color-accent`      | Anel de foco                                       |
| `color-selection`         | `#dce8fb`               | `#1f3354`             | Linha selecionada, célula em edição                |
| `color-selection-muted`   | `#eceff3`               | `#2a2f38`             | Seleção sem foco, camada ativa, esqueleto          |
| `color-success` / `-bg`   | `#1e7a46` / `#e3f4ea`   | `#7ad3a0` / `#163325` | Salvo, operação concluída                          |
| `color-tooltip` / `-text` | `#1b1f24` / `#ffffff`   | `#e8eaed` / `#12151a` | Dica                                               |
| `color-card`              | `rgba(255,255,255,.92)` | `rgba(28,32,39,.92)`  | Cartão do zoom semântico                           |
| `cv-line`                 | `#ffffff`               | =                     | Linha da marcação                                  |
| `cv-halo`                 | `rgba(10,12,16,.72)`    | =                     | Contorno de linhas, nomes, bolinhas e ⚠ no canvas  |
| `cv-select`               | `#4d8dff`               | =                     | Seleção, alças, rascunho, alvo de soltar           |
| `cv-invalid`              | `#ff6b6b`               | =                     | Gesto inválido                                     |
| `cv-warning`              | `#ffc247`               | =                     | ⚠ no canvas                                        |
| `cv-name-tag`             | = `cv-select`           | =                     | Etiqueta do nome selecionado                       |
| `layer-01`…`layer-10`     | ver tabela              | =                     | Paleta padrão de camadas (dado, não tema)          |

### Paleta de camadas (`src/model/layers.ts`)

A paleta é dado do projeto, então a troca só vale para camadas **novas**; camadas existentes mantêm a cor salva. `src/model/` continua sem depender de CSS: a lista de hex fica em `layers.ts`, espelhando os tokens.

| Posição | v1        | 2.0                | Nível  |
| ------- | --------- | ------------------ | ------ |
| 1       | `#E53935` | `#d32f2f` vermelho | escuro |
| 2       | `#FB8C00` | `#1e88e5` azul     | claro  |
| 3       | `#FDD835` | `#2e7d32` verde    | escuro |
| 4       | `#43A047` | `#e65100` laranja  | claro  |
| 5       | `#00ACC1` | `#7e57c2` violeta  | escuro |
| 6       | `#1E88E5` | `#a07800` ocre     | médio  |
| 7       | `#5E35B1` | `#00838f` petróleo | médio  |
| 8       | `#D81B60` | `#d81b60` magenta  | escuro |
| 9       | `#6D4C41` | `#8d6e63` marrom   | médio  |
| 10      | `#546E7A` | `#607d8b` ardósia  | médio  |

As 8 cores de linha por imagem (`src/model/images.ts`) não mudam; ganham o halo no desenho.

### Espaço, raio e alvos

| v1                  | 2.0                                                                                                | Observação                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `space-1` 4px       | `space-1` 4px                                                                                      | =                                                                                                                                              |
| `space-2` 8px       | `space-2` 8px                                                                                      | =                                                                                                                                              |
| `space-3` **16px**  | `space-4` 16px                                                                                     | **Renomeado.** `space-3` passa a valer 12px. Trocar todos os `var(--space-3)` por `var(--space-4)` no mesmo commit em que o token é redefinido |
| —                   | `space-0.5` 2px, `space-1.5` 6px, `space-3` 12px, `space-6` 24px, `space-8` 32px                   | Cobrem os valores fixos listados em Inconsistências (2px, 6px, 10px, 12px)                                                                     |
| `radius` 8px        | `radius-sm` 4 · `radius-md` 6 · `radius-lg` 8 · `radius-xs` 2 · `radius-xl` 12 · `radius-full` 999 | `radius` some; desktop usa `radius-sm` nos controles                                                                                           |
| `touch-target` 44px | `size-touch` 44px                                                                                  | Renomeado                                                                                                                                      |
| 24px e 22px fixos   | `size-target-min` 24px                                                                             | Unifica                                                                                                                                        |

### Famílias novas

| Família     | Tokens                                                                                                                                                                                                                                                                                                                                | Substitui                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fonte       | `--font-sans`, `--font-mono`                                                                                                                                                                                                                                                                                                          | Pilhas em `base.css:7-12` e `dialogs.css:87`; Konva sem `fontFamily`                                                         |
| Tipografia  | `t-display` 20/28, `t-title` 15/22, `t-heading` 13/20 600, `t-body` 13/20, `t-small`/`t-label` 12/16, `t-micro` 11/16, `t-m-*` (celular), `t-cv-*` (canvas), `t-code`, `t-kbd`                                                                                                                                                        | 0.75–1.1rem espalhados; base de 16px vira 13px no desktop e 14px no celular                                                  |
| Tamanhos    | `size-control` 24, `size-control-lg` 28, `size-row` 28, `size-toolbar` 40, `size-tw-header` 32, `size-statusbar` 26, `size-stripe` 40, `size-icon` 16/20, `size-handle` 10/14, `size-tw-left/right/bottom`, `size-canvas-min`, `size-resize-hit`, `size-label-col`, `size-dialog*`, `size-sheet-peek`, `size-m-bar`, `size-m-toolbar` | 320px, 720px, 480px, 50dvh e afins fixos                                                                                     |
| Breakpoints | `bp-mobile-max` 899, `bp-desktop` 900, `bp-compact` 1199, `bp-design` 1440, `bp-mobile-design` 380                                                                                                                                                                                                                                    | 900 em três lugares e 1199 em `layout.css` (media queries não aceitam `var()`: usar uma constante TS única e o valor no CSS) |
| Opacidades  | `opacity-disabled` .45, `-dimmed` .35, `-ancestor` .75, `-inherited` .7, `-hidden-layer` .6, `-card` .92, `-grabbed` .25, `-halo` .72                                                                                                                                                                                                 | 0.5, 0.85, 0.35, 0.75, 0.7, 0.88, 0.25, 0.8 fixos                                                                            |
| Durações    | `duration-instant` 0, `-fast` 100ms, `-base` 160ms, `-slow` 240ms, `easing-standard`                                                                                                                                                                                                                                                  | 0.15s fixo                                                                                                                   |
| Z-index     | `z-canvas` 0 … `z-banner` 80 (9 níveis)                                                                                                                                                                                                                                                                                               | `z-index: 10` e `1` fixos                                                                                                    |
| Sombras     | `shadow-popup`, `shadow-sheet`, `shadow-grabbed`                                                                                                                                                                                                                                                                                      | Só a sombra do item pego existia                                                                                             |

Também: `theme-color` do `index.html` e do manifest passa a seguir `color-accent` do claro (`#1a63cc`), com um `<meta name="theme-color" media="(prefers-color-scheme: dark)">` para o escuro.

---

## 3. Mudanças propostas

### 3.1 Mudanças de comportamento

Cada item muda o que o usuário faz ou onde encontra algo. Todas precisam de chaves novas em `pt-BR.ts` e `en-US.ts`.

| #   | Mudança                                         | Detalhe                                                                                                                                                                                                                   | Estado novo                                          |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| B1  | Janelas de ferramenta                           | Árvore e Camadas à esquerda, Detalhes à direita, Lista/Incompletas/Diagnóstico embaixo; abrem pelas faixas e por Ctrl+Shift+número (Alt+número como atalho extra); Shift+Esc esconde                                      | UI: janelas abertas, aba inferior ativa              |
| B2  | Redimensionar janelas                           | Arrastar a borda (área de 8px), duplo clique volta ao padrão, Ctrl+Shift+setas; limites da seção Layouts; canvas ≥320px; abaixo de 1200px Detalhes começa recolhido                                                       | UI: larguras/alturas em `localStorage` (try/catch)   |
| B3  | Camadas vira janela                             | Sai do diálogo; renomear na linha; paleta em popover; modo “sem anotação” no rodapé (o chip da barra continua abrindo/focando a janela)                                                                                   | —                                                    |
| B4  | Diagnóstico vira janela                         | Sai do Menu/diálogo; ponto vermelho na faixa quando há erro novo                                                                                                                                                          | UI: “visto até”                                      |
| B5  | Janela Incompletas                              | Lista dedicada de pendências agrupadas por imagem, com “Só camadas visíveis”; clicar leva à anotação                                                                                                                      | Derivado em `store/derived.ts`                       |
| B6  | Celular: Painéis e telas cheias                 | A aba Canvas \| Lista sai; o botão Painéis (barra de baixo) e o ⋯ (barra de cima) abrem um menu com as seis janelas e as ações; cada janela abre em tela cheia com faixa de abas                                          | —                                                    |
| B7  | Celular: gaveta com três alturas                | Recolhida (64px), aberta (72%), tela cheia; a gaveta mostra só Detalhes (a Árvore vira janela)                                                                                                                            | UI: altura da gaveta                                 |
| B8  | Barra de status                                 | Salvamento, destino, não exportado, seleção, cursor em px da imagem, zoom, schema, canal; o estado de salvamento sai da barra do topo                                                                                     | Cursor: valor de UI vindo do canvas, fora do projeto |
| B9  | Faixa de preview                                | Selo PREVIEW permanente na barra e canal na barra de status; a faixa aparece e pode ser dispensada na sessão (proposta P8)                                                                                                | UI: dispensada nesta sessão                          |
| B10 | Tela inicial nova                               | Desktop: coluna lateral (Projetos, Ajuda, Configurações, instalar) e tabela de recentes com origem, busca e “Abrir”; celular: três botões grandes, Abrir pasta desabilitado com motivo                                    | —                                                    |
| B11 | Breadcrumbs                                     | Clicar num nível seleciona o item; Alt+↑ / Alt+↓                                                                                                                                                                          | —                                                    |
| B12 | Atalhos novos                                   | Lista completa na seção Atalhos do DS 2.0 (Ctrl+Shift+número oficial; Alt+número extra, só onde o navegador não o interceptar; no macOS, Ctrl e não Cmd; Ctrl+B, Alt+N, Alt+Enter, Shift+Esc, Ctrl+E, Ctrl+L, F1, Ctrl+,) | `app/shortcuts.ts`                                   |
| B13 | Erro ao salvar visível                          | Aviso sobre o canvas com “Tentar de novo”, além da barra de status                                                                                                                                                        | —                                                    |
| B14 | Seletor de referência                           | Popup no topo (desktop) em vez de diálogo; Ctrl+Enter escolhe e vai até o alvo; Esc devolve o foco ao campo                                                                                                               | —                                                    |
| B15 | Detalhes recolhíveis                            | Seções (Marcação, cada camada, cada anotação) recolhem e mostram resumo                                                                                                                                                   | UI: seções recolhidas por camada                     |
| B16 | Especializações, Ajuda e Configurações na barra | Saem do Menu (que deixa de existir no desktop); Fechar e Exportar ficam no menu do projeto e em Exportar                                                                                                                  | —                                                    |

Propostas novas (seção Propostas do DS 2.0), com as decisões da seção 5: aprovadas P3, P4, P5, P6, P7, P8 e P10 (encaixadas nas fases da seção 4); adiadas para a R10 P1 e P2; fora do escopo por enquanto P9 e P11. P3–P8 e P10 aparecem nos mockups.

### 3.2 Mudanças puramente visuais

Não mudam o que o usuário faz, só a aparência:

- Tokens novos e corrigidos (seção 2), inclusive contraste AA em bordas, destaque e paleta.
- Densidade: base de 13px e linhas de 28px no desktop; 14px e 44px no celular.
- Estados completos (hover, pressionado, foco, desabilitado, selecionado, inválido, somente leitura) em todos os controles; inválido também em select, data e segmentado; desabilitado também em campos.
- Rótulo de caixa de seleção e rádio na mesma linha (corrige `.field-check`).
- Grade de propriedades de duas colunas; tabela tipada como grade de dados; pares como grade.
- Conjunto de 60 ícones originais de 16px.
- Canvas: linha com halo, etiqueta do nome selecionado, fonte da app no Konva, cartão a 92%, alças de 10px no desktop.
- Raios, sombras de popups, banners com raio do token, tooltip com atalho.
- Paleta padrão das camadas novas (camadas existentes mantêm a cor).

---

## 4. Ordem sugerida de implementação

Cada fase é um PR, com o roteiro da 13.9 e os testes verdes. As fases R1 a R10 estão no `PLAN.md`, na etapa 2.3 (as fases 26–28 da etapa 2.2 vieram antes).

| Fase                               | Escopo                                                                                                                                                                                                                                             | Comportamento muda?    | Aceite                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 · Tokens                        | `tokens.css` gerado de uma fonte única (sem bloco duplicado); todas as famílias da seção 2; `--space-3` → `--space-4` em todo o CSS; `color-border-control` em todo limite de controle; `theme-color` claro e escuro; constante TS dos breakpoints | Não                    | Nenhum valor de espaço, raio, opacidade, duração, z-index ou fonte fixo fora de `tokens.css` (lint de CSS ou teste que procura literais); contrastes da seção Contraste |
| R2 · Ícones e controles base       | Ícones novos em `ui/icons.tsx`; Button, IconButton, TextField, Select, Choice, Segmented, Tabs, Tooltip com todos os estados; densidade do desktop                                                                                                 | Não                    | Prévias do DS 2.0 reproduzidas; foco visível em tudo; 44px no celular                                                                                                   |
| R3 · Canvas                        | `readCanvasTokens` com `cv-*`, `color-card`, opacidades e `--font-sans`; renderers sem constantes; halo; etiqueta do nome                                                                                                                          | Não                    | Testes de canvas atualizados; orçamentos de desempenho estáveis                                                                                                         |
| R4 · Estrutura do editor (desktop) | Barra principal, faixas, contêiner de janelas com redimensionar e recolher (B1, B2), breadcrumbs (B11), barra de status (B8, B13), atalhos (B12, ver seção 5), minimapa (P3), campo de zoom (P4)                                                   | Sim                    | Abrir, fechar, redimensionar e persistir cada janela; nenhuma função atual sumiu                                                                                        |
| R5 · Detalhes                      | Identidade, PropertyGrid, LayerGroup recolhível (B15), KeyValueGrid, campos tipados, DataGrid, ReferenceField e seletor (B14) com filtro por etiqueta (P5), reordenar pares e linhas por arrasto (P6), pendências com links                        | Sim (B14, B15, P5, P6) | Edição, validação e desfazer iguais aos atuais                                                                                                                          |
| R6 · Árvore e Camadas              | Janela Árvore; Camadas como janela com paleta e modo (B3)                                                                                                                                                                                          | Sim                    | Todas as ações do `LayersDialog` disponíveis                                                                                                                            |
| R7 · Janela inferior               | Lista em tabela (P7), Incompletas (B5), Diagnóstico (B4)                                                                                                                                                                                           | Sim                    | Filtros atuais preservados                                                                                                                                              |
| R8 · Celular                       | Barra de cima, barra de baixo com Painéis, menu Painéis, telas cheias com faixa de abas, gaveta com três alturas (B6, B7)                                                                                                                          | Sim                    | Toda função do desktop alcançável em 380px; gestos de toque mantidos                                                                                                    |
| R9 · Diálogos e tela inicial       | Dialog novo, Especializações, Ajuda com seção Atalhos (P10), Configurações, Exportar (B16); tela inicial (B10); faixa de preview dispensável (B9, P8)                                                                                              | Sim                    | Roteiro 13.9 completo nos dois layouts e temas                                                                                                                          |
| R10 · Propostas adiadas            | P1 (paleta de comandos), P2 (busca global), quando decidido                                                                                                                                                                                        | Sim                    | Uma proposta por PR                                                                                                                                                     |

R1 a R3 são refatorações visuais e podem seguir a regra da etapa 2.2 (sem mudança de comportamento). A partir de R4, cada PR lista no “Como testar” as mudanças B# e P# que entrega. Ordem e paralelismo: R1; R2 e R3 em paralelo; R4; R5, R6, R7 e R9 em paralelo (a R9 só depende da R2); R8; R10 quando decidido.

---

## 5. Decisões

1. **Atalhos das janelas:** **Ctrl+Shift+número** é o atalho oficial (o que aparece em dicas, menus e na ajuda). **Alt+número** fica como atalho extra, registrado só onde o navegador não o intercepta (no Linux, por exemplo, o Chrome usa Alt+número para trocar de aba). No macOS, usar **Ctrl**, não Cmd (Cmd+Shift+3/4/5 tira print da tela). Isso vale para B1 e B12 e para a seção Atalhos da Ajuda (P10); o Ctrl+Shift+setas do B2 segue a mesma regra.
2. **Faixa de preview (B9):** adotado o **selo PREVIEW permanente** na barra e o canal na barra de status, mais a **faixa dispensável na sessão** (P8).
3. **Propostas:**
   - **Aprovadas:** P3 (minimapa), P4 (campo de zoom), P5 (filtro por etiqueta no seletor), P6 (reordenar pares e linhas por arrasto), P7 (Lista em tabela), P8 (faixa de preview dispensável) e P10 (seção Atalhos na Ajuda).
   - **Adiadas para a R10:** P1 (paleta de comandos) e P2 (busca global).
   - **Fora do escopo por enquanto:** P9 (arrastar janelas entre faixas) e P11 (navegação por teclado no canvas).
4. **Espaçamento:** aceita a escala em múltiplos de 4; `space-3` passa a valer 12px e todos os `var(--space-3)` atuais viram `var(--space-4)` **no mesmo commit da R1**.

## 6. Riscos e cuidados

- **Desempenho:** a barra de status mostra o cursor; atualize-o fora do signal do projeto e no máximo uma vez por quadro, para não repetir o achado P1 da etapa 2.2. Janelas recolhidas não devem montar o conteúdo.
- **Estado da UI:** tamanhos, janelas abertas, seções recolhidas e “faixa dispensada” ficam fora do histórico de desfazer e fora do `mapping.json`.
- **i18n:** rótulos da barra principal e das faixas precisam caber com +30% em en-US; abaixo de 1200px os botões com texto viram só ícone.
- **`file://`:** o seletor de referência e as janelas não podem depender de APIs ausentes em `file://`; `localStorage` com try/catch.
- **Testes e2e:** os seletores do Playwright que dependem de `.side-panel`, `.viewtabs`, `LayersDialog` e do Menu vão quebrar em R4–R9; atualizar no mesmo PR.
