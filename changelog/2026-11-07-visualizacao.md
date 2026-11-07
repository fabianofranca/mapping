# Visualização — 2026-11-07 (épico `epic/visualizacao`, PR #714, MCP 0.24.1, schema v15)

## Adicionado

- O **modo visualização**: o botão **Visualizar** (`Alt+H`) deixa o canvas só para ver e abre o painel **Mostrar no canvas**, em que a pessoa escolhe o que aparece: containers, imagens, contorno e nome das marcações, setas e o desenho de cada camada que desenha. **Mostrar tudo** marca tudo e **Só as telas** deixa o canvas do antigo Ver limpo. O botão **Mostrar no canvas**, ao lado, reabre o painel; **Esc** fecha o painel e, depois, sai do modo; a barra de status avisa que o modo é só para ver. A escolha fica por projeto, neste navegador.

## Alterado

- A camada ativa saiu. O filtro **Marcações sem anotação** (Mostrar todas, Esmaecer, Ocultar) passa a valer pelas camadas visíveis: a marcação some ou esmaece quando não tem anotação em nenhuma camada visível.
- Qualquer camada pode ser escondida, inclusive a última visível. Com todas escondidas, a seção **Anotações** dos Detalhes diz "Todas as camadas estão escondidas." e oferece **Mostrar todas**.
- Na revisão, o aviso de camada escondida conta pelas camadas escondidas, sem exceção para a primeira camada.
- Saíram o botão "+ Anotação" do topo dos Detalhes (fica o **+** de cada camada), o atalho `Alt+N`, o ✓ "Tornar ativa", o chip "Camadas (ativa: …)" da barra principal e o selo "ativa" nos grupos de camada.
- O **Ver limpo** virou o modo **Visualizar** (`Alt+H`): o canvas só para ver, em que nada se seleciona nem se edita. Ele mostra containers, imagens, nomes das marcações e setas (o contorno das marcações começa desmarcado) e guarda a escolha por projeto neste navegador. Com as setas marcadas elas aparecem mesmo sem o contorno das marcações, e o filtro **Marcações sem anotação** não vale no modo.

## Corrigido

- `Alt+H` desliga o modo visualização também com o foco numa caixa de seleção do painel **Mostrar no canvas** (antes só funcionava com o foco em botão).
- Ao sair do modo visualização, o foco vai ao **Visualizar**, e **Mostrar todas** (Anotações dos Detalhes, com todas as camadas escondidas) deixa o foco na seção, em vez de perdê-lo no corpo da página. O painel aberto ao ligar o modo devolve o foco ao **Visualizar** ao fechar.
- A dica do **Visualizar** não cobre mais o título do painel **Mostrar no canvas** aberto.
