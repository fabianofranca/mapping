# Icon button

Botão só com ícone para uma ação (editar, adicionar, mais opções). Standard, filled, tonal ou outlined.

Tipo de anotação: `icon-button` (camada Componentes).

## Campos

| Chave                | Rótulo     | Tipo   | Obrigatório | Opções                                                         | Padrão     | Descrição                                                                                                                                                                                                                                |
| -------------------- | ---------- | ------ | ----------- | -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Ícone      | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Favorite` | Ícone do botão.                                                                                                                                                                                                                          |
| `contentDescription` | Descrição  | string | não         |                                                                |            | Texto de acessibilidade do botão (vai no `contentDescription` do Icon). Vazio = sem nome para leitores de tela.                                                                                                                          |
| `style`              | Estilo     | enum   | não         | `standard`, `filled`, `tonal`, `outlined`                      | `standard` | standard (IconButton), filled (FilledIconButton), tonal (FilledTonalIconButton) ou outlined (OutlinedIconButton).                                                                                                                        |
| `enabled`            | Habilitado | enum   | não         | `true`, `false`                                                | `true`     | false desabilita o botão.                                                                                                                                                                                                                |
| `interaction`        | Interação  | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`     | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |

## Compose

- Símbolo: `androidx.compose.material3.IconButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`           | Símbolo                 |
| ----------------- | ----------------------- |
| `standard` (base) | `IconButton`            |
| `filled`          | `FilledIconButton`      |
| `tonal`           | `FilledTonalIconButton` |
| `outlined`        | `OutlinedIconButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
IconButton(    // style filled: FilledIconButton, tonal: FilledTonalIconButton, outlined: OutlinedIconButton
    onClick = { /* lógica da tela */ },
    enabled = true,
) {
    Icon(Icons.Filled.Edit, contentDescription = "Editar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e o ícone vai em `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` (sem `contentDescription`, passe `null`). O container é de 40 dp com forma full; nenhum estilo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

## Exemplos

- **Padrão**: icon=Edit, contentDescription=Editar, style=standard
- **Preenchido**: icon=Add, contentDescription=Adicionar, style=filled
- **Contornado desabilitado**: icon=Settings, contentDescription=Ajustes, style=outlined, enabled=false
- **Mouse sobre**: icon=Edit, contentDescription=Editar, style=standard, interaction=hovered
- **Com foco**: icon=Settings, contentDescription=Ajustes, style=outlined, interaction=focused
- **Pressionado**: icon=Add, contentDescription=Adicionar, style=tonal, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt` (linhas 164 a 193: `IconButtonImpl`, um `Box` de `smallContainerSize()` recortado e pintado na forma, com o conteúdo centrado).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButtonDefaults.kt` (linhas 88 e 325 a 447: as cores padrão do `IconButton` (conteúdo `LocalContentColor`), do filled e do tonal; 557 a 570: o outlined; 819 a 830: a borda do outlined, na cor do conteúdo; 849 a 880: formas `CornerFull` e `smallContainerSize` = ícone 24 + 8 + 8 de cada lado por 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (`ContainerHeight` 40, `IconSize` 24, `DefaultLeadingSpace` 8, `OutlinedOutlineWidth` 1) e `tokens/FilledIconButtonTokens.kt`, `FilledTonalIconButtonTokens.kt`, `OutlinedIconButtonTokens.kt`, `IconButtonTokens.kt` (papéis e opacidades do desabilitado: 0,1 no contêiner, 0,38 no conteúdo).

**Como o desenho segue o Compose**

- Contêiner de 40 por 40 na forma `corner-full`, com o ícone de 24 centrado, desenhado pelo nó `icon` (nome do Compose para o nome do conjunto, como no `icon`).
- Standard: sem fundo e ícone `on-surface`. Filled: `primary` / `on-primary`. Tonal: `secondary-container` / `on-secondary-container`. Outlined: sem fundo, ícone e contorno de 1 em `on-surface` (o `outlinedIconButtonBorder` do commit usa a cor do conteúdo, não o token `outline-variant`).
- Desabilitado: filled e tonal viram `on-surface` a 0,1 no contêiner; o ícone e o contorno vão a 0,38 (`state-disabled-content`) sobre `on-surface`.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `*IconButtonTokens.kt` do commit definem: `hovered` (`Hovered*`), `focused` (`Focused*`) e `pressed` (`Pressed*`); não há `Dragged*` nos tokens do botão de ícone, então não há `dragged`.

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (`corner-full`), entre o contorno e o ícone, com a cor de conteúdo do estilo que os tokens dão ao estado: `on-surface-variant` no standard e no outlined (`IconButtonTokens.kt` e `OutlinedIconButtonTokens.kt`, `HoveredColor`, `FocusedColor` e `PressedColor`, linhas 24, 25 e 27 e 25, 26 e 29), `on-primary` no filled (`FilledIconButtonTokens.kt`, linhas 27, 28 e 30) e `on-secondary-container` no tonal (`FilledTonalIconButtonTokens.kt`, linhas 27, 28 e 30). A `opacity` vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação e contorno:** os tokens do botão de ícone não mudam a elevação nem a cor do contorno entre os estados (o contorno do outlined é `OutlineVariant` nos três, `OutlinedIconButtonTokens.kt`, linha 28); só a camada aparece.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Sem ripple animado e sem transição entre estados (o desenho é um quadro parado). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- A camada de estado do standard e do outlined usa `on-surface-variant`, a cor que os tokens dão ao estado; o ícone e o contorno parados continuam em `on-surface` (a divergência acima), então a camada não tem a mesma cor do ícone nesses dois estilos.
- O conteúdo do `standard` e do `outlined` é o `LocalContentColor` (`IconButtonDefaults.kt`, linhas 44 e 515): o desenho lê a cor do conteúdo herdada (`on-surface` sem pai) quando o botão está habilitado. O `filled` e o `tonal` têm conteúdo próprio (`on-primary`, `on-secondary-container`) e o desabilitado segue `on-surface`: esses não herdam.
- O desabilitado de 0,1 no contêiner é literal no componente (o token `state-disabled-container` vale 0,12).
- `minimumInteractiveComponentSize` (48 de área de toque) não é campo do tipo; `shape` e `width` (largura em dp) são campos e código, mas o desenho não os usa; as larguras `Narrow` e `Wide` não têm campo próprio.
