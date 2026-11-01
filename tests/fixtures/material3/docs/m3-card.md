# Card

Card elevated, filled ou outlined; forma medium (12); headline, subhead, texto de apoio e espaço para ações.

Tipo de anotação: `m3-card` (Card).

## Tamanho

- Inicial: 360 × 200 px
- Mínimo: 160 × 96 px
- Dimensionamento: largura fill, altura hug

## Campos

| Chave      | Rótulo          | Tipo   | Obrigatório | Opções                     | Padrão   | Descrição |
| ---------- | --------------- | ------ | ----------- | -------------------------- | -------- | --------- |
| `headline` | Headline        | string | sim         |                            |          |           |
| `subhead`  | Subhead         | string | não         |                            |          |           |
| `body`     | Supporting text | string | não         |                            |          |           |
| `variant`  | Variant         | enum   | não         | elevated, filled, outlined | elevated |           |

## Slot

Este componente tem um slot que recebe os filhos (`ações`).

## Exemplos

- **Padrão**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=elevated
- **Preenchido**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=filled
- **Contornado**: headline=Headline, subhead=Subhead, body=Explain more about the topic shown in the headline and subhead through supporting text., variant=outlined

## Origem externa

Sistema `sdui`: tipo externo `Card`.

- Slot: `ações`

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `headline` | `headline`         |
| `subhead`  | `subhead`          |
| `body`     | `body`             |
| `variant`  | `style`            |
