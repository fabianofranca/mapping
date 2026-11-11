# Extended FAB

Botão de ação flutuante com ícone e texto. Use quando a ação precisa de um rótulo.

Tipo de anotação: `extended-fab` (camada Componentes).

## Campos

| Chave            | Rótulo       | Tipo   | Obrigatório | Opções                                                         | Padrão             | Descrição                                                                                                                                                                                                                                                  |
| ---------------- | ------------ | ------ | ----------- | -------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`           | Texto        | string | sim         |                                                                |                    | Rótulo do botão.                                                                                                                                                                                                                                           |
| `icon`           | Ícone        | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |                    | Ícone antes do texto. Vazio = só texto.                                                                                                                                                                                                                    |
| `expanded`       | Expandido    | enum   | não         | `true`, `false`                                                | `true`             | false recolhe o botão para só o ícone.                                                                                                                                                                                                                     |
| `containerColor` | Cor do botão | enum   | não         | papéis do `ColorScheme`                                        | `primaryContainer` | Papel de cor do tema usado no fundo do botão.                                                                                                                                                                                                              |
| `interaction`    | Interação    | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`             | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O FAB estendido não tem desabilitado (sem enabled): o estado sempre desenha. |

## Compose

- Símbolo: `androidx.compose.material3.ExtendedFloatingActionButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ExtendedFloatingActionButton(
    text = { Text("Criar") },
    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
    onClick = { /* lógica da tela */ },
    expanded = true,
    containerColor = MaterialTheme.colorScheme.primaryContainer,
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Use a sobrecarga `ExtendedFloatingActionButton(text = { Text(<text>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }, onClick = …, expanded = <expanded>)`; sem `icon`, use a de `content = { Text(<text>) }`. Dentro de um Scaffold, vai em `floatingActionButton`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Criar**: text=Criar, icon=Add
- **Recolhido**: text=Editar, icon=Edit, expanded=false, containerColor=secondaryContainer
- **Mouse sobre**: text=Criar, icon=Add, interaction=hovered
- **Com foco**: text=Editar, icon=Edit, containerColor=secondaryContainer, interaction=focused
- **Pressionado**: text=Editar, icon=Edit, expanded=false, containerColor=tertiaryContainer, interaction=pressed
- **Rótulo longo**: text=Criar nota fiscal, icon=Add

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`: o `ExtendedFloatingActionButton` com texto e ícone (linhas 381 a 433: `expanded`, `startPadding` 16 e `endPadding` 20 quando expandido, `Arrangement.Start` expandido e `Center` recolhido, `Spacer` de `ExtendedFabEndIconPadding`), o corpo comum (linhas 134 a 169) e as constantes das linhas 786 a 792 (`ExtendedFabStartIconPadding = 16.dp`, `ExtendedFabEndIconPadding = 12.dp`, `ExtendedFabTextPadding = 20.dp`, `ExtendedFabMinimumWidth = 80.dp`); o recolhido tem largura mínima de `FabBaselineTokens.ContainerWidth` (56). Linhas 107 a 123: o `textStyle` é `ExtendedFabPrimaryTokens.LabelTextFont`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt` (linhas 23 a 45: `ContainerColor = PrimaryContainer`, `ContainerElevation = Level3`, `ContainerHeight = 56.dp`, `ContainerShape = CornerLarge`, `IconSize = 24.dp`, `IconColor` e `LabelTextColor = OnPrimaryContainer`, `LabelTextFont = LabelLarge`) e `ElevationTokens.kt`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (linhas 1064 a 1092: `contentColorFor`) e `tokens/TypeScaleTokens.kt` (`LabelLarge`: 14 sp, 20 de linha, peso 500, 0,1 de espaçamento).

**Como o desenho segue o Compose**

- Altura mínima de 56, `corner-large`, fundo pelo papel de `containerColor` (padrão `primary-container`) e sombra do nível 3.
- **Altura pelas linhas do texto:** `sizing.height` é `hug` e a raiz leva o mínimo de 56 (`minHeight`; o `Box` do `FloatingActionButton` tem `defaultMinSize` de `FabBaselineTokens.ContainerWidth` por `ContainerHeight`, 56 por 56, `FloatingActionButton.kt` linhas 122, 123 e 161). O quadro `conteúdo` e o nó `texto` abraçam a altura e não há padding vertical (a `Row` só tem padding dos lados, linhas 333 e 334 e 402 a 417), então uma e duas linhas (20 e 40) ficam nos 56 do mínimo e três linhas medem 60. O texto quebra no que sobra da largura da marcação: o `maxWidth` do nó `texto` é a largura da instância (`$size.width`) menos os paddings (36 com ícone, 40 sem) e, com ícone, o ícone de 24 e os 12 de espaço (72 no total).
- Expandido com ícone: padding 16 antes do ícone e 20 depois do texto, 12 entre o ícone de 24 e o texto, largura mínima de 80; só texto: padding de 20 dos dois lados. Recolhido (`expanded` falso, com ícone): sem padding e largura mínima de 56, só o ícone.
- O texto lê `label-large-size`, `label-large-line-height`, `label-large-weight` e `label-large-tracking`, sem `family`; o texto e o ícone usam a cor de conteúdo do `contentColorFor` (`primary-container` -> `on-primary-container`…).
- O ícone é o nó `icon`, com o `$switch` do nome do Compose para o nome do conjunto, cobrindo as sugestões do campo.
- Estrutura do desenho: a raiz tem fundo, forma e sombra e guarda os nós de estado e o quadro `conteúdo` (a linha com o ícone e o texto, centralizada), para a camada de estado cobrir o botão inteiro sem entrar na linha; a posição do ícone e do texto é a de antes.
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `texto` usa `font.verticalAlign: "cap-middle"` e abraça a altura da linha (20), com o quadro `conteúdo` centrado na altura do botão, sem mudar a posição horizontal. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `expanded` escolhe o recolhido; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `ExtendedFabPrimaryTokens.kt` do commit define: `hovered` (`Hover*`), `focused` (`Focus*`) e `pressed` (`Pressed*`); não há `Dragged*` nos tokens, então não há `dragged`. O botão do Compose não tem `enabled`, então não há desabilitado: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (`corner-large`), entre o fundo e o conteúdo, com a cor de conteúdo do `containerColor` (a mesma do ícone e do texto: `on-primary-container` no padrão; `Focus*`, `Hover*` e `Pressed*` do `IconColor` e do `LabelTextColor` repetem `OnPrimaryContainer`, linhas 29, 30, 32, 33, 43 e 44 de `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt`) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação por estado** (`ExtendedFabPrimaryTokens.kt`, linhas 25, 28, 31 e 42): o mouse sobre sobe do nível 3 para o 4 (`HoverContainerElevation = Level4`, linha 31); foco e pressionado ficam no nível 3 (`FocusContainerElevation`, linha 28; `PressedContainerElevation`, linha 42). A sombra aceita `$token` em `y` e `blur`, mas não expressão, então a do nível 4 (as duas sombras de `elevation-4-point-*` e `elevation-4-ambient-*`) é de um nó à parte (`sombra elevada`, com o mesmo fundo e a mesma forma, visível só no mouse sobre) e a sombra do contêiner some nesse estado. Foco e pressionado desenham iguais (mesma opacidade, 0,10, e mesmo nível).
- **Lowered:** o `ExtendedFabPrimaryTokens.kt` tem também `LoweredContainerElevation` (nível 1), `LoweredHoverContainerElevation` (nível 2) e as variantes de foco e pressionado (nível 1), usadas por `ExtendedFloatingActionButtonDefaults.loweredElevation()`. O tipo não tem estilo lowered (a elevação base é sempre a do nível 3), então essas elevações não são desenhadas.

**O que ainda difere do Compose**

- As duas sombras vêm dos tokens `elevation-3-point-*` e `elevation-3-ambient-*` (a do nó `sombra elevada`, de `elevation-4-*`), por `$token`. Valores da elevação do Material 3 para a web: `elevation/internal/_elevation.scss` do `material-components/material-web` (versão 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), fonte de fora do Compose, que no Android entrega a elevação à plataforma e não traz os números: sombra de ponto em preto a 30% e sombra ambiente em preto a 15%, com `y`, `blur` e `spread` por nível (tokens `elevation-<n>-point-*` e `elevation-<n>-ambient-*`).
- A animação de expandir e recolher (`AnimatedVisibility`) não existe: o desenho mostra os dois estados fixos. A elevação tonal também fica de fora, como no `fab`.
- O conteúdo expandido fica centralizado na caixa da marcação, como o `Box` do botão. Sem retângulo (instância nova, tela arrumada pelo `layoutScreen`), a largura é a do conteúdo (`sizing.width` `hug`) e a largura de partida do texto é o `size` de 142: um texto mais largo quebra em vez de alargar o botão, onde o Compose, sem limite do pai, não quebra. O exemplo "Rótulo longo" no `size` (142 × 56) mostra as três linhas passando da caixa; o Arrumar a leva a 60.
- Sem ripple animado e sem transição entre estados (o desenho é um quadro parado). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado. A elevação `lowered` do Compose não é um campo do tipo (veja acima).
