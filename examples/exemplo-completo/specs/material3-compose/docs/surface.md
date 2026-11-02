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
