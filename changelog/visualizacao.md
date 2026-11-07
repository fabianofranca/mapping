# Visualização — [Não lançado] (épico `epic/visualizacao`, PR #714, MCP 0.24.1, schema v15)

## Alterado

- A camada ativa saiu. O filtro **Marcações sem anotação** (Mostrar todas, Esmaecer, Ocultar) passa a valer pelas camadas visíveis: a marcação some ou esmaece quando não tem anotação em nenhuma camada visível.
- Qualquer camada pode ser escondida, inclusive a última visível. Com todas escondidas, a seção **Anotações** dos Detalhes diz "Todas as camadas estão escondidas." e oferece **Mostrar todas**.
- Na revisão, o aviso de camada escondida conta pelas camadas escondidas, sem exceção para a primeira camada.
- Saíram o botão "+ Anotação" do topo dos Detalhes (fica o **+** de cada camada), o atalho `Alt+N`, o ✓ "Tornar ativa", o chip "Camadas (ativa: …)" da barra principal e o selo "ativa" nos grupos de camada.
- O **Ver limpo** virou o modo **Visualizar** (`Alt+H`): o canvas só para ver, em que nada se seleciona nem se edita. Ele mostra containers, imagens, nomes das marcações e setas (o contorno das marcações começa desmarcado) e guarda a escolha por projeto neste navegador; o painel **Mostrar no canvas** que a muda chega na fase seguinte. Com as setas marcadas elas aparecem mesmo sem o contorno das marcações, e o filtro **Marcações sem anotação** não vale no modo.
