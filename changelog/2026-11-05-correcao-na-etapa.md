# Defects fixed in the stage itself — 2026-11-05 (epic `epic/correcao-na-etapa`, PR #586, MCP 0.18.0, schema v14)

## Alterado

- A defect found while implementing a stage (by the phase, by the tester or at closing) is now fixed in the stage itself, without becoming a `bug` issue, when it does not need an owner decision. Only these become an issue: what needs a decision (product, change of a decision, schema or format, fixing the size of a stage), what concerns data loss, `mapping.json` integrity or security (which calls the owner right away) and what shows up after the fix phase.
- The fix phase also opens without ❌, when there is a pending defect from the phases or a report observation that is a defect, and the retest covers the steps that the fixes affect.
