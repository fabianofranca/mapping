# Visualização — [Não lançado] (épico `epic/visualizacao`)

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

## Ficou sem gravar
