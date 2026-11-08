# Segmented

Controle segmentado, do `src/ui/controls/Segmented.tsx`: botões unidos numa borda só (`color-border-control`, raio 4), um por opção, com uma selecionada.

## Campos

- `opcoes`: uma linha por opção do `items` (`rotulo` e se é a `selecionada`). Marque só uma.
- `rotulo`: o nome acessível do grupo (não aparece no desenho).
- `invalido`: borda de `color-danger`; `desabilitado`: opacidade 0,45.

A opção selecionada fica cheia de `color-accent` com o texto em `color-accent-text`. As opções só com ícone (`icon`) não são desenhadas: o desenho mostra o rótulo de todas.
