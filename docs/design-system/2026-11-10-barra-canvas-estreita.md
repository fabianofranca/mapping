# Barra do canvas estreita — 2026-11-10 (épico `epic/barra-canvas-estreita`)

## Pendências

- **`Breadcrumbs`:** na barra do canvas estreita (container query, `max-width: 470px`), o meio do caminho recolhe e aparece o **…** (`ActionMenu` com o ícone `more`, compacto), que abre o menu do caminho inteiro (nome do botão "Mostrar o caminho inteiro", do menu "Caminho inteiro"; o Canvas desabilitado e o último com `aria-current`). Com o **…**, o último trecho perde o ícone, e o Canvas encolhe antes da seleção. Textos novos: `crumbs.showFull` e `crumbs.menu`. Arquivos: `src/ui/Breadcrumbs.tsx`, `src/theme/editor.css`.
- **`ActionMenu`:** props novas `icon` (`more` ou `moreVertical`), `menuLabel` e `className`, e `current` no item (`aria-current`). Arquivo: `src/ui/ActionMenu.tsx`.
- **Barra do canvas:** na revisão estreita (container query, `max-width: 470px`) o `OverflowMenu` (`ActionMenu` com o ícone `more`, compacto, nome "Mais controles" = `editor.moreControls`) fica no fim da barra, antes do zoom, e guarda Conversas, Visualizar, Mostrar no canvas, Enquadrar tudo e Enquadrar seleção, com as mesmas ações e chaves dos botões. Padrão novo de menu de excesso: o botão leva o selo de contagem e o ponto de não lida das conversas (como o `PinsButton`). Para dar letras à seleção, vão justos o vão da barra, o do `.canvas-bar-end` e o botão. O painel **Mostrar no canvas** se ancora no "⋯" quando o botão dele está escondido (`Popover` com `anchor`) e devolve o foco a ele. Arquivos: `src/app/EditorTools.tsx`, `src/app/EditorWindows.tsx`, `src/ui/ViewModePanel.tsx`, `src/ui/Popover.tsx`, `src/theme/editor.css`.
- **`ActionMenu`:** props novas `badge` e `alert` (selo e ponto no botão) e, no item, `checked` (vira `menuitemcheckbox`, com `aria-checked` e o visto) e `shortcut` (à direita). Arquivos: `src/ui/ActionMenu.tsx`, `src/theme/details.css`.
- **`Popover`:** prop nova `anchor` (elemento que ancora o painel no lugar do host). Arquivo: `src/ui/Popover.tsx`.

## Sincronização

Nenhuma gravação feita pelo agente: artefato curado à mão.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Breadcrumbs` na barra estreita, o "…" com o `ActionMenu` e as chaves `crumbs.showFull` e `crumbs.menu`: guia (texto, DS3), `bundle.css` (texto, DS3) e preview (prévia, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ActionMenu`, props `icon`, `menuLabel`, `className` e `current` no item: guia do `Menu` (texto, DS3) e `bundle.css` (texto, DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: barra do canvas estreita na revisão, `OverflowMenu` ("Mais controles") e o painel "Mostrar no canvas" ancorado no "⋯": guias `Breadcrumbs` e `ViewModePanel` (texto, DS3), `bundle.css` (texto, DS3) e previews de `Breadcrumbs` e `Menu` (prévia, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `ActionMenu`, props `badge` e `alert` e, no item, `checked` e `shortcut`: guia do `Menu` (texto, DS3), `bundle.css` (texto, DS3) e preview do `Menu` (prévia, DS5).
- Passou para o registro do épico `epic/sincronia-ds-2`: `Popover`, prop `anchor`: guia do `Menu`, que cobre o `Popover` (texto, DS3).
