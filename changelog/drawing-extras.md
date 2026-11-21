# Component drawing extras — [Não lançado] (épico `epic/drawing-extras`, PR #TBD, MCP 0.57.0, schema v22)

## Adicionado

- A component's `fill` accepts the `radial` gradient (`center`, `radius`, `stops`; always a circle) and the `angular` gradient (`center`, `angle`, `stops`; a sweep that starts at `angle`, clockwise), literally or as the result of `$switch`/`$if`. The app draws them with Konva's radial fill and the canvas `createConicGradient` (without it, the first stop's color and the `angular-gradient-unsupported` warning).
- The MCP raster (`render_marking`, `render_container` and `get_marking_image`) now paints linear, radial and angular gradients per pixel instead of using the first stop's color; a stroke or a text still use the first color. An MCP before 0.57.0 rejects the new types at their path.
- Component format 4, the specialization format and the project schema (v22) do not change: the new types enter `formatVersion` 4 without bumping it, and a `formatVersion` 1 to 3 component that uses them is `only allowed with formatVersion 4`.
