# Cloud tester step by step — 2026-11-04 (epic `epic/testador-por-passo`, PR #429, MCP 0.13.0, schema v13)

## Alterado

- Cloud tester helpers (`scripts/testing/`): `connect()` with a short timeout (5 s for actions, 15 s for navigations), environment (`DISPLAY`, D-Bus) loaded automatically from `apoio/env`, app tab chosen without picking the guide's (fails with the URLs if there are two), `cloud-up.sh` that comes back up on its own (processes with `setsid`), `state()` (tab, dialogs, notices, saving, focus, native windows and what changed in `mapping.json`) and `round-guide.mjs`, which generates the round guide with only the requested scripts.
- Tester prompt (`docs/TESTING-NUVEM.md`): reads the round guide (`round-guide.mjs`) instead of the whole `docs/TESTING.md`, runs `cloud-up.sh` in the foreground and ends every step script with `state()` (act and check screen and disk in one call); the notice to the coordinator names the `send_message` of `claude-code-remote`. The report (section 10 template) groups the ✅ of consecutive steps of the same script in one line, and the Summary still counts per step. Appendix A: recipes 2 and 4 describe `connect()` and `state()`.
