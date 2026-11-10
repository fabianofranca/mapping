# Acabamento visual — 2026-11-05 (épico `epic/acabamento-visual`)

## Pendências

- **`Menu` (entrada com atalho):** o `kbd.menu-shortcut` vai à direita da entrada (`margin-inline-start: auto`); o espaço mínimo entre rótulo e atalho passa a ser o `gap` do botão (`--space-4`). Antes uma regra de maior especificidade zerava o `auto` e o atalho ficava colado ao rótulo. Só tokens. Arquivo: `src/theme/editor.css` (`.menu-items .button`, `.menu-items .menu-shortcut`). Atualizar a entrada com atalho do `Menu` no artefato.
- **`Tooltip` (posição `end`):** nova posição `placement="end"`: a dica abre à direita do controle, centrada na vertical, e vira para a esquerda se não couber; `IconButton` ganha `tooltipPlacement`. Todos os botões da faixa lateral usam `end`. Arquivos: `src/ui/controls/Tooltip.tsx`, `src/ui/controls/IconButton.tsx`, `src/ui/ToolStrip.tsx`. Documentar a posição no `Tooltip` e a dica da faixa lateral no artefato.
- **Campos de Posição e Tamanho dos Detalhes (`.props-pair`):** com a coluna do valor estreita (container query `props-pair`, até 170 px), X, Y, L e A trocam o respiro lateral (`--space-1`) e o spinner por dígitos, para caberem 5 dígitos; Posição e Tamanho seguem em duas linhas (X e Y; L e A). Nas larguras maiores nada muda. Arquivo: `src/theme/details.css`. Mostrar o painel estreito na prévia de `MarkingPanel`.
- **Cabeçalho de camada (`Flag` e selo):** a flag da camada escondida não encolhe (`flex: none`); o selo encolhe primeiro (`flex: 0 100 auto`), depois o nome (`flex: 0 1 auto`, com `title`). Arquivos: `src/theme/details.css` (`.layer-group-name`, `.layer-group-head .tag`, `.layer-group-head .flag`), `src/ui/AnnotationsPanel.tsx`. Atualizar o `LayerGroup` e o `Flag` no artefato.
- **Canvas — retângulo de seleção (`cv-select`, nota de contraste):** o retângulo do Shift+arrasto ganha o halo `cv-halo` por baixo da borda (traço de `2 + 2·1` px de tela, mesmo tracejado, sem preenchimento), como a seleção e o rascunho. Contraste medido com a função de `tests/theme/contrast.test.ts` (nenhum token novo): tema claro, borda `cv-select` sobre o canvas 2,58:1 (abaixo de 3) e halo composto sobre o canvas 7,24:1, então é o halo que separa o retângulo; tema escuro, borda sobre o canvas 6,08:1. A silhueta passa de 3:1 nos dois temas. Arquivos: `src/canvas/renderers/overlay.ts` (`renderMarquee`), `tests/theme/contrast.test.ts`. Atualizar `Canvas.md` (retângulo de seleção) e a nota de `Contraste.md` sobre `cv-select`.
- **Canvas — camadas:** o palco passa de seis a cinco camadas do Konva: setas e marcações dividem uma (um grupo para cada, a ordem de desenho é a mesma). Sem efeito visual; só se reflete se o `Canvas.md` descrever as camadas. Arquivo: `src/canvas/CanvasController.ts`.
- **Cabeçalho do cartão de anotação (`AnnotationEditor`/`MarkingPanel`):** `.annotation-header` passa a quebrar linha (`flex-wrap: wrap`) e `.annotation-name` a ter base `--size-grid-col-min` (`flex: 1 1`); com o painel estreito e o botão **Copiar referência** (só com pasta), o campo do nome desce para a linha de baixo em vez de ser espremido e estourar a largura. Só tokens. Arquivo: `src/theme/panels.css`. Mostrar o cartão de anotação no painel estreito na prévia de `MarkingPanel`.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-05: versão 37 (conteúdo) e versão 38 (índice, só com o `lastChange`).

- **`bundle.css`:** espelha `editor.css` (atalho do `Menu` à direita, `gap` de `space-4`), `details.css` (container query `props-pair`; cabeçalho de camada: nome `0 1`, selo `0 100`, `Flag` `none`) e `panels.css` (`.annotation-header` com `flex-wrap`, `.annotation-name` com base `size-grid-col-min`). A posição `end` do `Tooltip` não tem CSS: é calculada em JS.
- **Guias:** `Menu`, `Tooltip` (`end`), `IconButton` (`tooltipPlacement`), `ToolStripButton` (dica ao lado), `MarkingPanel` (painel estreito), `LayerGroup` (nome > flag > selo e cabeçalho do cartão de anotação) e `Flag`; `Canvas.md` (halo do retângulo de seleção; setas e marcações dividem uma camada do Konva) e `Contraste.md` (halo composto 7,24:1 no claro; borda 2,58:1 no claro e 6,08:1 no escuro).
- **Prévias:** `Tooltip` (exemplo `end`, `height` de 215 para 310), `MarkingPanel` (card do painel estreito de 280 px, com 5 dígitos e o cabeçalho de anotação quebrando linha) e `LayerGroup` (rótulo do `Flag`).
- **Tokens e contraste:** nenhum token novo; `tokens.json` não mudou. O testador mediu 7,26:1 para o halo na captura; os 7,24:1 são da composição exata.
- **Pendências do app que a gravação revelou:** o `gap` de `space-4` dos menus também alarga o espaço entre ícone e rótulo, e o nome do cabeçalho de camada perde frações de pixel antes de o selo sumir (issue #545). O DS espelha o app como está.

## Ficou sem gravar

Nada deixou de ser gravado. Fica só a conferência visual no viewer do DS:

- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência da prévia do `Tooltip` (exemplo `end`, altura do cartão) nos dois temas.
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência da prévia do `MarkingPanel` (card do painel estreito de 280 px) nos dois temas.
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência da prévia do `LayerGroup` (cabeçalhos estreitos) nos dois temas.
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência da prévia do `Menu` (entrada com atalho), que só foi vista no tema claro.
- Passou para o registro do épico `epic/sincronia-ds-2`: Prévia do `ToolStripButton` com `tooltip-bottom` no HTML estático: sem efeito visual, não é pendência.
