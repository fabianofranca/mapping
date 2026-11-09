# FAB

Botão de ação flutuante para a ação principal da tela. Small, regular ou large.

Tipo de anotação: `fab` (camada Componentes).

## Campos

| Chave                | Rótulo       | Tipo   | Obrigatório | Opções                                                         | Padrão             | Descrição                                                                                                                                                                                                                                        |
| -------------------- | ------------ | ------ | ----------- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `icon`               | Ícone        | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Add`              | Ícone do botão.                                                                                                                                                                                                                                  |
| `contentDescription` | Descrição    | string | não         |                                                                |                    | Texto de acessibilidade do botão.                                                                                                                                                                                                                |
| `size`               | Tamanho      | enum   | não         | `small`, `regular`, `large`                                    | `regular`          | small (40 dp), regular (56 dp) ou large (96 dp).                                                                                                                                                                                                 |
| `containerColor`     | Cor do botão | enum   | não         | papéis do `ColorScheme`                                        | `primaryContainer` | Papel de cor do tema usado no fundo do botão.                                                                                                                                                                                                    |
| `interaction`        | Interação    | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`             | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O FAB não tem desabilitado (sem enabled): o estado sempre desenha. |

## Compose

- Símbolo: `androidx.compose.material3.FloatingActionButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`
- O campo `size` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `size`           | Símbolo                     |
| ---------------- | --------------------------- |
| `regular` (base) | `FloatingActionButton`      |
| `small`          | `SmallFloatingActionButton` |
| `large`          | `LargeFloatingActionButton` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
FloatingActionButton(    // size small: SmallFloatingActionButton, large: LargeFloatingActionButton
    onClick = { /* lógica da tela */ },
    containerColor = MaterialTheme.colorScheme.primaryContainer,
) {
    Icon(Icons.Filled.Add, contentDescription = "Adicionar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> O ícone vai em `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` e `onClick` liga à lógica da tela. `size` troca o composable (Small, regular, Large). Dentro de um Scaffold, o FAB vai em `floatingActionButton`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Adicionar**: icon=Add, contentDescription=Adicionar, size=regular
- **Pequeno terciário**: icon=Edit, size=small, containerColor=tertiaryContainer
- **Grande**: icon=Add, size=large
- **Mouse sobre**: icon=Add, size=regular, interaction=hovered
- **Com foco**: icon=Edit, size=small, containerColor=tertiaryContainer, interaction=focused
- **Pressionado**: icon=Add, size=large, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`: o `FloatingActionButton` (linhas 109 a 132: `shape`, `containerColor`, `contentColor = contentColorFor(containerColor)`, `elevation`), o corpo comum (linhas 134 a 169: um `Surface` com `shadowElevation` e um `Box` com `defaultMinSize` e conteúdo centralizado), o `SmallFloatingActionButton` (linhas 199 a 224, mínimo `FabSmallTokens`), o `LargeFloatingActionButton` (linhas 254 a 280, mínimo `FabLargeTokens`) e `FloatingActionButtonDefaults` (linhas 507 a 555: `LargeIconSize = 36.dp` na linha 510, as formas nas linhas 513 a 523, `containerColor` na 530 e `elevation()` com os valores de `FabPrimaryContainerTokens`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabBaselineTokens.kt` (56 dp, `CornerLarge`, ícone 24), `FabSmallTokens.kt` (40 dp, `CornerMedium`, ícone 24) e `FabLargeTokens.kt` (96 dp, `CornerExtraLarge`, ícone 32).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabPrimaryContainerTokens.kt` (linhas 21 a 31: `ContainerColor = PrimaryContainer`, `ContainerElevation = Level3`, `IconColor = OnPrimaryContainer`) e `ElevationTokens.kt` (`Level3 = 6.dp`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (linhas 1064 a 1092: `contentColorFor`, que casa o papel do contêiner com o da cor de conteúdo; linhas 1112 a 1115: o `contentColorFor` composable, que cai no `LocalContentColor`).
- `ColorLightTokens.kt` e `ColorDarkTokens.kt` (os papéis de `containerColor`) e `ShapeTokens.kt` (`corner-medium` 12, `corner-large` 16, `corner-extra-large` 28).

**Como o desenho segue o Compose**

- O regular tem 56 e `corner-large`; o small, `corner-medium`; o large, `corner-extra-large` (a caixa vem da marcação, o desenho só escolhe o raio pelo campo `size`).
- A cor de fundo é o papel de `containerColor` (padrão `primary-container`), nos dois modos pelo token do papel. O ícone usa a cor de conteúdo que o `contentColorFor` devolve para o papel (`primary-container` -> `on-primary-container`, `primary` -> `on-primary`, `inverse-surface` -> `inverse-on-surface`, `surface-container-*` -> `on-surface`…); os papéis que o Compose não casa caem em `on-surface`, o `LocalContentColor` do tema.
- O ícone é o nó `icon` do conjunto da biblioteca, com o nome do Compose (`Add`) trocado pelo nome do conjunto (`add`) num `$switch` que cobre as sugestões do campo; tem 24, e 36 no large (`LargeIconSize` dos `Defaults`, que o próprio `.kt` marca como diferente do token de 32).
- A sombra é a do nível 3 de elevação (`ContainerElevation`, 6 dp), na cor `elevation-shadow`.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `size` escolhe o tamanho; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `FabPrimaryContainerTokens.kt` do commit define: `hovered`, `focused` e `pressed` (não há `Dragged*` nos tokens do FAB, então não há `dragged`). O FAB do Compose não tem `enabled`, então não há desabilitado: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (a mesma de cada `size`: `corner-medium`, `corner-large` ou `corner-extra-large`), entre o fundo e o ícone, com a cor de conteúdo do `containerColor` (a mesma do ícone: `on-primary-container` no padrão; `FocusedIconColor`, `HoveredIconColor` e `PressedIconColor` repetem `OnPrimaryContainer` nas linhas 25, 27 e 30 de `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FabPrimaryContainerTokens.kt`) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação por estado** (`FabPrimaryContainerTokens.kt`, linhas 23 a 29): o mouse sobre sobe do nível 3 para o 4 (`HoveredContainerElevation = Level4`, linha 26; `ElevationTokens.kt`, linha 28: 8 dp); foco e pressionado ficam no nível 3 (`FocusedContainerElevation` e `PressedContainerElevation`, linhas 24 e 29). A sombra do formato só aceita número literal, então a do nível 4 (y 4, blur 16, os de `elevation-4-y` e `elevation-4-blur`) é de um nó à parte (`sombra elevada`, com o mesmo fundo e a mesma forma, visível só no mouse sobre) e a sombra do contêiner some nesse estado. Foco e pressionado desenham iguais (mesma opacidade, 0,10, e mesmo nível).

**O que ainda difere do Compose**

- O `y` (3) e o `blur` (12) da sombra são números no componente, os mesmos de `elevation-3-y` e `elevation-3-blur`: o formato 4 só aceita `$token` na **cor** da sombra, não em `shadow.y` nem em `shadow.blur`. Uma troca desses tokens na especialização não chega ao desenho.
- A sombra do Compose usa duas luzes (ambiente e direta) e a tonal da elevação sobre `surface`; o formato tem uma sombra só, e a elevação tonal do `FloatingActionButton` sobre o contêiner não é desenhada.
- Sem ripple animado e sem transição entre estados (o desenho é um quadro parado). O anel de foco por fora do botão não é desenhado: a raiz recorta (#896).
- O ícone vem de uma lista fixa de nomes; o `FloatingActionButton` aceita qualquer `@Composable` no conteúdo.
