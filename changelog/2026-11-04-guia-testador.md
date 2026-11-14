# Tester guide and cloud helpers — 2026-11-04 (épico `epic/guia-testador`, PR #508, MCP 0.15.0, schema v13)

## Adicionado

- `connectGuide()` (`scripts/testing/cloud.mjs`): connects to Chrome like `connect()`, but on the guide's tab (`/guia/`), with the same 5 s on actions, 15 s on navigations and the same console log.

- Appendix A of `docs/TESTING.md`, subsection "Selectors and names that mislead": the windows (`data-window`), the `<dialog>` and the `alertdialog`, `button.tree-item`, the coordinates of `page.mouse` (of the viewport, not of the screenshot) and the accessible names that are repeated or differ from the screen ("New container", **Label**, `⚠Idade`, X/Y/Width, the Catalog search, "Review: <proposal>"). A test checks that each listed `data-window` exists in `src/`.
- Step R10.7a (the "screen out of view" variant left R10.7, which went over the step size limit).
- `node scripts/testing/cloud.mjs tempos <apoio>`: prints, by name, the duration from the first `start` to the last `end` of `tempos.log`, and the total; a repeated or missing mark comes out as a warning and a name without a pair, as "tempo não medido". Section 6 of the guide gains the `secao6` marks.

## Alterado

- Full round in 3 blocks: the visual pass leaves block 1 (the `principal` chain, the slowest) and goes to block 2, which has what the standard list opens. The per-script time in the report now comes from the output of `tempos`, with no hand calculation.

## Corrigido

- `selectFolder` opens the read picker ("Selecione uma pasta que este site pode ver", from **Apply folder…**, **Update from folder…** and **Open library**) and handles sibling folders with similar names (`migracao` with `migracao10`): the GTK autocomplete list is now recognized with any number of suggestions, the path field is cleared before typing and the click on **Open** changes spot if the list does not close. If the picker still stays open, the error says "lista de autocompletar aberta (pastas irmãs com o mesmo começo)".
- Tester guide (`docs/TESTING.md`): the setup of R3.8 and R3.8b now also swaps `"containers"` → `"images"` and `"containerId"` → `"imageId"`, like the real v8 and v10 (before, the app rejected the file). A model test builds both as the setup says and checks that the migration accepts them.
- Guide steps that did not match the app: R1.6a (how to close the windows), R1.20 (the name appears from 180 × 100 px on screen), R2.4 to R2.6 (which `Local` is the oldest), R3.1 (Notes version 3, checked by a test), R3.8b and R3.8d (`[open.migration]` is an expected error), R3.11 and R11.4 (no **new** error), R3.14 (which **Components** layer), R7.1 and R7.3 (the `remoteImages` row), R9.9, R9.19, R10.7, R11.10 to R11.12 (reopen the example), R12.4 to R12.10c (click outside the `Bola`, corner handle, minimap, **Fit all**, the plurals "marking(s)" and "container(s)"), R12.20 (`propriedade` and `valor` columns), R13.12 (`data-components` 6 at any zoom), R15.5, R16.1 and R16.8.
