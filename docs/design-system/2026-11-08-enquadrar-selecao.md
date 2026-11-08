# Enquadrar a seleção e o Card que mudou de lugar no R25 — 2026-11-08 (épico `epic/enquadrar-selecao`)

## Pendências

- **`Breadcrumbs` (controles à direita da barra do canvas):** botão novo **Enquadrar seleção** (`FitSelectionButton`, `IconButton` com o ícone `fit-selection`), logo depois do **Enquadrar tudo**; rótulo "Enquadrar seleção" / "Fit selection", dica com o atalho `Shift+2`, desabilitado sem seleção e no modo visualização. Só tokens. Arquivos: `src/app/EditorTools.tsx`, `src/app/EditorWindows.tsx`. Mostrar o botão (habilitado e desabilitado) ao lado do **Enquadrar tudo** na prévia dos controles do canvas.
- **Ícones:** `fit-selection` novo em `src/ui/icons.tsx`, no traço do `fit` (quatro cantos) com um quadrado pequeno no centro. Acrescentar ao conjunto de ícones do artefato.
- **`Atalhos.md` / `HelpDialog`:** linha nova no grupo **Zoom**, "Enquadrar a seleção" / "Fit the selection", `Shift+2` (`src/ui/shortcutList.ts`).

## Sincronização

Gravado no artefato Mapping do Claude Design em 2026-11-08 (índice `project/design-system.json`, versão 62, `lastChange` por Claude via claude):

- **Ícone `fit-selection`:** asset novo `fit-selection.svg` (o `fit` com o quadrado central), no grupo `Icons` do índice, logo depois de `fit.svg`; `project/assets/Icons/README.md` passa a dizer 90 ícones e cita o novo.
- **`Breadcrumbs`:** botão **Enquadrar seleção** logo depois de **Enquadrar tudo** na prévia (habilitado com seleção, desabilitado no modo visualização, `aria-keyshortcuts="Shift+2"`) e no `README.md` do componente (`FitSelectionButton` em "No código").
- **`Atalhos.md`:** linha "Enquadrar a seleção | Shift+2" na tabela do grupo "Ver" (o app o chama de "Zoom"); **`HelpDialog`:** a mesma linha na prévia.

Só tokens e classes que já existiam; as prévias não foram renderizadas no navegador.

## Ficou sem gravar

Nada. (Não conferi o contraste das prévias nos temas claro e escuro: o botão e o ícone usam só tokens e `currentColor`.)
