# Top app bar

Small top app bar: 64 dp, surface, ícone de navegação, título title-large e ação.

Tipo de anotação: `m3-top-app-bar` (Top app bar).

## Tamanho

- Inicial: 412 × 64 px
- Mínimo: 200 × 48 px
- Dimensionamento: largura fill, altura 64

## Campos

| Chave        | Rótulo          | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| ------------ | --------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `title`      | Title           | string | sim         |                                                                                                      |        |           |
| `navigation` | Navigation icon | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | menu   |           |
| `action`     | Action icon     | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | more   |           |
| `align`      | Title align     | enum   | não         | start, center                                                                                        | start  |           |

## Exemplos

- **Padrão**: title=Title, navigation=menu, action=more, align=start
- **Centralizado**: title=Title, navigation=menu, action=more, align=center

## Origem externa

Sistema `sdui`: tipo externo `TopAppBar`.

| Campo        | Caminho em `props` |
| ------------ | ------------------ |
| `title`      | `title`            |
| `navigation` | `navigationIcon`   |
| `action`     | `actionIcon`       |
| `align`      | `titleAlign`       |
