# View fit and dialogs fixes — [Não lançado] (epic `epic/cr-view-fit-dialogs`, PR #2307, MCP unchanged, schema unchanged)

## Corrigido

- Fixes from the code review of the view fit and dialogs (#1972).

## Alterado

- Canvas view attributes (CD1): `publishHostAttributes` writes only the `data-*` attributes whose text changed, so pan and zoom no longer rewrite `data-fits`, `data-images`, `data-pins` and the others.
- `round2` is exported by `src/canvas/selectionBox.ts` and shared with `hostAttributes.ts`; new unit tests in `tests/canvas/selectionBox.test.ts`.
- `tests/e2e/viewAttrs.spec.ts` waits for the frame that publishes `data-selection-box`; the appendix A recipe of `docs/TESTING.md` opens the Tree without toggling it and fails with a clear message when nothing is selected.
