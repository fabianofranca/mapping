# FAB

Floating action button: 56 dp, forma large (16), primary container; extended com rótulo.

Tipo de anotação: `m3-fab` (FAB).

## Tamanho

- Inicial: 56 × 56 px
- Mínimo: 40 × 40 px
- Dimensionamento: largura 56, altura 56

## Campos

| Chave   | Rótulo           | Tipo   | Obrigatório | Opções                                                                                               | Padrão  | Descrição |
| ------- | ---------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------- | --------- |
| `icon`  | Icon             | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings | add     |           |
| `label` | Label (extended) | string | não         |                                                                                                      |         |           |
| `color` | Color            | enum   | não         | primary, secondary, surface                                                                          | primary |           |

## Exemplos

- **Padrão**: icon=add, color=primary
- **Secundário**: icon=add, color=secondary
- **Superfície**: icon=add, color=surface

## Origem externa

Sistema `sdui`: tipo externo `FAB`.

| Campo   | Caminho em `props` |
| ------- | ------------------ |
| `icon`  | `icon`             |
| `label` | `label`            |
| `color` | `color`            |
