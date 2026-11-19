# Sixth round block — 2026-11-19 (épico `epic/sixth-round-block`, PR #2216, MCP 0.44.0 unchanged, schema v21)

## Alterado

- **The full cloud round has a sixth fixed block (for whoever runs the workflow, #2024):** the table of "Full round in blocks" (`docs/TESTING-NUVEM.md`) gains row 6, `R0, section 6 and R30` (the Pages script, which did not fit any of the five blocks under the 201,000-character ceiling). The ceiling and the five other rows do not change. The old "sixth session outside the table" of #883 becomes the rule.
- **The texts stop counting the blocks (for whoever runs the workflow, #2024):** the coordinator, the tester and the queue skill say `modo completo, bloco k de n`, "Full round — block k of n", `Bloco k de n: relato em` and "one notice per block", so the next block needs only a row in the table. `docs/TESTING-NUVEM-CONSULTA.md` records the rule for new scripts: they go into the block with the most room under the ceiling (today block 6); with none, it is an owner decision.

## Corrigido

- **Right-click on a Tree row opens the app's menu (finding 6.3 of #2024, CL1):** it selects the row and opens the same menu as the canvas, with **Move to page ›**, instead of the browser's; Esc closes it and focus returns to the row. In review it only blocks the browser menu.
- **The reference preview window is named "Reference preview" (finding 6.2 of #2024, CL1):** the dialog takes the name from `refPreview.label` (`aria-label`); the visible heading ("Flows: Note") stays as its title.
