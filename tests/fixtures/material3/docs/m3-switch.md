# Switch

Switch: trilho 52 × 32, alça 24 (ligado) ou 16 (desligado); rótulo opcional.

Tipo de anotação: `m3-switch` (Switch).

## Tamanho

- Inicial: 200 × 32 px
- Mínimo: 52 × 32 px
- Dimensionamento: largura fill, altura 32

## Campos

| Chave      | Rótulo   | Tipo   | Obrigatório | Opções   | Padrão | Descrição |
| ---------- | -------- | ------ | ----------- | -------- | ------ | --------- |
| `label`    | Label    | string | não         |          |        |           |
| `selected` | Selected | enum   | não         | sim, não | não    |           |
| `icon`     | Icon     | enum   | não         | sim, não | não    |           |

## Exemplos

- **Padrão**: label=Label, selected=sim, icon=não
- **Desligado**: label=Label, selected=não, icon=não

## Origem externa

Sistema `sdui`: tipo externo `Switch`.

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `label`    | `label`            |
| `selected` | `checked`          |
| `icon`     | `showIcon`         |
