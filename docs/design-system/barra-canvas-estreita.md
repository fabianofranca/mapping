# Barra do canvas estreita — [Não lançado] (épico `epic/barra-canvas-estreita`)

## Pendências

- **`Breadcrumbs`:** na barra do canvas estreita (container query, `max-width: 470px`), o meio do caminho recolhe e aparece o **…** (`ActionMenu` com o ícone `more`, compacto), que abre o menu do caminho inteiro (nome do botão "Mostrar o caminho inteiro", do menu "Caminho inteiro"; o Canvas desabilitado e o último com `aria-current`). Com o **…**, o último trecho perde o ícone, e o Canvas encolhe antes da seleção. Textos novos: `crumbs.showFull` e `crumbs.menu`. Arquivos: `src/ui/Breadcrumbs.tsx`, `src/theme/editor.css`.
- **`ActionMenu`:** props novas `icon` (`more` ou `moreVertical`), `menuLabel` e `className`, e `current` no item (`aria-current`). Arquivo: `src/ui/ActionMenu.tsx`.
