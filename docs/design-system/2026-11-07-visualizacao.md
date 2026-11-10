# Visualização — 2026-11-07 (épico `epic/visualizacao`)

## Pendências

### VZ1 — sem a camada ativa

- `Tags`: sai o "Chip da camada ativa" (`EditorMainBar`).
- `LayersPanel`: saem o ✓ (Tornar ativa) e a linha ativa (`layer-row-active`); a caixa de visibilidade nunca fica desabilitada.
- `LayerGroup`: sai o selo "ativa".
- `Details`/`AnnotationsPanel`: sai o botão "+ Anotação" do topo da seção; entra o estado vazio "Todas as camadas estão escondidas." com o botão **Mostrar todas** (`.annotations-all-hidden`).
- `ListView`: a caixa de visibilidade de camada não fica mais desabilitada.
- Ícone `check` continua (a revisão usa). Tokens: nenhum novo.

### VZ3 — botão Visualizar e painel Mostrar no canvas

- `Botão Visualizar` (`ViewModeButton`): `IconButton` com ícone `eye` e `aria-pressed`, no lugar do Ver limpo (`eyeOff`), na barra do canvas.
- `IconButton` **Mostrar no canvas** (ícone `layers`, `aria-haspopup="dialog"`): só habilitado no modo; gatilho do popover.
- Popover `ViewModePanel` (`.view-panel-popover`): título e frase, grupo **Elementos** com `Choice` (a dica de **Setas** em `choice-hint`), grupo **Camadas com desenho** com `Choice` e a bolinha da camada (`.layer-dot` com `--layer-color`), rodapé com dois `Button` `sm` (**Mostrar tudo**, **Só as telas**). Foco entra no primeiro controle e volta ao botão ao fechar.
- Barra de status: item do modo (ícone `eye` + "Modo visualização: só para ver. Esc ou Alt+H sai.").
- Token novo: `size-view-panel` (280px, largura do painel). Ícones novos: nenhum.

### VZ4 — correção dos achados do testador

- `Tooltip`/`IconButton`: prop nova `suppressed`/`tooltipSuppressed` (a dica fica escondida, como após o Esc); o Visualizar a usa com o painel aberto, para a dica não cobrir o painel.
- `ViewModePanel`: ao fechar, o foco volta ao Visualizar (painel aberto ao ligar o modo) ou ao **Mostrar no canvas** (painel aberto por ele). `AnnotationsPanel` (`.annotations`) ganha `tabindex="-1"` para receber o foco depois de **Mostrar todas**. Tokens e ícones: nenhum.

## Sincronização

Versões 49 (conteúdo) e 50 (índice) do artefato, de 2026-11-07. **`ViewModePanel` (novo):** guia e preview do painel "Mostrar no canvas" e dos gatilhos Visualizar e Mostrar no canvas, em três estados da barra e quatro do painel. **`Breadcrumbs`, `IconButton`, `Tooltip`, `StatusBar`:** o Visualizar (`eye`) no lugar do Ver limpo, `tooltipSuppressed`/`suppressed` e o item do modo na barra de status. **Sem camada ativa:** `Tags`, `LayerGroup`, `DataGrid` e `Choice` perderam o chip, o ✓, a linha realçada, o "+ Anotação" do topo e a caixa desabilitada; `LayerGroup` ganhou o estado "Todas as camadas estão escondidas." com Mostrar todas; `MarkingPanel`, `ArrowPanel`, `ToolWindow` e `HelpDialog` só trocaram trechos dos previews. **`Atalhos.md`:** Alt+H vira "Visualizar" e sai o Alt+N. **`tokens.json`:** `size-view-panel` (280px). Contraste conferido por valor de token nos dois temas; os previews não foram abertos num navegador.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: classes `.view-panel-*` e `.annotations-all-hidden` no `bundle.css` e retirada das mortas `.layer-chip`, `.layer-chip-name` e `.layer-row-active` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: conferência das alturas `@dsCard` estimadas das prévias alteradas ou novas (DS4: `IconButton`, `ToolWindow`; DS5: as demais).
- Passou para o registro do épico `epic/sincronia-ds-2`: o que o canvas desenha no modo visualização, em `Canvas.md` (e o "Ver limpo" que sobrou em `Canvas.md`, `Layouts.md` e `README.md`) (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: contagem de ícones do `README.md` do DS (86 para 92) e a de componentes e tokens, que é só do `docs/DESIGN-SYSTEM.md` (DS3).
