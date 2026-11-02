# Button

Botão com quatro variantes. O modo troca a decoração do rótulo: sublinhado no link e tachado no botão descontinuado.

Tipo de anotação: `sdui-button` (Button).

## Tamanho

- Inicial: 120 × 40 px
- Mínimo: 64 × 40 px
- Dimensionamento: largura hug, altura 40

## Campos

| Chave      | Rótulo   | Tipo   | Obrigatório | Opções                        | Padrão |
| ---------- | -------- | ------ | ----------- | ----------------------------- | ------ |
| `label`    | Label    | string | sim         |                               |        |
| `variant`  | Variant  | enum   | não         | filled, tonal, outlined, text | filled |
| `mode`     | Mode     | enum   | não         | normal, link, deprecated      | normal |
| `disabled` | Disabled | enum   | não         | sim, não                      | não    |

## Exemplos

- **Padrão**: label=Label, variant=filled, mode=normal, disabled=não
- **Link**: label=Label, variant=text, mode=link, disabled=não
- **Do sistema externo**: nó do sistema `sdui` (`examples/button.sdui.json`)

## Origem externa

- Sistema `sdui`: tipo externo `Button`
- Sistema `figma`: tipo externo `DS/Button`

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `label`    | `text`             |
| `variant`  | `style`            |
| `mode`     | `mode`             |
| `disabled` | `disabled`         |
