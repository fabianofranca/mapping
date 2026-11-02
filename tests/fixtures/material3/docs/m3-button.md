# Button

Common button: filled, tonal, outlined, text ou elevated; 40 dp, forma full.

Tipo de anotação: `m3-button` (Button).

## Tamanho

- Inicial: 120 × 40 px
- Mínimo: 48 × 40 px
- Dimensionamento: largura hug, altura 40

## Campos

| Chave      | Rótulo   | Tipo   | Obrigatório | Opções                                                                                               | Padrão | Descrição |
| ---------- | -------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- | ------ | --------- |
| `label`    | Label    | string | sim         |                                                                                                      |        |           |
| `variant`  | Variant  | enum   | não         | filled, tonal, outlined, text, elevated                                                              | filled |           |
| `icon`     | Icon     | enum   | não         | home, search, person, menu, more, add, check, back, favorite, edit, notifications, chevron, settings |        |           |
| `disabled` | Disabled | enum   | não         | sim, não                                                                                             | não    |           |

## Exemplos

- **Padrão**: label=Label, variant=filled, disabled=não
- **Tonal**: label=Label, variant=tonal, disabled=não
- **Contornado**: label=Label, variant=outlined, disabled=não

## Origem externa

Sistema `sdui`: tipo externo `Button`.

- Props ignoradas: `contentDescription`

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `label`    | `text`             |
| `variant`  | `style`            |
| `icon`     | `icon`             |
| `disabled` | `disabled`         |
