# Assentar só o espaço afetado — [Não lançado] (épico `epic/assentar-local`, PR #1112, MCP 0.28.6, schema v18)

## Alterado

- Assentar muitas marcações num container só fica muito mais rápido: 2.000 marcações passam de ~150 ms para ~8 ms (cerca de 18× mais rápido) e o tempo cresce quase linearmente com o número de marcações. O resultado é exatamente o mesmo de antes (mesmos pais, espaços e empates).
