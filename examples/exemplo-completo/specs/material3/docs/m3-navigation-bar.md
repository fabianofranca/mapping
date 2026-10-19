# Navigation bar

Navigation bar de 80 dp com três destinos; indicador ativo 64 × 32 em secondary container.

Tipo de anotação: `m3-navigation-bar` (Navigation bar).

## Tamanho

- Inicial: 412 × 80 px
- Mínimo: 240 × 64 px
- Dimensionamento: largura fill, altura 80

## Campos

| Chave    | Rótulo  | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| -------- | ------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label1` | Label 1 | string | sim         |                                                                                                      |        |           |
| `icon1`  | Icon 1  | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | home   |           |
| `label2` | Label 2 | string | sim         |                                                                                                      |        |           |
| `icon2`  | Icon 2  | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | search |           |
| `label3` | Label 3 | string | sim         |                                                                                                      |        |           |
| `icon3`  | Icon 3  | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | person |           |
| `active` | Active  | enum   | não         | 1, 2, 3                                                                                              | 1      |           |

## Exemplos

- **Padrão**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=1
- **Segunda aba ativa**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=2
- **Terceira aba ativa**: label1=Home, icon1=home, label2=Search, icon2=search, label3=Profile, icon3=person, active=3

## Origem externa

Sistema `sdui`: tipo externo `NavigationBar`.

| Campo    | Caminho em `props` |
| -------- | ------------------ |
| `label1` | `items[0].label`   |
| `icon1`  | `items[0].icon`    |
| `label2` | `items[1].label`   |
| `icon2`  | `items[1].icon`    |
| `label3` | `items[2].label`   |
| `icon3`  | `items[2].icon`    |
| `active` | `selectedIndex`    |
