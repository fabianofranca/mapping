# Interface texts, notice row and guide fixed — 2026-11-05 (épico `epic/textos-e-avisos`, PR #530, MCP 0.16.0, schema v13)

## Corrigido

- Specializations: the library text says "`formatVersion` 4 onward", with no maximum version, instead of "version 4 to 7".
- Marking details: the Position and Size hint depends on the space. Container marking: "In container pixels"; canvas marking: "In canvas units" (before it said "original image pixels" in both cases).
- Details notice row: with a long message, the icon stays in the left column, aligned with the first line, and the message wraps in its own column (before the icon stayed alone above it).
- Empty-field notice: Details still shows the notice for a field that is still empty; the help and `SPEC-FORMAT.md` now say so, and that the Notices window and the count only count a field with a value.
- Test guide (`docs/TESTING.md`): steps and appendices that did not match the app (R11.9 shortcuts, **Continue** in R13.1, Tree in R14.1, **Wrap** in R12.8, "Add to canvas" in R12.12, appendices A and B, R18.4 and R18.6), with a test that checks the guide's shortcut list against the app's windows.
