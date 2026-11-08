# Extended FAB

Botão de ação flutuante com ícone e texto. Use quando a ação precisa de um rótulo.

Tipo de anotação: `extended-fab` (camada Componentes).

## Campos

| Chave            | Rótulo       | Tipo   | Obrigatório | Opções                                                         | Padrão             | Descrição                                     |
| ---------------- | ------------ | ------ | ----------- | -------------------------------------------------------------- | ------------------ | --------------------------------------------- |
| `text`           | Texto        | string | sim         |                                                                |                    | Rótulo do botão.                              |
| `icon`           | Ícone        | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |                    | Ícone antes do texto. Vazio = só texto.       |
| `expanded`       | Expandido    | enum   | não         | `true`, `false`                                                | `true`             | false recolhe o botão para só o ícone.        |
| `containerColor` | Cor do botão | enum   | não         | papéis do `ColorScheme`                                        | `primaryContainer` | Papel de cor do tema usado no fundo do botão. |

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

**O que ainda difere do Compose**

- O `y` (3) e o `blur` (12) da sombra são números, os mesmos de `elevation-3-y` e `elevation-3-blur`: `shadow.y` e `shadow.blur` não aceitam `$token` no formato 4.
- A animação de expandir e recolher (`AnimatedVisibility`) não existe: o desenho mostra os dois estados fixos. A sombra de duas luzes e a elevação tonal também ficam de fora, como no `fab`.
- O conteúdo expandido fica centralizado na caixa da marcação; o Compose o centraliza do mesmo jeito no `Box` do botão, mas a largura de uma instância sem retângulo não é medida por este componente (o `sizing` `hug` só vale para telas arrumadas pelo `layoutScreen`, que mede o slot, e aqui não há slot).
- Sem camadas de estado nem movimento.
