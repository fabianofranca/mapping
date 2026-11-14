# Tester leftovers — 2026-11-13 (epic `epic/sobras-do-testador`, PR #1845, MCP unchanged, schema v19)

## Alterado

- The tester prompt (`docs/TESTING-NUVEM.md`) goes back to the wording from before PR #1709, with the ceiling rising from 32,000 to 32,500 characters (`testingGuide.test.ts` and `contextUsage.test.ts`); the "Contexto até 300 mil" paragraph and item 5 of the Delivery, with `; contexto <mil> mil`, stay as they are.
- `cloud.mjs tempos`: the marks of a name that alternate `start`, `end`, `start`, `end` (the `ambiente` when `cloud-up.sh` runs twice) add up the spans, count the `run`s inside them and give no repeated-mark warning; two `start`s or two `end`s in a row still give the warning.
- `docs/TESTING.md`: R18.4 gives the selector of the popover (`.change-popover [aria-label^="Aviso "]`) and R18.4 and R19.27a say where **Accept all** is below 1200 px (in the **Bulk** menu).
- `docs/TESTING-NUVEM-CONSULTA.md`: the "Histórico dos blocos" carries the current sizes of the guides and the bases and the cost and context baseline of the lean flow (#1543 and retests), with the 300k criterion; the "Passada visual" says that horizontal scrolling of the Catalog table frame is not a failure, but that of the page or the window is.
- The DS records of the `Container`, `RefCell` and `ReferenceField` previews move to `docs/design-system/sobras-do-testador.md`.

## Corrigido

- Catalog Palette at 900×720: the name of each type appears in full (it wraps onto lines) and the **Add to canvas** button is no longer cut off, dropping to the next line when it does not fit beside the name.
- Catalog: the tables of the component document no longer split short words in the middle ("enu/m", "strin/g") and the names in the list, such as `LazyVerticalGrid` and `HorizontalPager`, do not split in the narrow window; the table frame scrolls horizontally.
- Tree and Details at 900×720: window title, Tree labels and layer name cut off with ellipses get a tooltip with the full text, and "No annotations in this layer." becomes a note below the layer header, with no cut-off.
