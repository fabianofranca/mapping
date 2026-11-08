# Dialog

Diálogo modal, do `src/ui/Dialog.tsx`.

## O que o desenho mostra

- Cabeçalho de 44 px (`size-touch`) com o `titulo` (15 px, peso 600) e o botão de fechar, e uma divisória embaixo.
- O corpo é o **slot** *Conteúdo*: as marcações filhas entram nele, com 16 px de margem e 16 px entre elas.
- Fundo `color-surface`, borda `color-border`, raio 8 e a sombra de popup.

## O que fica de fora

- As **ações** (rodapé com a divisória de cima, botões à direita) não são desenhadas; ponha um Button como filho do conteúdo se quiser mostrá-las.
- O `size` (`sm` 480 px, `md` 560 px, `lg` 820 px) não muda o desenho: dê a largura à marcação.
- O fundo escurecido (`color-backdrop`) também não.

Com `alerta`, o diálogo usa o papel de alerta (acessibilidade); sem efeito visual.
