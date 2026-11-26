# Library format gaps — [Não lançado] (épico `epic/library-gaps`, PR #0, MCP 0.60.0, schema v24 unchanged)

## Adicionado

- One color reader in the model (`parseFormatColor`, `isFormatColor`): the MCP PNG (`render_container`, `render_marking`, `get_marking_image`) now paints `hsl()` and `hsla()` like the app (hue in `deg`, `grad`, `rad` or `turn`).
- A literal color that the format does not know (`"banana"`, `red`) in a component or in the icons file is now a warning, never a refusal: `component.colorUnknown` and `iconsFile.colorUnknown`, at the path of the value, in `validate_library` and when a package is applied. Expressions and token values are not checked.
- `examples/libraries/library-gaps` (LG1: the `hsl-swatch` type).

## Alterado

- `docs/COMPONENT-FORMAT.md`, "Known limits": the `filter.grayscale` line now says what a named color does (the app and the viewer draw it, the PNG does not paint it, the validator warns).
