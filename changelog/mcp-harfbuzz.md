# The MCP server shapes text with HarfBuzz — [Não lançado] (épico `epic/mcp-harfbuzz`, PR #2398, MCP 0.51.0, schema v22 unchanged)

## Alterado

- The MCP server measures and draws text with HarfBuzz, so library fonts are shaped like in the browser (contextual alternates, every GPOS lookup, the variable weight, the spacing without ligatures). Sizes measured with a library font can change by fractions of a pixel, towards the app's (#2121).
- `opentype.js` leaves the server and the bundle: measuring, drawing, the ascent and descent and the capital height come from the HarfBuzz face, and a `.woff` library font is read like its `.ttf`. Every embedded-font number and raster stays the same, except where the font kerns a pair that `opentype.js` did not apply (`AV`, `To`, `Ty`, `Ti` in Mapping Sans): the pair is a little narrower, as in Chromium (the default "Title" of the Material 3 `top-app-bar` is 0.82 px narrower at 22 px) (#2121).
- The pruning of GSUB subtables and the "substitutions off" fallback of #2089 are gone: HarfBuzz applies every lookup. What stays is the last resort: a text whose shaping throws is measured and drawn with the embedded font, and `validate_library` warns about a font the server cannot lay out (a corrupt file, or no `head`/`hhea` table or no code point); the `.woff2` is still not read (#2121).
- Removed: the two "skipped substitution" warnings of `validate_library` (`without <n> substitution subtable(s) it cannot apply (…)` and `without any glyph substitution`) (#2121).

