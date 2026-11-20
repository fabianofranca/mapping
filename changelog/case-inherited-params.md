# A variants case no longer inherits base params its signature sheet lacks — [Não lançado] (épico `epic/case-inherited-params`, PR #2342, MCP 0.48.2, schema v22)

## Alterado

- #1894 (the Catalog said "Valid package, no errors or warnings." while Diagnostics counted warnings) was reproduced in a real browser on the three paths and is not a count defect: the package window, the Catalog with the library chosen and Diagnostics give the same number, and the Catalog window opens on the first library of the project (Notes), whose own package is valid. A new end-to-end test keeps the three counts equal.

## Corrigido

- The MCP no longer passes a parameter the case's composable does not take: a `variants` case with its own signature sheet leaves out the base parameters that sheet lacks (`get_code_hints` writes no argument for them, and `get_annotation` and `get_marking` have no `code.params` entry for them; the field's value stays in `values`). In Material 3, a `top-app-bar` with `style = center` and `subtitle` filled resolves to `CenterAlignedTopAppBar` without `subtitle`.
- The Material 3 package validates with no warnings (it gave 59 `parameter outside the signature`): the warning is now only for a case's own parameters that its sheet lacks.
