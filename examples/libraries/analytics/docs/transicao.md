# Transição

Anotação de uma **seta**: descreve a passagem da marcação de origem para a de destino num fluxo, normalmente de uma tela para outra.

## Campos

- **Condição**: quando a transição acontece (toque em Contratar, pagamento aprovado, sessão expirada).
- **Evento** (opcional): o nome do evento de analytics disparado na passagem. Se quiser as propriedades dele, anote o evento com o tipo **Evento** e ligue-o ao elemento que o dispara.

## Como usar

Este tipo se aplica só a setas, não a marcações retangulares: puxe uma seta da marcação da tela de origem até a da tela de destino e anote a seta na camada Analytics. A origem e o destino são os da própria seta, então a anotação não repete o nome das telas.

## Para o agente

Leia a transição pelas setas da marcação de origem (`arrows`): a anotação do tipo `transicao` da seta traz `condicao` e, se houver, `evento`. Para criar uma, ligue as duas marcações com `create_arrow` e anote a seta com o tipo `transicao`.
