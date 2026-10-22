# Evento

A tabela de um evento de analytics, solta no canvas: o nome do evento num cabeçalho roxo e uma linha por propriedade enviada com ele.

## Campos

- **Nome** (obrigatório): o nome do evento como o SDK o recebe, por exemplo `checkout_started`.
- **Propriedades**: uma linha por propriedade, com o nome dela (obrigatório) e o **Valor**: um valor fixo ou de onde ele vem.

## Como o evento se liga ao elemento

O evento é uma marcação **flutuante**: vive só no canvas, é desenhada acima de tudo e não pertence a nenhuma tela. Ele é ligado ao elemento que o dispara por uma **seta**, não por um campo: puxe uma seta do evento até a marcação do botão, do campo ou da tela que o dispara. O dado fica no evento; quem lê o mapeamento chega a ele pelas setas que chegam ao elemento.

Para descrever a passagem entre duas telas de um fluxo, use a anotação **Transição** na seta entre as marcações das telas, e repita o nome do evento nela se ele acompanha a passagem.

## Exemplo

Nome `checkout_started`, com as propriedades `origem` = `carrinho`, `itens` = `3` e `total` = `149,90`, ligado por uma seta ao botão Finalizar compra.

## Para o agente

Leia o evento por `get_marking`: o nome e as `propriedades` (`propriedade` e `valor`) estão nos valores da anotação do tipo `evento`. Para saber o que dispara o evento, olhe as setas da marcação, em `arrows`. Para criar um, faça `create_marking` no canvas (com `near` para ficar ao lado do container), uma anotação `evento` com o nome e as propriedades, e ligue-a ao elemento com `create_arrow`.
