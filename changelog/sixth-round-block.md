# Sixth round block — [Não lançado] (épico `epic/sixth-round-block`, PR #0, MCP 0.44.0 unchanged, schema v21)

## Alterado

- **The full cloud round has a sixth fixed block (for whoever runs the workflow, #2024):** the table of "Full round in blocks" (`docs/TESTING-NUVEM.md`) gains row 6, `R0, section 6 and R30` (the Pages script, which did not fit any of the five blocks under the 201,000-character ceiling). The ceiling and the five other rows do not change. The old "sixth session outside the table" of #883 becomes the rule.
- **The texts stop counting the blocks (for whoever runs the workflow, #2024):** the coordinator, the tester and the queue skill say `modo completo, bloco k de n`, "Full round — block k of n", `Bloco k de n: relato em` and "one notice per block", so the next block needs only a row in the table. `docs/TESTING-NUVEM-CONSULTA.md` records the rule for new scripts: they go into the block with the most room under the ceiling (today block 6); with none, it is an owner decision.
