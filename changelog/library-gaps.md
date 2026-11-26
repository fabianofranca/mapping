# Library format gaps — [Não lançado] (épico `epic/library-gaps`, PR #0, MCP 0.60.0, schema v24 unchanged)

## Adicionado

- One color reader in the model (`parseFormatColor`, `isFormatColor`): the MCP PNG (`render_container`, `render_marking`, `get_marking_image`) now paints `hsl()` and `hsla()` like the app (hue in `deg`, `grad`, `rad` or `turn`).
- A literal color that the format does not know (`"banana"`, `red`) in a component or in the icons file is now a warning, never a refusal: `component.colorUnknown` and `iconsFile.colorUnknown`, at the path of the value, in `validate_library` and when a package is applied. Expressions and token values are not checked.
- `examples/libraries/library-gaps` (LG1: the `hsl-swatch` type).
- Icons file (`mapping-icons`) `formatVersion` 4: a path `fill` may be a gradient (`linear` with `angle` or `from` and `to`, `radial`, `angular`, literal-color `stops`) and an icon may carry a `clip` (`{ d, fillRule? }`, in `viewBox` units). In the scene, the icon group carries `clipPath { d, fillRule, transform }`. The app and the MCP PNG paint the gradient.
- A gradient or a `clip` in a `formatVersion` 1 to 3 icons file is `only allowed with formatVersion 4` (`iconsFile.v4Only`), and the version message is now `formatVersion: must be 1, 2, 3 or 4`. `import_icons` keeps the file's version and never writes a gradient or a `clip`.
- `examples/libraries/library-gaps`: the `brand-badge` type (a gradient and a clip in the icon; the specialization is `formatVersion` 15).

## Alterado

- `docs/TESTING.md`, R27.3: the icons file now uses `formatVersion` 5 to provoke `must be 1, 2, 3 or 4`.
- `docs/COMPONENT-FORMAT.md`, "Known limits": the `filter.grayscale` line now says what a named color does (the app and the viewer draw it, the PNG does not paint it, the validator warns).
