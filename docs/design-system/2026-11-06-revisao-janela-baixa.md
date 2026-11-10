# Revisão em janelas baixas — 2026-11-06 (épico `epic/revisao-janela-baixa`)

## Pendências

- **Filtros da revisão (`ReviewLevels`, `ReviewFilters`):** os filtros viram uma linha só com o botão **Filtros** (`Button` `sm`, ícone `filter`, `aria-haspopup="dialog"` e `aria-expanded`); com filtro ativo o rótulo é "Filtros · N" (N = grupos ativos entre decisão, tipos, imagem, camada e Só conflitos) e ao lado ficam o "N de M" e o **Limpar filtros**. Os controles de antes (decisão, chips de tipo, imagem, camada, Só conflitos) vão num `Popover` (`role="dialog"`, nome "Filtros da revisão", classe `review-filters-panel`: coluna, `--space-2` de espaço, `--space-3` de preenchimento, largura máxima de 20 × `--space-6`). Escolher não fecha o painel. Textos novos: `review.filtersButton` e `review.filtersButtonCount`. Arquivos: `src/ui/review/ReviewLevels.tsx`, `src/theme/review.css` (`.review-filters`, `.review-filters-panel`), `src/i18n/review.ts`. Atualizar o `ReviewLevels` no artefato (guia e prévia: linha de filtros recolhida, e o estado aberto do popover).
- **Token `size-tw-bottom-review`:** de 344px para **240px** (3 linhas de 28 px da lista, o cabeçalho, os filtros recolhidos e o rodapé de atalhos a 900 px de largura). Arquivo: `src/theme/tokens.ts`. Atualizar o valor no `tokens.json` e a altura da janela inferior da revisão nos mockups.
- **Legenda das marcas (revisão):** deixa de ser `position: absolute` dentro do canvas e passa a `position: fixed`, ancorada no canto superior esquerdo do canvas, com a largura limitada à coluna dele e a altura até o topo da barra de status; pode cobrir a janela Propostas e o minimapa. Camada: `--z-popover` (acima das janelas, abaixo de `--z-tooltip`). As medidas chegam por variáveis CSS (`--legend-top`, `--legend-left`, `--legend-width`, `--legend-room`) escritas pelo `ReviewLegend`. Sem token novo. Arquivos: `src/ui/review/ReviewCanvasControls.tsx`, `src/theme/review.css` (`.review-legend`). Atualizar o guia e a prévia do `Minimap` (a legenda cobrindo a janela inferior quando o canvas é baixo).

- **Janela mínima (`size-app-min-height`) e aviso "Abra numa janela maior":** o token passa de 860px para **720px** (`src/theme/tokens.ts`, vindo de `BREAKPOINTS.appMinHeight`); o aviso (`NarrowWindowNotice`, texto `narrow.body`) lê o valor e passa a dizer "900 × 720". Atualizar o valor no `tokens.json` e o número na prévia do aviso.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-06, no fechamento do épico (versão `1793937636-5db9`; o índice por último, com `lastChange`):

- `project/tokens.json`: `size-tw-bottom-review` de 344px para **240px** e `size-app-min-height` de 860px para **720px**, com os `usage` reescritos; o `usage` de `z-popover` passou a citar a legenda das marcas.
- `project/components/bundle.css`: `.review-legend` (`position: fixed`, variáveis `--legend-*`, `z-index: var(--z-popover)`) e a regra nova `.review-filters-panel`.
- `ReviewRow` (guia e prévia): a linha de filtros recolhida (**Filtros**, **Filtros · N**, "Mostrando N de M", **Limpar filtros**) e o painel aberto, em três cartões. Os filtros não têm componente próprio no Mapa.
- `Minimap` (guia e prévia): a legenda das marcas ancorada, que desce por cima da Propostas e do minimapa quando o canvas é baixo (dois cartões: canvas alto e canvas baixo).
- `NarrowWindow` (guia e prévia): 900×720.
- `project/README.md` (princípio 1 e "Empilhamento"), `project/Layouts.md` e `project/Revisao.md` (um item em "Regras de comportamento", além das pendências).
- `project/design-system.json`: só o `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: a conferência das alturas dos cartões novos de `ReviewRow` (1440) e `Minimap` (1340) no visualizador real.
- Passou para o registro do épico `epic/sincronia-ds-2`: a conferência de contraste dos cartões novos (a legenda ancorada e o painel de filtros usam só pares já cobertos em `Contraste.md`).
