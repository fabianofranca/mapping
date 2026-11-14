# Proposal review — 2026-11-09 (epic `epic/revisao-propostas`, PR #1158, MCP 0.28.8, schema v18)

## Adicionado

## Alterado

## Corrigido

- Proposal review: removing an image no longer shows up as a false conflict when the proposal is read from disk (the `parentId`, derived from geometry, no longer takes part in the comparison).
- Updating a specialization whose layer goes away (its typed annotations become free) is no longer announced as "additive": the window shows the layers that become free and `plan_library_update` returns `additive: false` with the `hint` to confirm with the person.
- Proposed view: after a `revise_proposal` on the open review, the components and sources of the proposed package are reread and registered again, without closing and reopening the review.
- Proposal review, level tree: Enter, Space and the arrows on the ✓/✕ buttons of a row now decide (or do nothing) without moving the selection or the focus; the tree keys only apply with focus on it.
- Proposal review: the screen reader announces the selected row of the tree (`aria-activedescendant`, with position and total of the level, also in the virtualized list).
- Proposal review: "Accept the missing one(s)" and "Reject the cause" decide everything in a single write, and the notice's Undo returns all of them to the previous state; an error is reported once.
- Proposal review, image comparison in Slide mode: the handle announces "{N}% of the before" (it was "of the after", which contradicted the crop); `Home` shows only the after and `End` only the before. Overlay mode is still "of the after".
- Proposal review: the "The agent revised…" notice (and the changed-proposal one) no longer stays on screen after opening the review from the Proposals window; opening the review removes all notices of that proposal from the queue.
- Proposal review: the Details title no longer breaks in the middle of a word at 900×720 (the buttons drop to the line below).
- Proposal review, image comparison in Slide mode: the handle appears whole with the divider at 0% and at 100%, instead of cut in half.
- Proposal review: the "Apply is blocked" notice for a marking without an image says "depends on an image that is not in the project", without the internal code.
- Proposal review: the Summary column of the list shows all three counters at 900×720 (the counters are more compact and the name column gives up space).
- Proposal review, Compare dialog: "Accept the replacement" and "Reject the replacement" stay in the dialog's fixed footer, with no need to scroll the body.
