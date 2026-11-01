# Box

Container livre do Compose: os filhos ficam onde o retângulo deles diz.

Tipo de anotação: `m3-box` (Box).

## Tamanho

- Inicial: 200 × 120 px
- Mínimo: 24 × 24 px
- Dimensionamento: largura fill, altura hug

## Campos

| Chave        | Rótulo     | Tipo | Obrigatório | Opções                                                                   | Padrão | Descrição |
| ------------ | ---------- | ---- | ----------- | ------------------------------------------------------------------------ | ------ | --------- |
| `background` | Background | enum | não         | none, surface, surface-container, primary-container, secondary-container | none   |           |
| `shape`      | Shape      | enum | não         | none, small, medium, large, extra-large                                  | none   |           |

## Slot

Este componente tem um slot que recebe os filhos.

## Exemplos

- **Padrão**: background=none, shape=none
- **Fundo primário**: background=primary-container, shape=none
- **Cantos grandes**: background=none, shape=large

## Origem externa

Sistema `sdui`: tipo externo `Box`.

| Campo        | Caminho em `props` |
| ------------ | ------------------ |
| `background` | `background`       |
| `shape`      | `shape`            |
