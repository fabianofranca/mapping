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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Box.kt` (linhas 65 a 70: `Box(contentAlignment = Alignment.TopStart, propagateMinConstraints = false)`; sem `Defaults` de tamanho: o Box mede o conteúdo).
  `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de cor do tema, lidos como tokens (`$token`) nos dois modos.

**Como o desenho segue o Compose**

- `background` e o fundo seguem o papel do tema nos dois modos; `none` não desenha fundo (o `Modifier.background` é opcional).
- O `padding` recua a área do conteúdo (o fundo cobre o Box inteiro, como `Modifier.background(...).padding(...)`).
- O padrão de `contentAlignment` é `TopStart`, o do `Box.kt`.

**O que ainda difere do Compose**

- `contentAlignment` só aparece no rótulo da área do conteúdo: o formato não alinha filhas sobrepostas (o layout de slot `row`/`column` empilha, o do Box sobrepõe), então cada filha fica onde a pessoa a marcou.
- `propagateMinConstraints` e as restrições mínimas do pai não são campos do tipo.
