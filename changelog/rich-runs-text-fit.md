# Rich-text runs from a table, inline icons, baseline shift and text that shrinks to fit — [Não lançado] (épico `epic/rich-runs-text-fit`, PR #0, MCP 0.64.0 (minor), schema v24 unchanged, component formatVersion 4 unchanged)

## Adicionado

- A text can shrink its font to fit its width: `font.fit: "shrink"` with the sizes it may take (`fitSizes`) (#2917).
- A rich-text run can move up or down with `baselineShift` (px or a percentage of its size), for `sub` and `sup`; the measurement does not change (#2916).
- A rich-text run can be an icon of the library's set (`{ "icon": … }`), an unbreakable box centered on the line (#2916).
- The app, the viewer and the MCP's PNG draw the inline icon of a rich-text run (#2916).
- Rich-text runs can come from a `table` field: a `runs` item `{ "field", "template" }` gives one run per row, mixed with fixed runs (#2916).
- The test library `tests/fixtures/rich-runs/` (a Decorated text and a Money value) and the test script R51, which checks rich text from a table, inline icons, baseline shift and text that shrinks to fit, in the app and in the MCP's PNG (#2916).

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2768896 para 2785280, pela regra do orçamento; acima dos limites, `bug` #3051 para o dono revisar.
