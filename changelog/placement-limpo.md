# Placement limpo — [Não lançado] (épico `epic/placement-limpo`, PR #1650, MCP 0.35.1, schema v18)

## Corrigido

- As posições e as escalas dos containers, e as posições das perspectivas, deixam de gravar a cauda de ponto flutuante: `x` e `y` ficam com no máximo 6 casas decimais (`-188.75` em vez de `-188.75000000000006`, `-739.655172` em vez de `-739.6551724137931`) e a escala com no máximo 12 algarismos significativos (`17.2413793103` em vez de `17.24137931034483`). Vale para criar (inclusive o **Tamanho da seleção** e o `add_container`), mover, redimensionar, trocar a imagem, o reparo de imagens sobrepostas e as perspectivas, na app e no MCP (`update_container` e `add_container` gravam e mostram o valor arredondado). O desvio fica abaixo da folga de 1e-6 do modelo: nenhum encosto vira sobreposição e nenhum pertencimento muda. Arquivos antigos não são reescritos: a cauda só some quando o container é editado.
