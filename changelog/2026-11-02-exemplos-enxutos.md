# Lean examples — 2026-11-02 (epic `epic/exemplos-enxutos`, PR #273, MCP 0.12.0, schema v13)

## Adicionado

- Every feature of the specialization and component formats has an example, preferably in the ready-made libraries in `libraries/`; a test (`tests/examples/featureCoverage.test.ts`) fails if a new schema feature is left without an example. The only exception is `fonts[].style` (`italic` and `normal`): the font is fixed in the mobile client, outside SDUI.
- **Backend SDUI** example library (`examples/libraries/sdui-backend/`, 6 types and 5 components): a fictional external system that describes screens, with the executable origin (`origins`, `sources`, the example screen in the gallery) and `migrations`. Script R10 gained the origin steps.
- `examples/README.md`: guide to the examples, with a section for each library in `libraries/` and each example in `examples/`, the scripts that use them and the "Where to see each feature" table; a test requires one section per example on disk.

## Alterado

- The example project (`examples/exemplo-completo.zip`), the interactive guide, `proposta-componentes.zip` and the scripts (R3, R9, R10, R12, R13 and R15) use the **Material 3 (Compose)** library in place of the old 15-type package. The example project zip grew (289,104 bytes, was 64,988).
- The **Open example project** button and the embedded zip left the app, because embedding the zip would take `dist/index.html` to 1,868,223 bytes, above the 1.5 MiB budget: Help and the guide direct people to download `examples/exemplo-completo.zip` from the repository and open it as a zip.
- `examples/libraries/` is left with only `analytics` and `sdui-backend`; the 15-type `material3`, `pessoas` and `examples/specs/biblioteca.json` left, and so did the generator (`npm run build:examples`). The tests now read frozen copies in `tests/fixtures/`.
- Script R8.1b now opens its own copy of the Store from `proposta-exemplo.zip`, without depending on R4; texts of scripts R9, R10, R13 and R15 fixed after the two Cowork rounds.

## Corrigido

- Diagnostics › Remote images: when the same URL changes status (from "address not accepted" to "origin not allowed" to "failed to load"), the row swaps the reason in place, instead of keeping the old reason.
- The multi-line text editor strips the trailing line break on save: a remote image's `url` no longer goes to `mapping.json` with `\n` when confirmed with Enter.
