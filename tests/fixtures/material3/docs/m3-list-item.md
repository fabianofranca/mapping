# List item

Item de lista de uma ou duas linhas: avatar ou ícone à esquerda, headline, texto de apoio e ícone à direita.

Tipo de anotação: `m3-list-item` (List item).

## Tamanho

- Inicial: 412 × 72 px
- Mínimo: 120 × 48 px
- Dimensionamento: largura fill, altura 72

## Campos

| Chave        | Rótulo          | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| ------------ | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `headline`   | Headline        | string | sim         |                                                                                                      |        |           |
| `supporting` | Supporting text | string | não         |                                                                                                      |        |           |
| `leading`    | Leading icon    | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `initials`   | Avatar initials | string | não         |                                                                                                      |        |           |
| `trailing`   | Trailing icon   | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |

## Exemplos

- **Padrão**: headline=Headline, supporting=Supporting text, leading=person, trailing=chevron

## Origem externa

Sistema `sdui`: tipo externo `ListItem`.

| Campo        | Caminho em `props` |
| ------------ | ------------------ |
| `headline`   | `headline`         |
| `supporting` | `supportingText`   |
| `leading`    | `leadingIcon`      |
| `initials`   | `avatar.initials`  |
| `trailing`   | `trailingIcon`     |
