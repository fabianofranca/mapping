# Text field

Outlined text field: caixa de 56 dp, forma extra-small (4), rótulo flutuante e texto de apoio.

Tipo de anotação: `m3-text-field` (Text field).

## Tamanho

- Inicial: 280 × 80 px
- Mínimo: 120 × 56 px
- Dimensionamento: largura fill, altura 56

## Campos

| Chave         | Rótulo          | Tipo   | Obrigatório | Opções                                                                                               | Padrão  | Descrição |
| ------------- | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------- | --------- |
| `label`       | Label           | string | sim         |                                                                                                      |         |           |
| `value`       | Input text      | string | não         |                                                                                                      |         |           |
| `placeholder` | Placeholder     | string | não         |                                                                                                      |         |           |
| `supporting`  | Supporting text | string | não         |                                                                                                      |         |           |
| `state`       | State           | enum   | não         | enabled, focused, error, disabled                                                                    | enabled |           |
| `trailing`    | Trailing icon   | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |         |           |

## Exemplos

- **Padrão**: label=Label, value=Input text, supporting=Supporting text, state=enabled
- **Focado**: label=Label, value=Input text, supporting=Supporting text, state=focused
- **Com erro**: label=Label, value=Input text, supporting=Supporting text, state=error

## Origem externa

Sistema `sdui`: tipo externo `TextField`.

| Campo         | Caminho em `props` |
| ------------- | ------------------ |
| `label`       | `label`            |
| `value`       | `value`            |
| `placeholder` | `placeholder`      |
| `supporting`  | `supportingText`   |
| `state`       | `state`            |
| `trailing`    | `trailingIcon`     |
