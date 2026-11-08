# DecisionControl

Par ✓ ✕ que decide um nível da revisão (`src/ui/review/DecisionControl.tsx`, `.decision-control`): nenhum marcado é "sem decisão"; apertar o marcado limpa. Decidir grava na hora, sem confirmação. É **estrutural**: só agrupa, o app não desenha nada nele.

**Filhos esperados:**
- versão de ícone (linhas dos níveis): dois IconButton `sm`, `check` com `variant` `accept` e `close` com `variant` `reject`, 2 px entre eles; o marcado fica com `pressionado` `sim`;
- versão de texto (cabeçalho do item, decisão da imagem): dois Button, `accept` ("Aceitar marcação") e `reject` ("Rejeitar marcação"), 6 px entre eles, que dividem a largura.

Atalhos: A aceita, R rejeita, Backspace limpa.
