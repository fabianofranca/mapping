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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`: o `ExtendedFloatingActionButton` com texto e ícone (linhas 381 a 433: `expanded`, `startPadding` 16 e `endPadding` 20 quando expandido, `Arrangement.Start` expandido e `Center` recolhido, `Spacer` de `ExtendedFabEndIconPadding`), o corpo comum (linhas 134 a 169) e as constantes das linhas 786 a 792 (`ExtendedFabStartIconPadding = 16.dp`, `ExtendedFabEndIconPadding = 12.dp`, `ExtendedFabTextPadding = 20.dp`, `ExtendedFabMinimumWidth = 80.dp`); o recolhido tem largura mínima de `FabBaselineTokens.ContainerWidth` (56). Linhas 107 a 123: o `textStyle` é `ExtendedFabPrimaryTokens.LabelTextFont`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt` (linhas 23 a 45: `ContainerColor = PrimaryContainer`, `ContainerElevation = Level3`, `ContainerHeight = 56.dp`, `ContainerShape = CornerLarge`, `IconSize = 24.dp`, `IconColor` e `LabelTextColor = OnPrimaryContainer`, `LabelTextFont = LabelLarge`) e `ElevationTokens.kt`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ColorScheme.kt` (linhas 1064 a 1092: `contentColorFor`) e `tokens/TypeScaleTokens.kt` (`LabelLarge`: 14 sp, 20 de linha, peso 500, 0,1 de espaçamento).

**Como o desenho segue o Compose**

- 56 de altura (a caixa da marcação), `corner-large`, fundo pelo papel de `containerColor` (padrão `primary-container`) e sombra do nível 3.
- Expandido com ícone: padding 16 antes do ícone e 20 depois do texto, 12 entre o ícone de 24 e o texto, largura mínima de 80; só texto: padding de 20 dos dois lados. Recolhido (`expanded` falso, com ícone): sem padding e largura mínima de 56, só o ícone.
- O texto lê `label-large-size`, `label-large-line-height`, `label-large-weight` e `label-large-tracking`, sem `family`; o texto e o ícone usam a cor de conteúdo do `contentColorFor` (`primary-container` -> `on-primary-container`…).
- O ícone é o nó `icon`, com o `$switch` do nome do Compose para o nome do conjunto, cobrindo as sugestões do campo.
- Estrutura do desenho: a raiz tem fundo, forma e sombra e guarda os nós de estado e o quadro `conteúdo` (a linha com o ícone e o texto, centralizada), para a camada de estado cobrir o botão inteiro sem entrar na linha; a posição do ícone e do texto é a de antes.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `expanded` escolhe o recolhido; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `ExtendedFabPrimaryTokens.kt` do commit define: `hovered` (`Hover*`), `focused` (`Focus*`) e `pressed` (`Pressed*`); não há `Dragged*` nos tokens, então não há `dragged`. O botão do Compose não tem `enabled`, então não há desabilitado: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (`corner-large`), entre o fundo e o conteúdo, com a cor de conteúdo do `containerColor` (a mesma do ícone e do texto: `on-primary-container` no padrão; `Focus*`, `Hover*` e `Pressed*` do `IconColor` e do `LabelTextColor` repetem `OnPrimaryContainer`, linhas 29, 30, 32, 33, 43 e 44 de `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExtendedFabPrimaryTokens.kt`) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação por estado** (`ExtendedFabPrimaryTokens.kt`, linhas 25, 28, 31 e 42): o mouse sobre sobe do nível 3 para o 4 (`HoverContainerElevation = Level4`, linha 31); foco e pressionado ficam no nível 3 (`FocusContainerElevation`, linha 28; `PressedContainerElevation`, linha 42). A sombra do formato só aceita número literal, então a do nível 4 (y 4, blur 16, os de `elevation-4-y` e `elevation-4-blur`) é de um nó à parte (`sombra elevada`, com o mesmo fundo e a mesma forma, visível só no mouse sobre) e a sombra do contêiner some nesse estado. Foco e pressionado desenham iguais (mesma opacidade, 0,10, e mesmo nível).
- **Lowered:** o `ExtendedFabPrimaryTokens.kt` tem também `LoweredContainerElevation` (nível 1), `LoweredHoverContainerElevation` (nível 2) e as variantes de foco e pressionado (nível 1), usadas por `ExtendedFloatingActionButtonDefaults.loweredElevation()`. O tipo não tem estilo lowered (a elevação base é sempre a do nível 3), então essas elevações não são desenhadas.

**O que ainda difere do Compose**

- O `y` (3) e o `blur` (12) da sombra são números, os mesmos de `elevation-3-y` e `elevation-3-blur`: `shadow.y` e `shadow.blur` não aceitam `$token` no formato 4.
- A animação de expandir e recolher (`AnimatedVisibility`) não existe: o desenho mostra os dois estados fixos. A sombra de duas luzes e a elevação tonal também ficam de fora, como no `fab`.
- O conteúdo expandido fica centralizado na caixa da marcação; o Compose o centraliza do mesmo jeito no `Box` do botão, mas a largura de uma instância sem retângulo não é medida por este componente (o `sizing` `hug` só vale para telas arrumadas pelo `layoutScreen`, que mede o slot, e aqui não há slot).
- Sem ripple animado e sem transição entre estados (o desenho é um quadro parado). O anel de foco por fora do botão não é desenhado: a raiz recorta (#896). A elevação `lowered` do Compose não é um campo do tipo (veja acima).
