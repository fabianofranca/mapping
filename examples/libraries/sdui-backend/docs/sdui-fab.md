# FAB

Botão de ação flutuante de 56 px, com o ícone de mais ou de anel. O anel usa a regra de preenchimento par-ímpar.

Tipo de anotação: `sdui-fab` (FAB).

## Tamanho

- Inicial: 56 × 56 px
- Mínimo: 40 × 40 px
- Dimensionamento: largura 56, altura 56

## Campos

| Chave   | Rótulo | Tipo | Obrigatório | Opções             | Padrão  |
| ------- | ------ | ---- | ----------- | ------------------ | ------- |
| `icon`  | Icon   | enum | não         | add, ring          | add     |
| `color` | Color  | enum | sim         | primary, secondary | primary |

## Exemplos

- **Mais**: icon=add, color=primary
- **Anel**: icon=ring, color=secondary

## Origem externa

- Sistema `sdui`: tipo externo `FAB`

| Campo   | Caminho em `props` |
| ------- | ------------------ |
| `icon`  | `icon`             |
| `color` | `color`            |
