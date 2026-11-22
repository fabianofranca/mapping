# Code review of the growth tests and the local settle — [Não lançado] (épico `epic/cr-scale-settle`, PR #pending, MCP patch (provisional), schema v20)

## Alterado

- the container overlap check of `validateProject` groups containers by size class instead of one grid the size of the largest container, so one very large container among many small ones no longer makes opening a large project quadratic, and it no longer overflows the stack with hundreds of thousands of containers
