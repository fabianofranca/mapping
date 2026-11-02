# Box

Empilha os filhos uns sobre os outros e os posiciona por alinhamento. Use para sobreposições, ícones sobre imagens e áreas de fundo.

Tipo de anotação: `box` (camada Layout).

## Campos

| Chave              | Rótulo                  | Tipo   | Obrigatório | Opções                                                                                                              | Padrão     | Descrição                                                                                             |
| ------------------ | ----------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `contentAlignment` | Alinhamento do conteúdo | enum   | não         | `TopStart`, `TopCenter`, `TopEnd`, `CenterStart`, `Center`, `CenterEnd`, `BottomStart`, `BottomCenter`, `BottomEnd` | `TopStart` | Onde os filhos ficam dentro do Box (Alignment).                                                       |
| `background`       | Fundo                   | enum   | não         | `none` e papéis do `ColorScheme`                                                                                    | `none`     | Papel de cor do tema usado como fundo (Modifier.background). none = sem fundo.                        |
| `padding`          | Margem interna (dp)     | number | não         |                                                                                                                     |            | Modifier.padding em dp. Vazio = 0.                                                                    |
| `width`            | Largura                 | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`           | Altura                  | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`           | Peso (weight)           | number | não         |                                                                                                                     |            | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.layout.Box`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Box.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Box(
    contentAlignment = Alignment.Center,
    modifier = Modifier
        .fillMaxWidth()
        .height(120.dp)
        .background(MaterialTheme.colorScheme.primaryContainer)
        .padding(16.dp),
) {
    /* filhas empilhadas; cada uma pode ter Modifier.align(...) */
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Os filhos vão no `content`, empilhados na ordem; cada um pode ter `Modifier.align(...)`. `background` vira `Modifier.background(<cor>)` (omita com `none`) e `padding` vira `Modifier.padding(<padding>.dp)`, nessa ordem depois do tamanho. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Sobreposição centralizada**: contentAlignment=Center, background=primaryContainer, padding=16, width=fill, height=fixed
- **Cantinho**: contentAlignment=TopEnd, background=none
