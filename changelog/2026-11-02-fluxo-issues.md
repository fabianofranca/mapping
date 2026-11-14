# Planning in issues — 2026-11-02 (épico `epic/fluxo-issues`, PR #307, MCP 0.12.0, schema v13)

## Alterado

- The roadmap and the stage plan now live in GitHub issues: future items have the `roadmap` label, the stage in progress has the `etapa` label, with a sub-issue (label `fase`) per phase; the closed issue is the history.
- `PLAN.md` and `docs/ROADMAP.md` left the repository. The history of the Parent marking stage was archived in `docs/history/PLAN-etapa-marcacao-pai.md`, the last one in the old format.
- The index of the reference documentation is in `README.md` and the history's is in `docs/history/README.md`.
- Repository cleanup: `docs/history/` (stage plans, old prompts, audit and test reports), `docs/redesign/` and `docs/sdui/` left; git keeps that history. The rules that the code still cited went to `docs/ARCHITECTURE.md` or into the comment itself.
- The embeddable viewer moved from `lab/viewer/` to `viewer/`, with the React demo in `viewer/demo/` (`npm run dev:viewer`) and the example libraries in `viewer/samples/`. The `mapping-viewer` package, `npm run build:viewer` and `dist-viewer/` do not change.
- The component lab left, along with the `dist/lab/` published next to the app and the `dev:lab`, `dev:lab:react` and `build:lab` scripts.
- The cloud tester (a Claude Code session in the "Mapping - testes" environment) is the only tester agent: the Cowork prompt (`docs/TESTING-COWORK.md`) left, `docs/TESTING-NUVEM.md` now stands on its own, together with `docs/TESTING.md`, and Windows/Edge coverage by an agent no longer exists. The on-demand scripts remain manual, done by the owner.
- The report of a test round is now a comment on the sub-issue of the tested phase (in parts, if it exceeds 65 thousand characters), with a notice to the coordinator; there is no report PR anymore.
- Automated flow with three chats (roadmap, detailing and implementation): the implementation chat orchestrates one session per phase, and each one merges its own PR into the epic with green CI; then it calls the tester, fixes once if there is a ❌ and only calls the owner to confirm the epic's merge into `main`. The ready-made messages are in `docs/FLOW.md`.
- The stage's model table gains the Orchestrator row (default Sonnet).
- Nothing changes in the app or in the MCP server.
