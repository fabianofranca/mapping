# "The component does not fit" notice with the wide word — 2026-11-12 (epic `epic/aviso-nao-cabe-pai-none`, PR #1746, MCP 0.38.1 provisional, schema v19)

## Corrigido

- A word wider than the text box now warns `texto maior que a caixa: <nó>` in the app (pending item "The component does not fit", with the ⚠ on the marking) and in the MCP (`component-overflow` with `kind: "text"` in `plan_changes` and `propose_changes`), in any `formatVersion`. This is the case of the `button` "Salvar" at 58 × 40 and of the narrow `extended-fab` ("Novo" at 50 × 56, "Confirmar compra" at 60 × 56): before, only the text height was checked and the button did not warn. The drawing does not change; the text still breaks only between words, as in CSS. Text with `maxLines` or `ellipsis` does not warn, and in rich text (`runs`) the notice applies to a span or chip wider than the box.
- The wide-word notice also applies to the label with a space in `wrap: none` (the line is the whole paragraph and went past the box without warning, unlike the same text in `runs`), to a word separated by a tab (the break is only on a space) and to emoji or CJK wider than 1em, which the width shortcut hid.
- `material3-compose` library: the `separador` (":") of the `time-picker` carries `maxLines: 1` in the `font`, which removes a false positive of the approximate measure, without changing the drawing (the `version` stays 10).
- A `hug` grid whose measures with two limits (300 and 150) give the same total with different track counts (#1692) is proven by a test, in both orders in which a `hug` parent measures it; the engine did not need to change.
- The notice "Only the first shadow applies to this node…" is back in the Catalog and the viewer: a text, path or image with more than one outer shadow or with `spread` shows the notice (the rectangle, the ellipse and the frame draw the whole list, without a notice). The MCP PNG stays the same.
- The arrow between the parameter and the value, in the code section of the Catalog, now comes from `t()` (before it was in the CSS, outside the translation).

## Alterado

- `component-overflow`: `kind: "text"` now also applies to the word wider than the box (`docs/MCP.md`, `docs/COMPONENT-FORMAT.md`, `docs/AGENT-GUIDE.md` and the `spec-author` skill). MCP 0.38.1 brings the updated agent guide.
- Internal cleanups with no change in drawing: `strokeAlignInset` and `spreadRadius` live in one place (`strokeSides.ts`) and the duplicates in Konva, the raster and the outline with a gap are removed; the test-only shadow attributes and the `slotCache` that never hit are removed. The `customEnds` of the justified PNG is proven by a test.
- Test scripts: R9.11 now expects the notice on the two 58-wide buttons, and R17.40 carries an `update_marking` of `d1` to 96 × 40 before the `update_container`, so that `plan_changes` without `density` keeps producing no `component-overflow`.
