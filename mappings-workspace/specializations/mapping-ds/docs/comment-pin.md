# CommentPin

Pino de conversa no canvas, desenhado no Konva por `src/canvas/renderers/commentPins.ts`.

- `estado`: `humano` (aguardando humano, `cv-pin-human`, âmbar), `agente` (aguardando agente, `cv-pin-agent`, teal) ou `resolvida` (`cv-pin-resolved`, cinza; só aparece enquanto está selecionada).
- `rotulo`: as iniciais e o número de mensagens ("MA 3") ou, com várias conversas no mesmo item, a contagem.
- `selecionado`: anel de 2 px em `cv-pin-selected`. `naoLida`: ponto de `cv-pin-unread` no canto de cima à direita. `rascunho`: contorno tracejado.

Como o pino real, o desenho tem 20 px **de tela** em qualquer zoom, centrado no retângulo da marcação (a marcação só diz onde). A largura é a do rótulo com 8 px de respiro de cada lado; o app usa 7 px por caractere mais 16, então um rótulo de 4 caracteres sai cerca de 5 px mais estreito. O halo é o traço de 1 px pelo centro, como no Konva. Os pinos ficam sobre a foto, por isso as cores são iguais nos dois temas.
