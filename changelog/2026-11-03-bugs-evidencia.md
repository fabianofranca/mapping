# English labels, bug and visual evidence — 2026-11-03 (épico `epic/bugs-evidencia`, PR #382, MCP 0.13.0, schema v13)

## Alterado

- The cycle labels now have English names: `pronta` → `ready`, `em-andamento` → `in-progress`, `fase` → `step`. The completed issues are the ones closed with `in-progress`.
- A defect is now an issue with the `bug` label, instead of `roadmap`. The `bug` is a type: it stays with the issue until it closes, also when it becomes `pronta` and `em-andamento`.
- The screenshot that shows the defect appears in the issue body as an image, stored in the `evidencias` branch; the tester agent's report shows the screenshots of the ❌ the same way.
