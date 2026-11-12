# Spacer

Espaço vazio entre dois componentes. Use para afastar vizinhos com uma medida fixa ou, com peso, para empurrá-los para as pontas.

Tipo de anotação: `spacer` (camada Layout).

## Campos

| Chave    | Rótulo        | Tipo   | Obrigatório | Opções                  | Padrão  | Descrição                                                                                             |
| -------- | ------------- | ------ | ----------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `width`  | Largura       | enum   | não         | `wrap`, `fill`, `fixed` | `fixed` | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height` | Altura        | enum   | não         | `wrap`, `fill`, `fixed` | `fixed` | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight` | Peso (weight) | number | não         |                         |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.layout.Spacer`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Spacer.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Spacer(Modifier.width(16.dp))      // width/height fixed, com as medidas da marcação
Spacer(Modifier.weight(1f))        // weight = 1, dentro de uma Row ou Column
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `Spacer` só recebe um `Modifier`: `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)`, `fill` vira `fillMaxWidth()`/`fillMaxHeight()` e `weight` vira `Modifier.weight(<weight>f)` (o uso comum, para empurrar vizinhos numa Row ou Column). `wrap` não ocupa espaço; não tem filhos.

## Exemplos

- **Espaço de 16 dp**: width=fixed, height=fixed
- **Empurra para a ponta**: weight=1

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Este tipo é do Foundation, não do Material: não tem arquivo de tokens, e o desenho segue o comportamento do foundation, com os valores vindos dos campos.

**Arquivos usados**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Spacer.kt` (linha 38: `Spacer(modifier: Modifier)`, que só ocupa espaço e não desenha nada).
- `ShapeTokens.kt` e `TypeScaleTokens.kt` do Material (`CornerExtraSmall` 4 e `LabelSmall`) e `ColorLightTokens.kt`/`ColorDarkTokens.kt` (`Outline`, `OutlineVariant`), para o desenho de edição.

**Como o desenho segue o Compose**

- O `Spacer` do Compose não desenha: o retângulo tracejado é a ajuda de edição do Mapping. Ele usa só tokens: traço `outline-variant`, raio `corner-extra-small` e as medidas em `label-small` (tamanho, altura de linha, peso e espaçamento) na cor `outline`, com a fonte `font-sans`, nos dois modos.
- As medidas (`width`, `height`, `fixed`, `fill`, `wrap`, `weight`) vêm dos campos e do tamanho da marcação, como `Modifier.width/height/weight`. O texto das medidas fica numa linha só, centrado, e termina em reticências quando a marcação é mais estreita que ele.

**O que ainda difere do Compose**

- A caixa tracejada e o texto das medidas não existem no Compose; mostrá-los é decisão de edição.
- As medidas do texto passaram de 10/14 px para os 11/16 px e o peso 500 de `label-small`, que são os tokens do tema.
