# Passada visual dos Detalhes — 2026-11-10 (épico `epic/detalhes-visual`, PR #1460, MCP 0.30.0 sem mudança, schema v18)

## Corrigido

- A **900 px** de largura, com Árvore, Camadas e Detalhes abertos, a janela da direita não passa mais por baixo da faixa: o botão **Detalhes** da faixa deixa de cobrir cerca de 9 px do **X** da janela e de se apoiar na barra de rolagem dela. O mínimo da coluna da esquerda caiu de 200 para 180 px, para os mínimos das duas laterais e o do canvas (180 + 280 + 360) caberem na área da janela mínima (900 menos as duas faixas). A 1280 px nada muda.
- O **+** de uma camada sem tipo para oferecer diz o motivo (especialização indisponível, camada sem tipos, só tipos flutuantes ou tipos que não valem para setas ou marcações) e o caminho: a Nota nasce pela Paleta (Catálogo › Paleta › Adicionar no canvas). O **+** da camada Notas não oferece mais a Nota nem a Tabela a uma marcação comum nem a uma seta; numa marcação flutuante continua como antes. O modelo e o MCP seguem aceitando a anotação de tipo flutuante.
- A caixa **Só incompletas** da Lista usa o ícone de alerta (o triângulo de contorno dos Detalhes), e o nome acessível é só "Só incompletas".
