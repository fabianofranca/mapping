# Cloud tests — 2026-11-02 (épico `epic/testes-nuvem`, PR #279, MCP unchanged, schema v13)

## Adicionado

- The tester's directed rounds can run in a Claude Code session in the cloud ("Mapping - testes" environment), without the owner at the computer: prompt in `docs/TESTING-NUVEM.md` and recipes for the native dialogs in appendix A of `docs/TESTING.md`.

## Alterado

- The epic flow triggers the directed round on its own after the last phase's merge: the phase agent creates the tester session, the tester signals when it opens the report PR and, with no ❌ and green CI, the phase agent merges the report into the epic.
