# Tester: script mismatch versus product defect — [Não lançado] (épico `epic/tester-script-cause`, PR #2265, MCP unchanged, schema v21)

## Alterado

- `docs/TESTING-NUVEM.md` ("Check and record" and "Report"): before recording a ❌, the cloud tester checks the expected result against the source that defines the behavior (the docs in `docs/`, the code, the design decision cited by the script or the stage issue) and gives the finding a **cause**, `produto` or `roteiro`. A `roteiro` finding (the script text is wrong, the app is right) is always **low**, as in the `docs/PROCESS.md` scale; a doubt is recorded in the Reproduction block with the source read, without raising the severity. The report lists the cause of each finding and the coordinator notice counts the `roteiro` ones apart (`findings: high 1, medium 1, roteiro 2`). Testers created after the merge follow the rule (#2261).
