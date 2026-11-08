# CommentPin

Pino de conversa no canvas, desenhado no Konva por `src/canvas/renderers/commentPins.ts`.

- `estado`: `humano` (aguardando humano, `cv-pin-human`, âmbar), `agente` (aguardando agente, `cv-pin-agent`, teal) ou `resolvida` (`cv-pin-resolved`, cinza; só aparece enquanto está selecionada).
- `rotulo`: as iniciais e o número de mensagens ("MA 3") ou, com várias conversas no mesmo item, a contagem.
- `selecionado`: anel de 2 px em `cv-pin-selected`. `naoLida`: ponto de `cv-pin-unread` no canto de cima à direita. `rascunho`: contorno tracejado.

O pino real mede 20 px de tela e a largura cresce com o rótulo (7 px por caractere mais 16 de respiro); dê essa largura à marcação. O contorno de halo é aproximado em 1 px. Os pinos ficam sobre a foto, por isso as cores são iguais nos dois temas.
