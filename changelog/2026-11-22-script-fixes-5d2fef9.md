# Script fixes from the round on main 5d2fef9 — 2026-11-22 (épico `epic/script-fixes-5d2fef9`, PR #2654, MCP no change, schema v23)

## Alterado

- `docs/TESTING.md`, R1.23: the Convert warning is quoted as the app shows it, "1 reference(s) from other annotations will break." (#2591, decision 1).
- `docs/TESTING.md`, R30.2: `estado` expects `schema 23`, the same schema R30.1 reads in the status bar (#2591, decision 2).
- `docs/TESTING.md`, R30 Setup: the identity needs **Save** in **Settings** › **Identity** ("Identity saved on this device.") before the first comment (#2591, decision 3).
- `docs/TESTING.md`, R30.9: the submenu is **Also show in** and **Analytics** is a checkbox clicked once (#2591, decision 4).
- `docs/TESTING.md`, R30.12: the target is an empty point read from the `data-selection-box` of Screen D, the "Canvas · Flows" title is checked before sending, and a mis-click reruns R30 from the Setup with a new `PROJ` (#2591, decision 5).
- `docs/TESTING.md`, R3.19, and `docs/TESTING-NUVEM.md` ("Never"): the step fetches commit `4c9258e` by its full SHA when the clone lacks it and builds `mat-main` in the working folder; a `git fetch` that a step asks for is allowed (#2591, decision 6).
- `docs/TESTING.md` and `docs/TESTING-NUVEM.md`: R3.6a left R3 and became the on-demand script RQ (concept question in a clean Claude Code session); no round brings it and block 1 of the full round is 162 steps (#2591, decision 7).
