# Scale tests — 2026-11-08 (épico `epic/testes-escala`, PR #1072, MCP 0.28.5, schema v18)

## Adicionado

- `npm run test:scale` measures the same model operation with 1,250 and 5,000 markings and requires the time to grow less than 5× (quadratic growth would be ~16×); it runs in CI after the performance budgets. The next phase added the session (save and open), the derived editor state, the in-process MCP read tools (`get_project`, `list_markings`, `get_marking`, `get_annotation`, `find_by_code`, `find_by_source`, `list_threads`) and the viewer (building the scene and updating an instance), up to 5,000 markings. No change in how the app or the MCP tools are used.

## Alterado

- CI now proves linear growth for the large project, up to 5,000 markings: reading, saving, validating, building the list, the derived state, the MCP queries and the viewer must grow less than 5× when the project grows 4×. The MCP version goes up to 0.28.5 because the epic touched code in `src/model/` that ships in the release (below).

## Corrigido

- The list (`buildListing`) and the pending-items window (`buildIncompleteList`) walked all the root markings for each container (cost proportional to containers × roots); they now group the roots by container in a single pass. In projects with many containers the list and the pending items open faster; the result is the same.
