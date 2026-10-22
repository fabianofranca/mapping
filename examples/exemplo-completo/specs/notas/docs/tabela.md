# Tabela

Uma tabela de chave e valor no canvas, no estilo do post-it, para o que é uma lista de dados e não cabe num texto: as propriedades de um evento de analytics, os parâmetros de uma chamada, os campos que uma tela mostra.

## Campos

- **Título** (opcional): o resumo, em negrito no topo (o nome do evento, por exemplo).
- **Linhas**: uma linha por registro, com a **Chave** (obrigatória) e o **Valor**. A ordem das linhas é a ordem do desenho; arraste a alça de uma linha para reordenar.

## Como a tabela se comporta

- É uma marcação **flutuante**, como a nota: vive só no canvas, é desenhada acima de tudo e nunca pertence a uma tela nem a outra marcação. Mover uma tela não move as tabelas ao lado dela.
- A ligação com o que a tabela descreve é uma **seta**, não um campo: puxe uma seta da tabela (ou do elemento) até a marcação do botão, do campo ou da tela. O dado fica na tabela; quem lê o mapeamento chega a ela pelas setas que saem do elemento.
- A altura não cresce sozinha com as linhas: se a tabela passar da caixa, o desenho é cortado e a marcação ganha a pendência de que o componente não cabe. Aumente a marcação.

## Para o agente

Leia a tabela por `get_marking`: o título e as linhas (`chave` e `valor`) estão nos valores da anotação do tipo `tabela`, e `floating` é `true`. Para saber de qual elemento ela fala, olhe as setas da marcação, em `arrows`. Para criar uma, faça `create_marking` no canvas (com `near` para ficar ao lado do container), uma anotação do tipo `tabela` com as `linhas`, e ligue-a ao alvo com `create_arrow`. Uma tabela é comentário humano ou dado auxiliar: use-a como contexto, não como especificação de interface.
