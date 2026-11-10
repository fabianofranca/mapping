# Passada visual das perspectivas e do canvas — [Não lançado] (épico `epic/passada-perspectivas-canvas`, PR #1496, MCP sem mudança, schema v18)

## Corrigido

- O selo "Veio de…" não cobre o nome de outra tela: a raiz grande com outra raiz logo abaixo põe o selo acima da faixa do nome dela.
- A legenda da Área de chegada não encosta na borda do canvas: fica a 8 px de cada borda da área visível e, mais larga que ela, ganha reticências.
- O **Enviar para perspectiva…** tem a fonte, a altura e a borda dos outros botões.
- Os avisos curtos do canvas (como "Cada lado precisa ter pelo menos 8 px.") e o de progresso ficam pequenos, no pé do canvas, à esquerda, e não cobrem o topo da imagem; erros e Somente leitura seguem no topo.
- Na barra do canvas larga (acima de 470 px), a seleção é o último trecho do caminho a encolher.
- O aviso curto do pé do canvas aparece inteiro com a Árvore e os Detalhes abertos a 900×720: quebra em duas linhas em vez de ser cortado com reticências.
- O selo "Veio de…" não cai sobre o título de outra raiz nem sobre o título da Área de chegada, mesmo no zoom baixo do **Enquadrar tudo** ou com o topo da faixa fora da vista: cada lugar possível é puxado para dentro da vista antes de o selo escolher onde ficar.
