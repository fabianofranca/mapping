# Acabamento e guia — 2026-11-06 (épico `epic/acabamento-e-guia`)

## Pendências

- **Cabeçalho da anotação (`AnnotationEditor`):** os botões **Copiar referência** e lixeira passam a um grupo (`.annotation-header-actions`, sem caixa onde tudo cabe). Sem espaço para o campo do nome com o placeholder inteiro, o cabeçalho ganha a classe `is-split` (medida por `useSplitHeader`): a 1ª linha fica com seta, tipo, ajuda, selos, marcas e o grupo de botões à direita; o campo do nome desce inteiro para a 2ª linha (`flex: 1 1 100%`). Só tokens (`--space-1`, `--size-grid-col-min`). Arquivos: `src/theme/panels.css` (`.annotation-header-actions`, `.is-split`), `src/ui/AnnotationEditor.tsx`, `src/ui/useSplitHeader.ts`. Atualizar o `AnnotationEditor` no artefato com uma variante de painel estreito (duas linhas).
- **Cabeçalho de camada (`LayerGroup`):** o selo da especialização cede quase todo o espaço antes do nome (`flex: 0 1000 auto`, antes `0 100 auto`), então o nome só ganha reticências depois de o selo sumir. Arquivo: `src/theme/details.css` (`.layer-group-head .tag`).
- **`Menu`:** o `gap` de `--space-4` saiu do botão do menu (volta ao `--space-1-5` do `.button`); só a entrada com atalho (`.button:has(> .menu-shortcut)`) leva `--space-4`. Arquivo: `src/theme/editor.css` (`.menu-items .button`). Atualizar o `Menu` no artefato.
- **Legenda das marcas (revisão):** passa a vir depois do minimapa no DOM (mesmo `--z-canvas-overlay`), então fica por cima dele. Arquivo: `src/app/Editor.tsx`. Sem mudança de token nem de estilo; ajustar a ordem na prévia do canvas da revisão.
- **Marcação removida na revisão (nome riscado):** o risco deixa de ser o `line-through` do Konva (que usava a cor do texto, `--cv-line`, com `fontSize/15`, e sumia sobre ele) e passa a um traço próprio: linha `--cv-line` de 1,5 px com halo `--cv-halo` de 1 px de cada lado, a 55% da altura do texto e do tamanho dele; na marcação removida **selecionada**, a etiqueta do nome (`--cv-name-tag`) leva o risco também, na cor do texto dela (`--cv-name-tag-text`, 1,5 px). Sem token novo. Arquivos: `src/canvas/renderers/review.ts`, `src/canvas/renderers/overlay.ts`, `src/canvas/renderers/metrics.ts` (`STRIKE_WIDTH`, `STRIKE_HEIGHT`). Atualizar o desenho da marcação removida na prévia do canvas da revisão (nome com risco, normal e selecionada).
- **Aviso "Abra numa janela maior" (`NarrowWindowNotice`) e token novo:** a janela mínima passa de 900 para **900×860**: token novo `size-app-min-height` (860px, ao lado de `size-app-min`) e o aviso vale abaixo de 900 de largura **ou** de 860 de altura; o texto passa a citar os dois números ("O Mapping precisa de uma janela de pelo menos 900 × 860 px…"). Motivo: a legenda das marcas da revisão só cabe inteira com o canvas de 374 px, que pede janela de ~858 px. Arquivos: `src/theme/breakpoints.ts` (`appMinHeight`, `NARROW_QUERY`), `src/theme/tokens.ts`, `src/app/NarrowWindow.tsx`, `src/i18n/`. Registrar o token no artefato e atualizar o texto do aviso e o mínimo de 900×860 nos mockups desktop.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-06: versão 41 (conteúdo) e versão 42 (índice, só com o `lastChange`).

- **`AnnotationEditor` (cabeçalho da anotação):** o DS não tem componente próprio; o cabeçalho vive no `LayerGroup`. O `bundle.css` ganhou `.annotation-header-actions` e `.annotation-header.is-split`, iguais a `src/theme/panels.css`; o guia do `LayerGroup` descreve o grupo de botões e as duas linhas, e a prévia ganhou o cartão "Cabeçalho da anotação: uma linha ou duas" (`height` de 1880 para 2080).
- **`LayerGroup` (selo da especialização):** `.layer-group-head .tag` passou a `flex: 0 1000 auto` no `bundle.css`, e o guia diz que o nome só encolhe depois de o selo sumir.
- **`Menu`:** o `gap` de `space-4` saiu de `.menu-items .button` e só a entrada com atalho (`:has(> .menu-shortcut)`) o leva, no `bundle.css`; o guia foi corrigido.
- **Legenda das marcas (revisão):** o guia do `Minimap` e `Layouts.md` dizem que a legenda fica por cima do minimapa; a prévia do `Minimap` ganhou um cartão com a legenda completa sobre o minimapa num canvas de 374 px (`height` de 350 para 800). Nenhuma prévia do DS desenhava a legenda, então o cartão é novo.
- **`CanvasMarking` (nome riscado da removida):** o cartão "Removida" passou do `line-through` ao risco próprio (1,5 px `--cv-line`, halo `--cv-halo`) e ganhou o cartão "Removida e selecionada" (etiqueta com o nome riscado, `--cv-name-tag-text`); `height` de 1550 para 1680. O guia e `Canvas.md` descrevem o risco (`STRIKE_WIDTH`, `STRIKE_HEIGHT`).
- **Janela mínima 900×860:** `tokens.json` ganhou `size-app-min-height` (860px, logo depois de `size-app-min`, que cita a altura no `usage`); o guia e a prévia do `NarrowWindow`, `Layouts.md` e o `README.md` citam 900×860, e o guia e a prévia trazem o texto novo do aviso.
- **Contraste:** sem impacto (nenhuma cor nova; só tokens existentes).

## Ficou sem gravar

Nada. Fica só a conferência visual, porque nenhuma prévia foi aberta no viewer do DS:

- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência do cartão "Removida" do `CanvasMarking` (largura estimada do risco SVG).
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência do cartão "Removida e selecionada" do `CanvasMarking` (altura do risco na etiqueta).
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência dos cartões novos do `LayerGroup` (`is-split`), nos dois temas e com a altura do cartão.
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência do cartão novo do `Minimap` (legenda sobre o minimapa) e da altura do cartão.
