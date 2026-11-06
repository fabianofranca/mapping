# Desempate estável — [Não lançado] (épico `epic/desempate-estavel`, PR #621, MCP 0.22.0, schema v14)

## Corrigido

- Reordenar uma marcação (a **Ordem** dos Detalhes ou o `move_marking` do MCP) não troca mais pai e filho de mesmo retângulo, nem a mãe entre candidatas de mesma área, no gesto seguinte: nos empates o assentar da hierarquia prefere a relação atual, e a ordem do array só decide o empate novo.
- Uma proposta com reordenação (`move_marking`) no lote aplica os mesmos pais e a mesma ordem entre irmãs que a revisão (visão **Proposto**) e o `membership` mostraram, também quando há retângulos iguais (o `wrap_items`). Fica de fora só uma família rara, documentada como limite conhecido (#625): um empate entre marcações que já existiam, decidido no lote por um passo que a proposta não registra, segue a relação da base; confira com `get_marking` depois de aplicar.
- A revisão não mostra mais uma mudança de posição a mais quando duas marcações novas entram no mesmo lugar.
- O **Envolver** (e o `wrap_items` do MCP) põe a nova na cadeia certa depois de reordenar marcações de mesmo retângulo: ela fica filha do pai que as selecionadas tinham e mãe direta delas, em vez de entrar no meio da cadeia.
- Uma proposta com duas mudanças de posição para a mesma marcação não duplica mais essa marcação nem perde uma irmã ao aplicar: vale a última.
