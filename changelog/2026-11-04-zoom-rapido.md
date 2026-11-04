# Zoom do projeto grande mais rápido — 2026-11-04 (épico `epic/zoom-rapido`, PR #434, MCP 0.13.0, schema v13)

## Alterado

- O zoom do canvas em projetos grandes ficou mais rápido: posição e escala do stage passam a ser aplicadas numa transformação só por quadro (antes eram três cascatas de transformação no zoom). No cenário do orçamento de desempenho (500 marcações, zoom semântico, 200 setas), a mediana do quadro de zoom caiu de cerca de 7,8 para 5,9 ms. O pan e a edição não mudam; o orçamento de 16 ms continua o mesmo.
