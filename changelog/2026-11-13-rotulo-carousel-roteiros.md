# Readable Carousel label and aligned scripts — 2026-11-13 (épico `epic/rotulo-carousel-roteiros`, PR #1828, MCP 0.39.1 unchanged, schema v19)

## Alterado

- Library `material3-compose` (version 13, additive, no migration): the scrim under the `carousel` label becomes a bottom-to-top gradient, from `scrim` with `alpha` 0.55 (solid in the bottom 36 px, where the label line sits) to 0 at the top. The 0.55 is the library's choice, not Compose's. The drawing of every carousel with a label changes; no field changes.
- For whoever runs the tests: the `%@` commands of an R17 line (R17.19, R17.21, R17.41 and R17.42) carry a 1 px black border and the expected values follow ImageMagick 6.9.12 (the cloud's); R17.42 cites the app's correct reserved color (`CCC8CE` in light and `48474C` in dark); R10.13 now expects what the Gallery shows (the frame scrolls to the **Profile**); R3, R9.23 and A18 follow the new version (chain `mat-v14` to `mat-v17`).

## Corrigido

- The Material 3 Carousel label is readable over the image's reserved color (contrast of at least 4.5:1, previously about 1.6:1), in the app, in the Catalog and in the MCP's PNG (which now shows the scrim, a solid 0.55 strip).
- New script R17.47: checks the readable label in the PNG of `render_marking` (`575658`) and in the app (`202022`), with the contrast calculated.
- The **Fields** table of the Catalog (820 px dialog) fits without horizontal scrolling: the Label column wraps between words and the Description is no longer cut off, with "enum" and names such as `preferredItemWidth` whole.
