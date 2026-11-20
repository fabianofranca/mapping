# A variants case no longer inherits base params its signature sheet lacks — [Não lançado] (épico `epic/case-inherited-params`, PR #2342, MCP 0.48.2, schema v22)

## Alterado

- #1894 (the Catalog said "Valid package, no errors or warnings." while Diagnostics counted warnings) was reproduced in a real browser on the three paths and is not a count defect: the package window, the Catalog with the library chosen and Diagnostics give the same number, and the Catalog window opens on the first library of the project (Notes), whose own package is valid. A new end-to-end test keeps the three counts equal.
