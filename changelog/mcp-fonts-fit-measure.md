# MCP fonts with unsupported GSUB, `fit_marking` and `measure_component` — [Não lançado] (épico `epic/mcp-fonts-fit-measure`, PR #2255, MCP 0.47.0, schema v20)

## Adicionado

- `validate_library` warns about each library font (`.ttf`, `.otf` or `.woff`) that the MCP server cannot use as it is, with `file` = the specialization file and `path` = `fonts[<i>].file`: the glyph-substitution subtables it skips (`lookup type 6 format 2 ×1, …`), a font whose substitutions it turns off altogether, or a font it cannot lay out (the embedded font applies). The library stays valid, project reads stay silent and the app is not affected. A font does not need to be cut by hand any more: ship the designers' original file (#2089).

## Corrigido

- A library font with GSUB subtables the server cannot apply (chaining context formats 1 and 2, alternate substitution: Inter and Citrina have them) no longer breaks the project reads. Before, `get_project`, `plan_changes`, `propose_changes` and the renders failed with `internal-error` (`substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet supported`). Now the server skips, in memory, the subtables `opentype.js` cannot apply, checks the font with a sample text when it loads, and guards every layout: a font that still fails loses its substitutions, and one that fails even then gives way to the embedded font. The supported substitutions (single, multiple, ligature, context and chaining format 3) still apply; the alternates the server skips are not drawn by it (#2089).
