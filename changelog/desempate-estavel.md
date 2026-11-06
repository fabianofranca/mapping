# Desempate estável — [Não lançado] (épico `epic/desempate-estavel`, PR #0, MCP 0.22.0, schema v14)

## Corrigido

- Reordenar uma marcação (a **Ordem** dos Detalhes ou o `move_marking` do MCP) não troca mais pai e filho de mesmo retângulo, nem a mãe entre candidatas de mesma área, no gesto seguinte: nos empates o assentar da hierarquia prefere a relação atual, e a ordem do array só decide o empate novo.
