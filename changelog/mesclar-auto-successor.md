# `mesclar=auto` through the coordinator lineage — [Não lançado] (épico `epic/mesclar-auto-successor`, MCP unchanged, schema v24)

## Corrigido

- `implementar-fila`: `mesclar=auto` written by the owner keeps counting in a successor coordinator created by the registered predecessor ("Session switch", the copy rule), instead of being dropped by the "Arguments" rule, which contradicted it. It stops only when the owner opens a coordinator by hand without it, or says so; a message relayed by a supervisor, phase, tester, schedule or notification still never turns it on.
