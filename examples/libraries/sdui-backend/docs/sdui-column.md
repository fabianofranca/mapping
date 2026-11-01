# Column

Container vertical: os filhos se empilham pela ordem, com spacing e padding.

Tipo de anotação: `sdui-column` (Column).

## Tamanho

- Inicial: 380 × 200 px
- Mínimo: 24 × 24 px
- Dimensionamento: largura fill, altura hug

## Campos

| Chave     | Rótulo  | Tipo   | Obrigatório | Opções | Padrão |
| --------- | ------- | ------ | ----------- | ------ | ------ |
| `spacing` | Spacing | number | não         |        | 8      |
| `padding` | Padding | number | não         |        | 0      |

## Slot

Este componente tem um slot que recebe os filhos (`content`).

## Exemplos

- **Padrão**: spacing=8, padding=0
- **Espaçada**: spacing=16, padding=16

## Origem externa

- Sistema `sdui`: tipo externo `Column`, slot `content`

| Campo     | Caminho em `props` |
| --------- | ------------------ |
| `spacing` | `spacing`          |
| `padding` | `padding`          |
