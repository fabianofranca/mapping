# `Depende de` only for a real dependency — [Não lançado] (épico `epic/depende-de-real`, MCP unchanged, schema v24)

## Alterado

- The detailing (`detalhar-backlog`) writes `**Depende de:**` only for what must be on `main` before a stage starts for a reason other than a shared file (code, behavior, a helper, a decision or the owner's order). A file in common with another `ready` or `in-progress` stage goes only in its "Overlap with other stages" section, and the queue's `toca=` comparison holds the two apart, so the early start is no longer switched off by a file in common.
- The `PRONTA #n` check no longer adds `Depende de` between the ready stages of a round for a file in common; the cycle check stays for real dependencies.
