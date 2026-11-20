# View fit and dialogs fixes — [Não lançado] (epic `epic/cr-view-fit-dialogs`, PR #2307, MCP unchanged, schema unchanged)

## Corrigido

- Fixes from the code review of the view fit and dialogs (#1972).
- A dialog no longer closes when a drag starts on the backdrop and ends on the content.
- A double click on **Delete** of a conversation deletes once, without a loose error.
- An old draft of a multi-line field no longer comes back after undo.
- `Shift+2` with nothing to fit leaves the key to the browser, and **Fit selection** (button and ⋯ menu item) is disabled when the selection no longer exists.

## Alterado

- `layers.hidden()` returns a stable set while the open perspective's hidden layers do not change (CD3).
- Canvas view attributes (CD1): `publishHostAttributes` writes only the `data-*` attributes whose text changed, so pan and zoom no longer rewrite `data-fits`, `data-images`, `data-pins` and the others.
- `round2` is exported by `src/canvas/selectionBox.ts` and shared with `hostAttributes.ts`; new unit tests in `tests/canvas/selectionBox.test.ts`.
- `tests/e2e/viewAttrs.spec.ts` waits for the frame that publishes `data-selection-box`; the appendix A recipe of `docs/TESTING.md` opens the Tree without toggling it and fails with a clear message when nothing is selected.
- `scripts/testing/fiel.mjs` validates its arguments: without the folder, with a folder that has no `components/` or with a `formatVersion` other than `3` or `4` it prints the usage and exits with code 2, writing nothing (`tests/tooling/fielArgs.test.ts`).
- `CONTAINER_BREAKPOINTS` in `src/theme/breakpoints.ts` names the `@container` thresholds (`170`, `470`/`471`, `640`, `1100`); `tests/theme/tokenLiterals.test.ts` fails on a threshold outside them or an entry no rule uses. The comments of `pwa/buildPlugins.ts` cite `tests/build/pluginOrder.test.ts`.
