# Code review of the growth tests and the local settle — [Não lançado] (épico `epic/cr-scale-settle`, PR #1971, MCP 0.56.2, schema v20)

## Corrigido

- a `mapping.json` edited by hand with a wrong `parentId` opens with the hierarchy by geometry, in the app and in the MCP, and the next save writes it

## Alterado

- the container overlap check of `validateProject` groups containers by size class instead of one grid the size of the largest container, so one very large container among many small ones no longer makes opening a large project quadratic, and it no longer overflows the stack with hundreds of thousands of containers
- reading a project settles it in memory (a few tens of milliseconds more at 2,500 markings, nothing is written on open), and the clipped settle of an edit looks containers up through one lazy map and computes the difference between the projects once when the settle changed nothing
