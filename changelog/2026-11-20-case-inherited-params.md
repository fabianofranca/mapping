# A variants case no longer inherits base params its signature sheet lacks — 2026-11-20 (épico `epic/case-inherited-params`, PR #2342, MCP 0.48.2, schema v22)

## Alterado

- #1894 (the Catalog said "Valid package, no errors or warnings." while Diagnostics counted warnings) was reproduced in a real browser on the three paths and is not a count defect: the package window, the Catalog with the library chosen and Diagnostics give the same number, and the Catalog window opens on the first library of the project (Notes), whose own package is valid. A new end-to-end test keeps the three counts equal.

- The Swift reader of `mapping-signature` reads the `init`s declared in an `extension` of the struct (in the file or in an `--also` file) and inside `#if` blocks, and tokenizes raw strings (`#"…"#`). The `--init` list now has the body `init`s, then the extension ones (the memberwise one is `0` when the body has none), so a struct with no `init` in the body and one in an extension is ambiguous. A raw string default comes out as its source text in `default` and as its content in `value.default` when it is a single line without interpolation. A duplicate struct stays documented (qualify `--symbol`). The sheet format and `source.extractor` do not change.

- The tester's scripts expect 0 warnings from the Material 3 package: the package window says "0 error(s) and 0 warning(s).", the Catalog line "Valid package, no errors or warnings." and Diagnostics has no **Library** section (R3.10 to R3.17, R8.4, R9.1, R9.22, R10.1, R11.4, R13.11, R17.1, R17.3, R25 and R27.1 no longer count 59 `parameter outside the signature` warnings). R25.3 checks the three together, with the Catalog on Material 3 (#1894), and the new R17.60 checks the fix through `get_code_hints` (`CenterAlignedTopAppBar` without `subtitle`; the `small` case keeps it).

## Corrigido

- The MCP no longer passes a parameter the case's composable does not take: a `variants` case with its own signature sheet leaves out the base parameters that sheet lacks (`get_code_hints` writes no argument for them, and `get_annotation` and `get_marking` have no `code.params` entry for them; the field's value stays in `values`). In Material 3, a `top-app-bar` with `style = center` and `subtitle` filled resolves to `CenterAlignedTopAppBar` without `subtitle`.
- The Material 3 package validates with no warnings (it gave 59 `parameter outside the signature`): the warning is now only for a case's own parameters that its sheet lacks.
