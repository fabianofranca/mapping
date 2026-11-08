# Assentar só o espaço afetado — [Não lançado] (épico `epic/assentar-local`, PR #1112, MCP 0.28.6, schema v18)

## Alterado

- Assentar muitas marcações num container só fica muito mais rápido: 2.000 marcações passam de ~150 ms para ~8 ms (cerca de 18× mais rápido) e o tempo cresce quase linearmente com o número de marcações. O resultado é exatamente o mesmo de antes (mesmos pais, espaços e empates).
- Criar muitas marcações seguidas e editar um projeto grande ficam muito mais rápidos: 1.000 marcações criadas uma a uma num container passam de ~3,3 s para ~23 ms (mais de 100×), e uma edição (criar ou mover uma marcação) num projeto de 10.000 marcações, de ~45 ms para ~1 ms, também quando o projeto tem perspectivas. O assentar do fim de cada operação olha só o que ela mexeu, e o resultado é exatamente o mesmo de antes. Medido no modelo, num container da nuvem, uma rodada.
