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

- As pendências acima (guias `Breadcrumbs`, `ActionMenu`, `Popover` e a barra do canvas), para aplicar à mão no artefato.
