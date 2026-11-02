# Bottom sheet

Folha modal: logo, título, legenda e rodapé. A legenda fica no topo da caixa, o rodapé no fundo, e a linha do rodapé alinha no fim.

Tipo de anotação: `sdui-sheet` (Bottom sheet).

## Tamanho

- Inicial: 412 × 220 px
- Mínimo: 240 × 200 px
- Dimensionamento: largura fill, altura 220

## Campos

| Chave      | Rótulo   | Tipo   | Obrigatório | Opções | Padrão |
| ---------- | -------- | ------ | ----------- | ------ | ------ |
| `title`    | Title    | string | sim         |        |        |
| `subtitle` | Subtitle | string | não         |        |        |
| `footer`   | Footer   | string | não         |        |        |

## Exemplos

- **Ordenar**: title=Sort by, subtitle=Escolha a ordem da lista, footer=Cancelar

## Origem externa

- Sistema `sdui`: tipo externo `BottomSheet`

| Campo      | Caminho em `props` |
| ---------- | ------------------ |
| `title`    | `title`            |
| `subtitle` | `subtitle`         |
| `footer`   | `footer`           |
