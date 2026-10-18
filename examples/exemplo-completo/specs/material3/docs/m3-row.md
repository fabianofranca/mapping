# Row

Container horizontal do Compose: os filhos se enfileiram pela ordem, com spacing e padding.

Tipo de anotação: `m3-row` (Row).

## Tamanho

- Inicial: 380 × 48 px
- Mínimo: 24 × 24 px
- Dimensionamento: largura fill, altura hug

## Campos

| Chave        | Rótulo       | Tipo   | Obrigatório | Opções                                                                   | Padrão | Descrição |
| ------------ | ------------ | ------ | ----------- | ------------------------------------------------------------------------ | ------ | --------- |
| `spacing`    | Spacing (dp) | number | não         |                                                                          | 8      |           |
| `padding`    | Padding (dp) | number | não         |                                                                          | 0      |           |
| `background` | Background   | enum   | não         | none, surface, surface-container, primary-container, secondary-container | none   |           |
| `shape`      | Shape        | enum   | não         | none, small, medium, large, extra-large                                  | none   |           |

## Slot

Este componente tem um slot que recebe os filhos.

## Exemplos

- **Padrão**: background=none, shape=none, spacing=8, padding=0
- **Fundo primário**: background=primary-container, shape=none, spacing=8, padding=0
- **Cantos grandes**: background=none, shape=large, spacing=8, padding=0

## Origem externa

Sistema `sdui`: tipo externo `Row`.

| Campo        | Caminho em `props` |
| ------------ | ------------------ |
| `spacing`    | `spacing`          |
| `padding`    | `padding`          |
| `background` | `background`       |
| `shape`      | `shape`            |
