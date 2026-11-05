# Acabamento e guia — [Não lançado] (épico `epic/acabamento-e-guia`)

## Pendências

- **Cabeçalho da anotação (`AnnotationEditor`):** os botões **Copiar referência** e lixeira passam a um grupo (`.annotation-header-actions`, sem caixa onde tudo cabe). Sem espaço para o campo do nome com o placeholder inteiro, o cabeçalho ganha a classe `is-split` (medida por `useSplitHeader`): a 1ª linha fica com seta, tipo, ajuda, selos, marcas e o grupo de botões à direita; o campo do nome desce inteiro para a 2ª linha (`flex: 1 1 100%`). Só tokens (`--space-1`, `--size-grid-col-min`). Arquivos: `src/theme/panels.css` (`.annotation-header-actions`, `.is-split`), `src/ui/AnnotationEditor.tsx`, `src/ui/useSplitHeader.ts`. Atualizar o `AnnotationEditor` no artefato com uma variante de painel estreito (duas linhas).
- **Cabeçalho de camada (`LayerGroup`):** o selo da especialização cede quase todo o espaço antes do nome (`flex: 0 1000 auto`, antes `0 100 auto`), então o nome só ganha reticências depois de o selo sumir. Arquivo: `src/theme/details.css` (`.layer-group-head .tag`).
- **`Menu`:** o `gap` de `--space-4` saiu do botão do menu (volta ao `--space-1-5` do `.button`); só a entrada com atalho (`.button:has(> .menu-shortcut)`) leva `--space-4`. Arquivo: `src/theme/editor.css` (`.menu-items .button`). Atualizar o `Menu` no artefato.
- **Legenda das marcas (revisão):** passa a vir depois do minimapa no DOM (mesmo `--z-canvas-overlay`), então fica por cima dele. Arquivo: `src/app/Editor.tsx`. Sem mudança de token nem de estilo; ajustar a ordem na prévia do canvas da revisão.
