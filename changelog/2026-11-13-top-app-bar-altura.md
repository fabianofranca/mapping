# Top app bar is born with the style's height — 2026-11-13 (épico `epic/top-app-bar-altura`, PR #1793, MCP 0.39.0, schema v19)

## Alterado

- Verified: the Material 3 Top app bar created without a rectangle (Palette, Catalog and the MCP's `create_marking`) is already born with the style's height (64 in `small`, 112 in `medium`, 152 in `large`), as #898 delivered; the width stays tied to the available area (360 in the phone container). The Row and the button created right below it do not become its children. New tests guard the behavior (model, store and MCP) and step R9.4 of the script now says Height 64 and the Row's "Belongs to".
- Fixed in the script: step R9.22 of `docs/TESTING.md` now describes what the app actually does, and the test `tests/tooling/testingGuideR922.test.ts` guards it.
