# Rich-text runs from a table, inline icons, baseline shift and text that shrinks to fit — [Não lançado] (épico `epic/rich-runs-text-fit`, PR #0, MCP 0.63.0 (minor), schema v24 unchanged, component formatVersion 4 unchanged)

## Adicionado

- A text can shrink its font to fit its width: `font.fit: "shrink"` with the sizes it may take (`fitSizes`) (#2917).
- A rich-text run can move up or down with `baselineShift` (px or a percentage of its size), for `sub` and `sup`; the measurement does not change (#2916).
- A rich-text run can be an icon of the library's set (`{ "icon": … }`), an unbreakable box centered on the line (#2916).
- The app, the viewer and the MCP's PNG draw the inline icon of a rich-text run (#2916).
