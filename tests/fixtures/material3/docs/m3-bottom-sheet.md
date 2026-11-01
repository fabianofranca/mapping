# Bottom sheet

Modal bottom sheet: surface-container-low, cantos superiores extra-large (28), alça de 32 × 4 a 22 dp do topo, título e itens de lista.

Tipo de anotação: `m3-bottom-sheet` (Bottom sheet).

## Tamanho

- Inicial: 412 × 320 px
- Mínimo: 240 × 96 px
- Dimensionamento: largura fill, altura hug

## Campos

| Chave    | Rótulo      | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| -------- | ----------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `title`  | Title       | string | não         |                                                                                                      |        |           |
| `handle` | Drag handle | enum   | não         | sim, não                                                                                             | sim    |           |
| `item1`  | Item 1      | string | não         |                                                                                                      |        |           |
| `icon1`  | Icon 1      | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `item2`  | Item 2      | string | não         |                                                                                                      |        |           |
| `icon2`  | Icon 2      | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `item3`  | Item 3      | string | não         |                                                                                                      |        |           |
| `icon3`  | Icon 3      | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |

## Exemplos

- **Padrão**: title=Title, handle=sim, item1=Item one, icon1=favorite, item2=Item two, icon2=edit, item3=Item three, icon3=settings
- **Sem alça**: title=Title, handle=não, item1=Item one, icon1=favorite, item2=Item two, icon2=edit, item3=Item three, icon3=settings

## Origem externa

Sistema `sdui`: tipo externo `BottomSheet`.

| Campo    | Caminho em `props` |
| -------- | ------------------ |
| `title`  | `title`            |
| `handle` | `dragHandle`       |
| `item1`  | `items[0].label`   |
| `icon1`  | `items[0].icon`    |
| `item2`  | `items[1].label`   |
| `icon2`  | `items[1].icon`    |
| `item3`  | `items[2].label`   |
| `icon3`  | `items[2].icon`    |
