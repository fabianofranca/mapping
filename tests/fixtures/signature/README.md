# Hand-written signature sheets (stage #1079)

Fixtures of the importer tests (`tests/model/signatures/`, `tests/mcp/planSignatureImport.test.ts`) and of the "Import the signature" script of `docs/TESTING.md`. No personal data; `source.extractor: "agent"` (hand-written, as is done for sources without an extractor).

- `button.compose.json`: a Compose `Button` with `colors` (factory) and `contentPadding` (`PaddingValues`).
- `button.compose.changed.json`: the same sheet after a change (`contentPadding` leaves, `elevation` enters, the default of `enabled` becomes `false`).
- `profile-card.swiftui.json`: a SwiftUI view with an external label (`badge`) and a positional parameter.
- `button.figma.json`: a Figma component (`Style` VARIANT, `Disabled` BOOLEAN, `Label` TEXT, `Icon` INSTANCE_SWAP).
- `swift/`: the SwiftUI views of the `swift` extractor (`ProfileCard.swift`: explicit `init` with labels, `_`, enum, `@ViewBuilder`, `@State` and `@Environment`; `Tag.swift`: memberwise; `Chip.swift`: three `init`s, one `deprecated`), with `ProfileCard.expected.json` and `Tag.expected.json` (the expected sheet, `--ref fixture`). No personal data.
- `figma/`: `button.nodes.json`, the synthetic response of `GET /v1/files/:key/nodes` with the `COMPONENT_SET` `12:34` (`Style` VARIANT, `Disabled#1:2` BOOLEAN, `Label#1:3` TEXT, `Icon#1:4` INSTANCE_SWAP), and `button.expected.json`.
- `kotlin/`: the `@Composable` functions of the `kotlin` extractor (`Button.kt`, `AppBar.kt`, `Switch.kt`).
- `library/lib.spec.json`: a small test library (`formatVersion` 16) with `fieldModels.compose`, the `surface` type (colors), the `button` (`style` field) and the `profile-card` (new type).
