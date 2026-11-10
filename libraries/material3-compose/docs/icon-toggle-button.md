# Icon toggle button

Botão de ícone que liga e desliga (favoritar, fixar, silenciar). Standard, filled, tonal ou outlined, ligado ou desligado.

Tipo de anotação: `icon-toggle-button` (camada Componentes).

## Campos

| Chave                | Rótulo     | Tipo   | Obrigatório | Opções                                                         | Padrão     | Descrição                                                                                                                                                                                                                                |
| -------------------- | ---------- | ------ | ----------- | -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Ícone      | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Favorite` | Ícone do botão.                                                                                                                                                                                                                          |
| `contentDescription` | Descrição  | string | não         |                                                                |            | Texto de acessibilidade do botão (vai no `contentDescription` do Icon). Vazio = sem nome para leitores de tela.                                                                                                                          |
| `style`              | Estilo     | enum   | não         | `standard`, `filled`, `tonal`, `outlined`                      | `standard` | standard (IconToggleButton), filled (FilledIconToggleButton), tonal (FilledTonalIconToggleButton) ou outlined (OutlinedIconToggleButton).                                                                                                |
| `checked`            | Ligado     | enum   | não         | `true`, `false`                                                | `false`    | true liga o botão (cor de seleção do estilo).                                                                                                                                                                                            |
| `enabled`            | Habilitado | enum   | não         | `true`, `false`                                                | `true`     | false desabilita o botão.                                                                                                                                                                                                                |
| `interaction`        | Interação  | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`     | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |

## Compose

- Símbolo: `androidx.compose.material3.IconToggleButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`           | Símbolo                       |
| ----------------- | ----------------------------- |
| `standard` (base) | `IconToggleButton`            |
| `filled`          | `FilledIconToggleButton`      |
| `tonal`           | `FilledTonalIconToggleButton` |
| `outlined`        | `OutlinedIconToggleButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
IconToggleButton(    // style filled: FilledIconToggleButton, tonal: FilledTonalIconToggleButton, outlined: OutlinedIconToggleButton
    checked = checked,
    onCheckedChange = { checked = it },
    enabled = true,
) {
    Icon(Icons.Filled.Favorite, contentDescription = "Favoritar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onCheckedChange` liga à lógica da tela e o ícone vai em `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }`. É costume trocar o ícone quando ligado (por exemplo `Icons.Filled.Favorite` ligado e `Icons.Outlined.FavoriteBorder` desligado): o desenho usa o mesmo `icon` nos dois estados. Nenhum estilo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

## Exemplos

- **Desligado**: icon=Favorite, contentDescription=Favoritar, style=standard, checked=false
- **Preenchido ligado**: icon=Favorite, contentDescription=Favoritar, style=filled, checked=true
- **Contornado ligado**: icon=Notifications, contentDescription=Notificações, style=outlined, checked=true
- **Mouse sobre**: icon=Favorite, contentDescription=Favoritar, style=filled, checked=true, interaction=hovered
- **Com foco**: icon=Notifications, contentDescription=Notificações, style=outlined, checked=false, interaction=focused
- **Pressionado**: icon=Favorite, contentDescription=Favoritar, style=tonal, checked=true, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (linhas 316 a 350: `IconToggleButtonImpl`, o mesmo `Box` de `smallContainerSize()` do `IconButton`, com `containerColor(enabled, checked)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButtonDefaults.kt` (linhas 215 a 232: cores do `IconToggleButton`; 380 a 400: filled; 486 a 504: tonal; 687 a 708: outlined; 787 a 793: a borda do outlined some ligado; 849 a 880: forma `CornerFull` e `smallContainerSize` 40 por 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (`ContainerHeight` 40, `IconSize` 24, `OutlinedOutlineWidth` 1), `tokens/IconButtonTokens.kt`, `FilledIconButtonTokens.kt`, `FilledTonalIconButtonTokens.kt` e `OutlinedIconButtonTokens.kt` (papéis ligado e desligado e opacidades do desabilitado).

**Como o desenho segue o Compose**

- Contêiner de 40 por 40 na forma `corner-full` e ícone de 24 centrado, desenhado pelo nó `icon`.
- Standard: sem fundo; ícone `on-surface` desligado e `primary` ligado.
- Filled: desligado `surface-container` com ícone `on-surface-variant`; ligado `primary` com `on-primary`.
- Tonal: desligado `secondary-container` com `on-secondary-container`; ligado `secondary` com `on-secondary`.
- Outlined: desligado sem fundo, ícone `on-surface` e contorno de 1 em `on-surface`; ligado `inverse-surface` com `inverse-on-surface` e **sem contorno** (`outlinedIconToggleButtonBorder` devolve `null` quando ligado).
- Desabilitado: filled e tonal viram `on-surface` a 0,1 no contêiner (ligado ou não); o ícone e o contorno vão a 0,38 (`state-disabled-content`) sobre `on-surface`. No outlined desabilitado o contêiner é transparente também ligado, como no `defaultOutlinedIconToggleButtonColors`.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `*IconButtonTokens.kt` do commit definem, separados em ligado (`Selected*`) e desligado (`Unselected*`): `hovered`, `focused` e `pressed`; não há `Dragged*` nos tokens, então não há `dragged`.

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (`corner-full`), entre o contorno e o ícone, com a cor de conteúdo que os tokens dão ao estilo e à seleção (`Selected{Hovered,Focused,Pressed}Color` e `Unselected{Hovered,Focused,Pressed}Color`): standard, ligado `primary` e desligado `on-surface-variant` (`IconButtonTokens.kt`, linhas 28, 29, 31 e 32, 33, 35); filled, ligado `on-primary` e desligado `on-surface-variant` (`FilledIconButtonTokens.kt`, linhas 32, 33, 35 e 37, 38, 40); tonal, ligado `on-secondary` e desligado `on-secondary-container` (`FilledTonalIconButtonTokens.kt`, linhas 32, 33, 35 e 37, 38, 40); outlined, ligado `inverse-on-surface` e desligado `on-surface-variant` (`OutlinedIconButtonTokens.kt`, linhas 33, 34, 36 e 38, 39, 42). A `opacity` vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação e contorno:** os tokens do botão de ícone não mudam a elevação nem a cor do contorno entre os estados (o contorno do outlined desligado é `OutlineVariant` nos três, `OutlinedIconButtonTokens.kt`, linha 41, e some ligado); só a camada aparece.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Sem ripple animado e sem transição entre estados nem animação da troca de cor (o desenho é um quadro parado). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- A camada de estado do standard e do outlined desligados usa `on-surface-variant`, a cor que os tokens dão ao estado; o ícone e o contorno parados continuam em `on-surface`, então a camada não tem a mesma cor do ícone nesses dois casos.
- O conteúdo do Compose herda `LocalContentColor`; o desenho fixa `on-surface`.
- O desabilitado de 0,1 no contêiner é literal no componente (o token `state-disabled-container` vale 0,12).
- A forma do estado ligado do Material expressivo (`SelectedContainerShape*`) e as larguras `Narrow` e `Wide` não são campos do tipo.
