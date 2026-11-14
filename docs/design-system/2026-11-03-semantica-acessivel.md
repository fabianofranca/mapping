# Accessible semantics — 2026-11-03 (épico `epic/semantica-acessivel`)

## Sincronização

Versões 21 (content) and 22 (index) of the artifact. **`Menu`:** the guide and the preview describe the keyboard behavior of `MenuPopover` (`menuitem` items, focus on the first, circular ↑/↓, Esc returns the focus) and the trigger's `aria-haspopup`. **`Revisao.md`, `ReviewHeader`, `ChangePopover`, `DecisionControl`, `ReviewBar`, `ZoomField`:** accessible name `<visible text>: <target>`, state only in `aria-pressed`, conflict in the description; the previews changed only the `aria-label`. **`Segmented`:** the guide describes the Details group; the CSS and the preview were left pending (see Pendências). `Atalhos.md` does not reproduce the label text and did not change.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: `Segmented`, CSS and preview: rules for `.props-value > .segmented` (line wrapping, border per option, `.segmented-text`) in `bundle.css` and an example in a narrow column in the preview.
- Passou para o registro do épico `epic/sincronia-ds-2`: Library Palette (`LibraryPalette`): guide without a component in the DS; already in "With a visible shape and no component in the DS", owner's decision.
