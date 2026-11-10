# Surface

Superfície com cor, forma e elevação tonal que agrupa conteúdo. Use para painéis, cartões simples e áreas com fundo próprio.

Tipo de anotação: `surface` (camada Layout).

## Campos

| Chave            | Rótulo              | Tipo   | Obrigatório | Opções                                                         | Padrão    | Descrição                                                                                             |
| ---------------- | ------------------- | ------ | ----------- | -------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `color`          | Cor                 | enum   | não         | papéis do `ColorScheme`                                        | `surface` | Papel de cor do tema usado como cor da superfície.                                                    |
| `shape`          | Forma               | enum   | não         | `none`, `extraSmall`, `small`, `medium`, `large`, `extraLarge` | `none`    | Forma do recorte da superfície. none = retângulo.                                                     |
| `tonalElevation` | Elevação tonal (dp) | number | não         |                                                                |           | Elevação tonal em dp (tonalElevation). Vazio = 0.                                                     |
| `width`          | Largura             | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`         | Altura              | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`         | Peso (weight)       | number | não         |                                                                |           | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.material3.Surface`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Surface(
    color = MaterialTheme.colorScheme.surfaceContainer,
    shape = MaterialTheme.shapes.medium,
    tonalElevation = 1.dp,
    modifier = Modifier.fillMaxWidth(),
) {
    Column { /* um só nó raiz */ }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Os filhos vão no `content`, que aceita um só nó raiz (use Row, Column ou Box para vários). `tonalElevation` entra como `tonalElevation = <tonalElevation>.dp` só quando preenchido. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Painel**: color=surfaceContainer, shape=medium, tonalElevation=1
- **Tela cheia**: color=background, shape=none, width=fill, height=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Surface.kt` (linhas 96 a 105: `Surface(shape = RectangleShape, color = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp, shadowElevation = 0.dp)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (linhas 1125 a 1129: `surfaceColorAtElevation`, que cobre a cor `surface` com o `surfaceTint` na opacidade `(4,5 × ln(elevação + 1) + 2) / 100`; linhas 1540 a 1547: `applyTonalElevation`, que só aplica a elevação tonal quando a cor é `surface`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt`: os raios `CornerExtraSmall` (4), `CornerSmall` (8), `CornerMedium` (12), `CornerLarge` (16) e `CornerExtraLarge` (28).
- `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de `color` e o `surface-tint`.

**Como o desenho segue o Compose**

- A forma lê `corner-extra-small` a `corner-extra-large`; `none` é `corner-none` (retângulo).
- A elevação tonal é a sobreposição do `surface-tint` sobre a cor `surface`, com a opacidade da fórmula acima (0,051 em 1 dp até 0,136 em 12 dp), e **só aparece quando `color` é `surface`**, como no `applyTonalElevation`. As outras cores ficam como são.
- Nos dois modos a mesma fórmula vale; a cor de base e o `surface-tint` mudam com o modo.

**O que ainda difere do Compose**

- A elevação tonal é uma tabela por inteiro de 1 a 12 dp (a fórmula usa `ln`, que o formato de expressões não calcula); outro valor usa 0,14.
- Cor do conteúdo herdada (decisão 14): o `surface` e o `scaffold` oferecem o `contentColorFor` da cor de fundo no slot (`provide` de `content-color`; `ColorScheme.kt`, linhas 1064 a 1092, `ColorScheme.contentColorFor`, e 1112 a 1115, que cai no `LocalContentColor` herdado quando a cor não tem par); `Surface.kt`, linhas 100 e 108 (`contentColor = contentColorFor(color)` e `LocalContentColor provides contentColor`). O texto, o ícone e o botão de ícone dentro dele leem esse valor (ver `text`, `icon`, `icon-button` e `icon-toggle-button`); cor sem par (`outline`, `scrim`, os papéis `on-*`…) herda o que o pai ofereceu, e sem pai vale `on-surface`.
- `shadowElevation`, `border` e `onClick` do `Surface` não são campos do tipo.
- Decisão da etapa Material 3 com estados de interação (decisão 12, 2026-11-08): fica a leitura do `Surface.kt` do commit fixado (o `surface-tint` sobre `surface`, pela `tonalElevation`), que a M1 seguiu. A decisão 8 da etapa Material 3 fiel (os papéis `surface-container-*`) vale para os componentes que usam esses papéis (`card`, `list-item`, `navigation-bar`, entre outros), não para a elevação tonal do `surface`. O componente não muda.
