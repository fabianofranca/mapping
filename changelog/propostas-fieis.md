# Propostas fiéis ao aplicado — [Não lançado] (épico `epic/propostas-fieis`, PR #547, MCP 0.17.0, schema v13)

## Adicionado

- `plan_changes` e `propose_changes` (MCP 0.17.0) trazem `membership` quando o lote muda o pai ou o espaço de uma marcação ou container que já existia (pela geometria): cada entrada diz quem é, de onde sai, para onde vai e uma frase curta ("Botão sai de Topo; agora direto em Detalhes"). Sem mudança de pertencimento, o campo não aparece.

## Alterado

- A proposta passa a ser gravada na `formatVersion` 4: a mudança de criação de marcação leva `insertBefore`, o lugar do array em que a marcação entra. Uma app antiga recusa o arquivo em vez de descartar o campo ao regravar as decisões. As propostas das versões 1 a 3 continuam lidas e aplicadas como antes.

## Corrigido

- O `wrap_items` aplicado tem a hierarquia do plano no empate de retângulo (quando o item envolvido preenche o container): a marcação nova fica sem pai, o item vira filho dela e as filhas do item continuam nele. Aplicar todas as mudanças de uma proposta dá a mesma ordem de marcações e os mesmos pais do projeto proposto.
- O `move_marking` que não muda nada (a marcação já está na posição pedida, no estado do lote naquele ponto) diz "já está na posição N entre as K irmãs: nada muda" no resumo, em vez de descrever um movimento; o `index` explica que as irmãs são as do estado do lote.
