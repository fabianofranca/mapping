# Chip

Assist/filter chip: 32 dp, forma small (8), outline; filtro selecionado em secondary container com check.

Tipo de anotação: `m3-chip` (Chip).

## Tamanho

- Inicial: 96 × 32 px
- Mínimo: 40 × 32 px
- Dimensionamento: largura hug, altura 32

## Campos

| Chave      | Rótulo   | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| ---------- | -------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label`    | Label    | string | sim         |                                                                                                      |        |           |
| `selected` | Selected | enum   | não         | sim, não                                                                                             | não    |           |
| `icon`     | Icon     | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |

## Exemplos

- **Padrão**: label=Label, selected=não
- **Selecionado**: label=Label, selected=sim

## Origem externa

Sistema `sdui`: tipo externo `Chip`.

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `label`    | `text`             |
| `selected` | `selected`         |
| `icon`     | `icon`             |
