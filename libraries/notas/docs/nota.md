# Nota

Um post-it no canvas, para o que não cabe numa anotação de camada: um comentário sobre uma tela, uma regra de negócio, um recado para quem vai ler o mapeamento.

## Campos

- **Título** (opcional): o resumo, em negrito no topo do post-it.
- **Texto** (obrigatório): o comentário. Aceita várias linhas: Shift+Enter quebra a linha (Enter confirma enquanto o campo é de uma linha; na área de várias linhas, Enter também insere linha).

## Como a nota se comporta

- É uma marcação **flutuante**: vive só no canvas, é desenhada acima de tudo (inclusive sobre fotos) e nunca pertence a uma tela nem a outra marcação.
- Não carrega nada e nada a carrega: mover uma tela não move as notas que estão sobre ela. Para mover tudo junto, selecione com Shift+clique ou use "Selecionar com o conteúdo" numa marcação do canvas em volta.
- A relação da nota com uma tela ou com um elemento é uma **seta** (etapa seguinte); por enquanto, posicione a nota ao lado do que ela comenta.

## Para o agente

Leia a nota por `get_marking`: o título e o texto estão nos valores da anotação do tipo `nota`, e `floating` é `true`. Uma nota é comentário humano: use-a como contexto, não como especificação de interface.
