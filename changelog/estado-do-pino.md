# Estado do pino — [Não lançado] (épico `epic/estado-do-pino`, PR #0, MCP 0.28.2, schema v18)

## Alterado

- O pino de conversa no canvas passa a mostrar o estado também por um glifo à esquerda do rótulo, e não só pela cor: uma pessoa (aguardando você), uma faísca de quatro pontas (aguardando o agente) e um visto (resolvida). O pino com várias conversas mostra o glifo do estado mais urgente; o pino de rascunho (tracejado) não tem glifo. Rótulo, anel do selecionado, ponto de não lida e tracejado seguem como antes, e o alvo de clique cresce com o glifo.
- Os selos de estado da janela **Comentários** e da seção **Conversas** dos Detalhes mostram o mesmo glifo antes do texto.
- O `.canvas-host` publica `data-pin-states` (os estados dos pinos visíveis, na ordem de desenho), ao lado do `data-pins`, para conferir os pinos sem captura.

## Corrigido

- Os três estados do pino se distinguem sem depender da cor (acessibilidade, WCAG 1.4.1): os fundos têm quase a mesma luminosidade, e agora o glifo diferencia o estado em tons de cinza.
- O roteiro R22 do `docs/TESTING.md` passa a bater com a app: o Esc desarma o **Comentar** mas os pinos seguem ligados, a opção ativa do `@Entr` já é a marcação **Entrar**, e os passos conferem o `data-pin-states` (#737).
