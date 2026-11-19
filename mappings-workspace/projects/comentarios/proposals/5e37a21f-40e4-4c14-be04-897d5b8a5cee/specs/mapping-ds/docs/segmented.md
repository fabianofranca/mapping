# Segmented

Controle segmentado (`src/ui/controls/Segmented.tsx`): botões unidos numa borda só (`color-border-control`, raio 4). O desenho é a moldura; **cada opção é uma marcação Opção** filha, com a largura que tem no app (o texto com 12 px de cada lado, ou 28 px só com ícone).

- `rotulo`: o nome acessível do grupo (não aparece).
- `invalido`: borda `color-danger`; `desabilitado`: opacidade 0,45.
