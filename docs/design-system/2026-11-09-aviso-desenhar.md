# Aviso do modo Desenhar na barra do canvas — 2026-11-09 (épico `epic/aviso-desenhar`)

## Pendências

- **`Breadcrumbs`** (guia): o estado vazio mostra a dica do modo Desenhar (`editor.drawHint`) no lugar de "Nada selecionado" quando o modo é Desenhar, sem seleção, projeto não trancado e com container à vista; encolhe com reticências e leva `title` com o texto inteiro.
- **Avisos do canvas** (seção): a dica do Desenhar deixa de ser um aviso sobre o canvas (`.canvas-hint` removido de `.canvas-overlay`); os demais avisos ficam.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-09, no fechamento do épico (versão 67; o índice junto, com `lastChange`):

- `Breadcrumbs` (guia): o estado vazio com a dica do modo Desenhar no lugar de "Nada selecionado" (condição, reticências, `title`, `drawHintVisible`) e os testes citados.
- `Breadcrumbs` (prévia): dois cartões, a dica do Desenhar e a dica encolhida com reticências a 150 px.
- `Layouts.md`: a linha "Barra do canvas" cita a dica. A linha do canvas ("avisos empilhados no topo") não mudou: os demais avisos ficam.
- `project/design-system.json`: só o `lastChange`.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: conferência das prévias de `Breadcrumbs` (dica do Desenhar e dica encolhida) nos temas claro e escuro (DS5), com `.crumbs-empty` completa e a morta `.canvas-hint` retirada do `bundle.css` (DS3).
