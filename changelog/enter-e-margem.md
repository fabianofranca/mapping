# Enter grava o campo longo e Envolver com margem exata — [Não lançado] (épico `epic/enter-e-margem`, PR #523, MCP 0.16.0, schema v13)

## Corrigido

- O Envolver (na app e no `wrap_items` do MCP) dá 8 px de margem em volta de containers com posição inteira, também quando o arrasto deixou ruído de ponto flutuante no `placement` (antes dava 9 px). Com fração de verdade, o retângulo inteiro continua cobrindo o conjunto.
- Ir e voltar com um container pelo arrasto não deixa mais ruído (como `-2,27e-13`) no `placement` do `mapping.json`; a fração de verdade do arrasto suave com zoom continua.
