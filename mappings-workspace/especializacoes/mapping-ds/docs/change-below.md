# ChangeBelow

A linha embaixo do controle de um campo alterado nos Detalhes da revisão (`src/ui/review/ChangeBelow.tsx`, `.change-below`): coluna com 4 px entre as linhas, 4 px abaixo do controle. Sem nota e sem comparação, não aparece. É **estrutural**: só agrupa, o app não desenha nada nele.

**Filhos esperados:**
- numa proposta que substitui outra: a Flag da comparação ("igual na nova", "diferente na nova"; `perigo` em "não consta na nova");
- cada nota da mudança: o Ícone `note` (12 px, `muted`) e o texto (Texto `t-small` `muted`), 4 px entre eles.
