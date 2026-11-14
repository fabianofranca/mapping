# Round guide on demand — 2026-11-10 (épico `epic/guia-sob-demanda`, PR #1458, MCP 0.30.0 unchanged, schema v18)

## Alterado

- `round-guide.mjs --out <folder>/<name>.md` now writes three files: `<name>.md` (the same as before), `<name>-base.md` (the guide without the `### R<n>` sections, each replaced by a line with the command that prints it) and `<name>-indice.tsv` (section, script and step → lines of `<name>.md`). Without `--out`, the output does not change.
- New `node scripts/testing/cloud.mjs passo <item…> [--guia=<file>]`: prints from the round guide (`<APOIO>/guia.md`, or the `--guia`) the script without the step lines (`R12`), one step (`R12.4`) or a range (`R12.1-R12.8`), with the table header. It cuts at 25,000 characters, at the last whole line, and says how to continue. An item the guide does not have exits with code 2 and says what the guide has. It does not open Chrome.
- The last step requested brings along the ones that depend on it: `R22.3-R22.6` also brings R22.6a.
- A test checks that every line of the round guide (`R0 R12 R22` and `all`) is in the base or in the `passo` of some script: nothing is lost.
- Tester prompt (`docs/TESTING-NUVEM.md`): at the start the tester reads only `apoio/guia-base.md` (in chunks under 25 thousand tokens) and requests each script with `cloud.mjs passo <Rn>` before starting it and the steps in batches of up to 8 (`passo <Rn.a>-<Rn.b>`) when executing them; `guia.md` is left for `Grep`. The `passo` joins the list of helpers, the block and group modes cite the base and the `passo`, and the report records in "O que atrapalhou" what the `passo` did not provide.
