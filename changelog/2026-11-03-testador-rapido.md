# Faster tester — 2026-11-03 (épico `epic/testador-rapido`, PR #385, MCP 0.13.0, schema v13)

## Alterado

- The cloud tester gains helpers in `scripts/testing/` (`cloud-up.sh`, `cloud.mjs`, `atspi-allow.py`) that bring up the environment (build, server, virtual display, Chrome) and operate the native dialogs (folder or file picker, permission request, "Save as", cancel) in a single call, instead of rewriting the scripts every round.
- The retest by findings runs only R0.1 (build id) and the steps of R0 that the findings depend on, instead of the whole R0.
- The directed round's visual pass now covers only the windows and dialogs that the stage touches (the "Passada visual:" line of the last phase's sub-issue); the retest covers only those of the findings' windows and dialogs; the full round keeps the standard list.
- The report now carries the real time per script (measured by `mark()` in `apoio/tempos.log`, never estimated) and the total duration also goes in the notification to the coordinator.
- Text fixes in the guide (`docs/TESTING.md`) from the recurring stumbles in the test reports: window shortcuts through Playwright (`Control+Shift+Digit<n>`), the interactive guide's tab, the view to read in R11.6, reopening Specializations for the second application of R1.3, trailing slash in the folder picker's path and the read permission through recipe 6.
