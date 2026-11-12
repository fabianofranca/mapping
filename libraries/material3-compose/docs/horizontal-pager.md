# HorizontalPager

Páginas que se alternam com o deslize horizontal. Use para onboarding, galerias de uma imagem por vez e abas deslizantes.

Tipo de anotação: `horizontal-pager` (camada Layout).

## Campos

| Chave               | Rótulo                    | Tipo   | Obrigatório | Opções                              | Padrão             | Descrição                                                                                             |
| ------------------- | ------------------------- | ------ | ----------- | ----------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `contentPadding`    | Margem do conteúdo (dp)   | number | não         |                                     |                    | Margem interna do pager em dp (PaddingValues). Vazio = 0.                                             |
| `pageSpacing`       | Espaço entre páginas (dp) | number | não         |                                     |                    | Espaço entre as páginas em dp (pageSpacing). Vazio = 0.                                               |
| `verticalAlignment` | Alinhamento vertical      | enum   | não         | `Top`, `CenterVertically`, `Bottom` | `CenterVertically` | Como cada página se alinha no eixo vertical (Alignment).                                              |
| `userScrollEnabled` | Rolagem pelo usuário      | enum   | não         | `true`, `false`                     | `true`             | false trava o deslize (só troca de página por código).                                                |
| `reverseLayout`     | Layout invertido          | enum   | não         | `true`, `false`                     | `false`            | true começa pela última página.                                                                       |
| `width`             | Largura                   | enum   | não         | `wrap`, `fill`, `fixed`             | `wrap`             | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`            | Altura                    | enum   | não         | `wrap`, `fill`, `fixed`             | `wrap`             | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`            | Peso (weight)             | number | não         |                                     |                    | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.pager.HorizontalPager`
- Arquivo (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/pager/Pager.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
val pagerState = rememberPagerState(pageCount = { 3 })   // número de filhas

HorizontalPager(
    state = pagerState,
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxSize(),
) { page ->
    when (page) {
        0 -> { /* filha 1 */ }
        1 -> { /* filha 2 */ }
        else -> { /* filha 3 */ }
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Cada marcação filha é uma página: crie `val pagerState = rememberPagerState(pageCount = { <número de filhas> })`, passe `state = pagerState` e escolha a filha pelo índice no `pageContent = { page -> … }`. `contentPadding` vira `PaddingValues(<contentPadding>.dp)` e `pageSpacing` vira `pageSpacing = <pageSpacing>.dp`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Páginas de onboarding**: verticalAlignment=CenterVertically, width=fill, height=fill
- **Páginas espiando**: contentPadding=32, pageSpacing=16, width=fill, height=fixed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Este tipo é do Foundation, não do Material: não tem arquivo de tokens, e o desenho segue o comportamento do foundation, com os valores vindos dos campos.

**Arquivos usados**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/pager/Pager.kt` (linhas 113 a 125: `HorizontalPager(contentPadding = PaddingValues(0.dp), pageSpacing = 0.dp, verticalAlignment = Alignment.CenterVertically, userScrollEnabled = true, reverseLayout = false)`).

**Como o desenho segue o Compose**

- `verticalAlignment` vira o `align` do slot (`Top` `start`, `CenterVertically` `center`, `Bottom` `end`), por `$switch` (formato 4: expressão em `layout.align`); o padrão é `center`, como no Compose.
- `pageSpacing` é o `gap` e `contentPadding` é o `padding` do slot, que é uma `row`.
- Nenhuma cor, fonte ou raio é desenhado.

**O que ainda difere do Compose**

- `userScrollEnabled`, `pageSize` e o estado de página não existem num desenho estático; as páginas aparecem lado a lado, na ordem da marcação, e `reverseLayout` as põe em ordem inversa a partir do fim (`layout.reverse`).
