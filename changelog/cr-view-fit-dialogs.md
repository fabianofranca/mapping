# View fit and dialogs fixes — [Não lançado] (epic `epic/cr-view-fit-dialogs`, PR #2307, MCP unchanged, schema unchanged)

## Corrigido

- Fixes from the code review of the view fit and dialogs (#1972).
- `Shift+2` with nothing to fit leaves the key to the browser, and **Fit selection** (button and ⋯ menu item) is disabled when the selection no longer exists.

## Alterado

- Canvas view attributes (CD1): `publishHostAttributes` writes only the `data-*` attributes whose text changed, so pan and zoom no longer rewrite `data-fits`, `data-images`, `data-pins` and the others.
- `round2` is exported by `src/canvas/selectionBox.ts` and shared with `hostAttributes.ts`; new unit tests in `tests/canvas/selectionBox.test.ts`.
- `tests/e2e/viewAttrs.spec.ts` waits for the frame that publishes `data-selection-box`; the appendix A recipe of `docs/TESTING.md` opens the Tree without toggling it and fails with a clear message when nothing is selected.
- `scripts/testing/fiel.mjs` validates its arguments: without the folder, with a folder that has no `components/` or with a `formatVersion` other than `3` or `4` it prints the usage and exits with code 2, writing nothing (`tests/tooling/fielArgs.test.ts`).
