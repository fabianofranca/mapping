# Propostas fiéis ao aplicado — [Não lançado] (épico `epic/propostas-fieis`, PR #0, MCP 0.17.0, schema v13)

## Alterado

- A proposta passa a ser gravada na `formatVersion` 4: a mudança de criação de marcação leva `insertBefore`, o lugar do array em que a marcação entra. Uma app antiga recusa o arquivo em vez de descartar o campo ao regravar as decisões. As propostas das versões 1 a 3 continuam lidas e aplicadas como antes.

## Corrigido

- O `wrap_items` aplicado tem a hierarquia do plano no empate de retângulo (quando o item envolvido preenche o container): a marcação nova fica sem pai, o item vira filho dela e as filhas do item continuam nele. Aplicar todas as mudanças de uma proposta dá a mesma ordem de marcações e os mesmos pais do projeto proposto.
