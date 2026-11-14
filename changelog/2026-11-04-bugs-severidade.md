# Bugs without duplicates and with severity — 2026-11-04 (épico `epic/bugs-severidade`, PR #412, MCP 0.13.0, schema v13)

## Alterado

- Before opening a `bug` issue, the agent looks for an equal one or one that groups the defect, among the open and the closed: the equal one becomes a comment on the existing one, the groupable one enters it as an item (or is left related, if it is already in progress) and what came back after being closed becomes a new issue that cites the old one. The search is recorded in the body.
- Every open `bug` carries a severity label: `severity: high`, `severity: medium` or `severity: low`, matching the test report's scale (blocks and high → high, medium → medium, low → low). The open bugs were classified: #405 and #372 medium, #371 low.
