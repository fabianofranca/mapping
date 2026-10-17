# Checkbox

Checkbox de 18 dp (forma 2) com rótulo body-large.

Tipo de anotação: `m3-checkbox` (Checkbox).

## Tamanho

- Inicial: 200 × 40 px
- Mínimo: 40 × 24 px
- Dimensionamento: largura fill, altura 40

## Campos

| Chave     | Rótulo  | Tipo   | Obrigatório | Opções   | Padrão | Descrição |
| --------- | ------- | ------ | ----------- | -------- | ------ | --------- |
| `label`   | Label   | string | não         |          |        |           |
| `checked` | Checked | enum   | não         | sim, não | não    |           |
| `error`   | Error   | enum   | não         | sim, não | não    |           |

## Exemplos

- **Padrão**: label=Label, checked=sim, error=não
- **Desmarcado**: label=Label, checked=não, error=não
- **Com erro**: label=Label, checked=sim, error=sim

## Origem externa

Sistema `sdui`: tipo externo `Checkbox`.

| Campo     | Caminho em `props` |
| --------- | ------------------ |
| `label`   | `label`            |
| `checked` | `checked`          |
| `error`   | `error`            |
