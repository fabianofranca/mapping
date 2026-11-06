# Revisão em janelas baixas — [Não lançado] (épico `epic/revisao-janela-baixa`, PR #623, MCP 0.19.0, schema v14)

## Alterado

- Altura mínima da janela: de 860 px para **720 px** (largura mínima segue 900 px). Abaixo de 900×720 a app mostra o aviso "Abra numa janela maior", agora com 720 no texto.
- Revisão: os filtros da janela Propostas (decisão, tipo de mudança, imagem, camada e **Só conflitos**) ficam recolhidos no botão **Filtros**, que mostra quantos grupos estão ativos ("Filtros · 2"). O "N de M" e o **Limpar filtros** continuam ao lado do botão; escolher um filtro não fecha o painel, e **Esc** fecha e devolve o foco ao botão. O botão do aviso de conflitos novos continua ligando **Só conflitos** sem abrir o painel. Fora da revisão nada muda.
- Revisão: a janela inferior (Propostas) começa mais baixa, com 240 px (antes 344 px): cabem 3 linhas inteiras da lista e o rodapé de atalhos a 900×720. Quem tinha 344 px guardado passa ao padrão novo; outro valor guardado fica.
- Revisão: a legenda das marcas deixou de ser cortada pelo canvas. Quando o canvas é mais baixo que ela, a legenda desce por cima da janela Propostas (e do minimapa), inteira e sem rolagem, até o topo da barra de status, sem passar da coluna do canvas nem cobrir as janelas laterais. Dicas, seletores e diálogos ficam por cima dela.
