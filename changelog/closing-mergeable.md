# Closing brings main in when the epic PR cannot merge — [Não lançado] (épico `epic/closing-mergeable`, PR #2489, MCP unchanged, schema v22 unchanged)

## Corrigido

- For whoever runs the queue: the closing of a stage in `implementar-fila` now brings `main` into the epic (merge, never rebase) whenever `git merge-tree --write-tree origin/main HEAD` reports a conflict or `main` is not an ancestor of the epic, not only when the MCP version caught up, so the epic PR no longer ends up `mergeable_state: dirty` with no CI run. The "Reading CI" of `docs/FLOW.md` gains a **No run on the commit** rule: with no CI run on the current commit ~10 min after the push, a session reads the PR's `mergeable_state` and, with `dirty`, brings the base in and pushes; a session that ends without a CI run on its PR notifies the coordinator with the reason instead of ending silently. A `tests/tooling` text test keeps the three rules.
