# Row

Coloca os filhos em linha, da esquerda para a direita. Use para barras de ações, pares ícone e texto e qualquer linha de componentes.

Tipo de anotação: `row` (camada Layout).

## Campos

| Chave                   | Rótulo                  | Tipo   | Obrigatório | Opções                                                                 | Padrão  | Descrição                                                                                              |
| ----------------------- | ----------------------- | ------ | ----------- | ---------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `horizontalArrangement` | Distribuição horizontal | enum   | não         | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Start` | Como os filhos se distribuem no eixo horizontal (Arrangement).                                         |
| `verticalAlignment`     | Alinhamento vertical    | enum   | não         | `Top`, `CenterVertically`, `Bottom`                                    | `Top`   | Como os filhos se alinham no eixo vertical (Alignment).                                                |
| `spacing`               | Espaçamento (dp)        | number | não         |                                                                        |         | Espaço entre os filhos em dp (Arrangement.spacedBy). Vazio = 0.                                        |
| `background`            | Fundo                   | enum   | não         | `none` e papéis do `ColorScheme`                                       | `none`  | Papel de cor do tema usado como fundo (Modifier.background). none = sem fundo.                         |
| `padding`               | Margem interna (dp)     | number | não         |                                                                        |         | Modifier.padding em dp. Vazio = 0.                                                                     |
| `scroll`                | Rolagem                 | enum   | não         | `false`, `true`                                                        | `false` | true torna o conteúdo rolável sem usar lazy (verticalScroll/horizontalScroll com rememberScrollState). |
| `width`                 | Largura                 | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).  |
| `height`                | Altura                  | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).    |
| `weight`                | Peso (weight)           | number | não         |                                                                        |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                      |

## Compose

- Símbolo: `androidx.compose.foundation.layout.Row`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Row.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Row(
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxWidth(),
) {
    /* filhas */
}

// com spacing = 8: horizontalArrangement = Arrangement.spacedBy(8.dp)
// com scroll = true: Modifier.horizontalScroll(rememberScrollState())
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Os filhos vão no `content`. Com `spacing`, passe `Arrangement.spacedBy(<spacing>.dp)` no lugar de `horizontalArrangement` (para manter Center ou End use `Arrangement.spacedBy(<spacing>.dp, Alignment.CenterHorizontally)` ou `Alignment.End`). Monte o `modifier` na ordem tamanho, `background`, `padding` e, com `scroll = true`, `Modifier.horizontalScroll(rememberScrollState())`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Barra de ações**: horizontalArrangement=SpaceBetween, verticalAlignment=CenterVertically, width=fill
- **Linha espaçada**: horizontalArrangement=Start, verticalAlignment=CenterVertically, spacing=8, padding=16
- **Rolagem horizontal**: scroll=true, spacing=12, width=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Row.kt` (linhas 94 a 98: `Row(horizontalArrangement = Arrangement.Start, verticalAlignment = Alignment.Top)`).
  `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de cor do tema, lidos como tokens (`$token`) nos dois modos.

**Como o desenho segue o Compose**

- `horizontalArrangement` vira o `justify` do layout do slot (`Start` em `start`, `End` em `end`, `Center` em `center`, `SpaceBetween` em `space-between`) e `verticalAlignment` vira o `align` (`Top` em `start`, `CenterVertically` em `center`, `Bottom` em `end`); antes o slot ficava sempre em `start`.
- `spacing` é o `gap` (`Arrangement.spacedBy`) e `padding` o recuo do slot, depois do fundo, como na ordem dos `Modifier`.
- O fundo segue o papel do tema nos dois modos; `none` não desenha fundo.
- O slot tem `clip: true` (formato 4): a filha que passa da caixa do componente é cortada na borda. O `Row` do Compose não corta (`Row.kt` linhas 94 a 106: só o `Layout` com a `measurePolicy`, sem `clipToBounds`); o que impede a filha de passar são as restrições de medida, que o formato não tem. O corte é a aproximação visual dessas restrições.

**O que ainda difere do Compose**

- `SpaceAround` e `SpaceEvenly` viram `space-around` e `space-evenly` do `justify`.
- `scroll` só aparece no rótulo: a rolagem não é desenhada.
- O Compose limita os filhos à largura da Row pelas restrições de medida (uma filha de 300 dp numa Row de 200 dp mede 200); o formato corta o que passa da caixa, em vez de encolher a filha. Rolagem não existe. O `weight` das filhas fica fora: o Arrumar não lê campos das filhas.
