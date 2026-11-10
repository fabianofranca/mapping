# Filha no slot — 2026-11-10 (épico `epic/filha-no-slot`, PR #1519, MCP 0.33.0, schema v17)

## Adicionado

- **MCP:** `create_marking` com `inside` (o componente com slot, do lote ou do projeto): a filha nasce no slot, depois da última filha, com o `gap` e o `padding` do slot, sem calcular retângulo, como o **Adicionar dentro de X** da app. O pai gravado continua vindo da geometria; com `rect`, o `rect` dá só o tamanho; slot cheio é aceito, com aviso. `parent` continua ignorado com aviso.
