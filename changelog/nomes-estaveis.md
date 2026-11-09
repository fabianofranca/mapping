# Nomes acessíveis estáveis — [Não lançado] (épico `epic/nomes-estaveis`, PR #1140, MCP 0.28.5 sem mudança, schema v18)

## Corrigido

- Os botões de janela da faixa lateral (Árvore, Camadas, Detalhes, Lista, Propostas, Diagnóstico, Comentários…) têm sempre o mesmo nome para o leitor de tela, o título da janela: o estado aberto ou fechado é dito só pelo "pressionado", e não mais por "Mostrar …" e "Esconder …". O aviso de propostas novas, de erro novo e de conversas abertas continua depois do nome.
- Na tela inicial, os botões de cada projeto recente passam a dizer de qual projeto são ("Abrir Loja", "Excluir Loja", "Remover da lista: Loja") e a descrever a linha (origem, pasta e último uso): linhas de mesmo nome não se confundem mais para quem usa leitor de tela. Nada muda na tela.
- Fechar a faixa de imagens remotas por **Agora não** ou **Permitir estas** devolve o foco do teclado a quem o tinha (por exemplo, o campo **URL da imagem**), ou ao canvas se esse campo saiu; antes o foco se perdia no início da página.
- O foco volta ao campo **URL da imagem** depois de **Agora não** ou **Permitir estas** também quando a URL passa de 60 caracteres e o campo troca entre uma e várias linhas; antes ele ia ao canvas.
