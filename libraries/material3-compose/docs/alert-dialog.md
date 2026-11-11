# Alert dialog

Diálogo que interrompe o fluxo para pedir uma decisão ou dar uma informação: ícone opcional, título, texto e até dois botões de texto. Standard monta o conteúdo; basic deixa o conteúdo por conta de quem chama.

Tipo de anotação: `alert-dialog` (camada Componentes).

## Campos

| Chave                | Rótulo             | Tipo   | Obrigatório | Opções                                                         | Padrão     | Descrição                                                                                                                               |
| -------------------- | ------------------ | ------ | ----------- | -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `style`              | Estilo             | enum   | não         | `standard`, `basic`                                            | `standard` | standard (AlertDialog, com título, texto e botões) ou basic (BasicAlertDialog, só a janela: o conteúdo é montado à mão e exige opt-in). |
| `title`              | Título             | string | não         |                                                                |            | Título do diálogo. Vazio = sem título.                                                                                                  |
| `text`               | Texto              | string | não         |                                                                |            | Texto de apoio com os detalhes. Vazio = sem texto.                                                                                      |
| `confirmButton`      | Botão de confirmar | string | sim         |                                                                |            | Rótulo do botão que confirma a ação (obrigatório no AlertDialog).                                                                       |
| `dismissButton`      | Botão de dispensar | string | não         |                                                                |            | Rótulo do botão que dispensa o diálogo. Vazio = só o botão de confirmar.                                                                |
| `icon`               | Ícone              | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |            | Ícone acima do título. Vazio = sem ícone.                                                                                               |
| `contentDescription` | Descrição do ícone | string | não         |                                                                |            | Texto de acessibilidade do ícone (vai no `contentDescription` do Icon). Vazio = ícone decorativo.                                       |

## Compose

- Símbolo: `androidx.compose.material3.AlertDialog`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AlertDialog.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`           | Símbolo            |
| ----------------- | ------------------ |
| `standard` (base) | `AlertDialog`      |
| `basic`           | `BasicAlertDialog` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style standard: AlertDialog
if (showDialog) {
    AlertDialog(
        onDismissRequest = { showDialog = false },
        confirmButton = {
            TextButton(onClick = { /* lógica da tela */ }) { Text("Descartar") }
        },
        dismissButton = {
            TextButton(onClick = { showDialog = false }) { Text("Cancelar") }
        },
        icon = { Icon(Icons.Filled.Delete, contentDescription = null) },
        title = { Text("Descartar rascunho?") },
        text = { Text("O rascunho será apagado e não poderá ser recuperado.") },
    )
}

// style basic: BasicAlertDialog (@OptIn(ExperimentalMaterial3Api::class)), conteúdo montado à mão
BasicAlertDialog(onDismissRequest = { showDialog = false }) {
    Surface(
        shape = AlertDialogDefaults.shape,
        tonalElevation = AlertDialogDefaults.TonalElevation,
    ) {
        Column(Modifier.padding(24.dp)) {
            Text("Sair da conta?", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            Text("Você precisará entrar de novo para ver suas mensagens.")
            Spacer(Modifier.height(24.dp))
            Row(Modifier.align(Alignment.End)) {
                TextButton(onClick = { showDialog = false }) { Text("Cancelar") }
                TextButton(onClick = { /* lógica da tela */ }) { Text("Sair") }
            }
        }
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in: use o overload com `confirmButton` (o de `content` está `@Deprecated` e é experimental). `AlertDialog(onDismissRequest = { … }, confirmButton = { TextButton(onClick = { … }) { Text(<confirmButton>) } }, dismissButton = { TextButton(onClick = { … }) { Text(<dismissButton>) } }, icon = { … }, title = { Text(<title>) }, text = { Text(<text>) })`. `dismissButton`, `icon`, `title` e `text` só entram quando o campo está preenchido (os parâmetros são opcionais e `null` por padrão). `onDismissRequest` fecha o diálogo (limpa o estado que o mostra) e não é chamado pelos botões. Com `icon` preenchido: `icon = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` (sem `contentDescription`, passe `null`); com ícone, o título fica centralizado. A largura vai de 280 a 560 dp pelo conteúdo e o diálogo é uma janela sobre a tela, não parte do layout: declare-o onde o estado que o abre vive (`if (showDialog) AlertDialog(…)`).

Variante `basic`: Exige @OptIn(ExperimentalMaterial3Api::class) (o `BasicAlertDialog` é experimental no commit fixado). Só abre a janela: `BasicAlertDialog(onDismissRequest = { … }) { … }`, e o conteúdo não tem estilo próprio. Para parecer o diálogo do M3, monte `Surface(shape = AlertDialogDefaults.shape, tonalElevation = AlertDialogDefaults.TonalElevation) { Column(Modifier.padding(24.dp)) { … } }` com `Text(<title>, style = MaterialTheme.typography.headlineSmall)`, `Text(<text>, style = MaterialTheme.typography.bodyMedium)` e uma `Row(Modifier.align(Alignment.End))` com `TextButton`s para `dismissButton` e `confirmButton` (espaçamento de 24 dp entre as partes e 8 dp entre os botões). Com `icon` preenchido, o ícone vai antes do título, centralizado: `Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>)` (sem `contentDescription`, passe `null`).

## Exemplos

- **Confirmação com ícone**: style=standard, icon=Delete, title=Descartar rascunho?, text=O rascunho será apagado e não poderá ser recuperado., confirmButton=Descartar, dismissButton=Cancelar
- **Só informação**: style=standard, title=Sincronização concluída, text=Seus dados estão atualizados em todos os dispositivos., confirmButton=OK
- **Basic com título e texto**: style=basic, title=Sair da conta?, text=Você precisará entrar de novo para ver suas mensagens., confirmButton=Sair, dismissButton=Cancelar
- **Botões em duas linhas**: style=standard, title=Descartar rascunho?, text=O rascunho será apagado., confirmButton=Descartar o rascunho agora, dismissButton=Cancelar

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade fica literal no componente, nenhum nó de texto declara `family` (todos herdam `font-sans`) e o ícone é o nó `icon` do conjunto da biblioteca, pelo `$switch` do nome do Compose para o do conjunto, sem caminho SVG no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AlertDialog.kt` (linhas 94 a 110: `AlertDialog` e a ordem dos slots; 219 a 242: `AlertDialogDefaults`, a forma, as cores e `TonalElevation` = 0 dp; 246 a 292: `AlertDialogImpl`, o `buttonContentColor` do token; 295 a 369: `AlertDialogContent`, o `Surface` sem `shadowElevation`, a `Column` com `padding(DialogPadding)`, o ícone no `Box` com `IconPadding` e `align(CenterHorizontally)`, o título com `TitlePadding` e centralizado quando há ícone, o texto com `TextPadding` e `align(Start)`, os botões num `Box` com `align(End)`; 375 a 466: `AlertDialogFlowRow`, 8 de espaço entre os botões e 12 entre as linhas, o botão de confirmar acima do de dispensar; 468 a 478: `DialogMinWidth` 280, `DialogMaxWidth` 560, `ButtonsMainAxisSpacing` 8, `ButtonsCrossAxisSpacing` 12, `DialogPadding` 24, `IconPadding`, `TitlePadding` 16 e `TextPadding` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DialogTokens.kt` (linhas 26 e 27: botões em `Primary` e `LabelLarge`; 29 a 31: contêiner `SurfaceContainerHigh`, `ContainerElevation` `Level3` (não aplicado pelo composable) e forma `CornerExtraLarge`; 32 e 33: título em `OnSurface` e `HeadlineSmall`; 34 e 35: texto em `OnSurfaceVariant` e `BodyMedium`; 36 e 37: ícone de 24 em `Secondary`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (linhas 143 a 147: `defaultMinSize(minWidth = MinWidth, minHeight = MinHeight)`; 418 a 440: `TextButton`; 497 a 510: `TextButtonContentPadding` com 12 de cada lado; 527 e 533: `MinWidth` 58 e `MinHeight` 40) e `Surface.kt` (linha 219: `minimumInteractiveComponentSize()` do `Surface` clicável, que leva o `TextButton` a 48 de altura no layout).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`HeadlineSmall` 24/32/400/0, `BodyMedium` 14/20/400/0,2 e `LabelLarge` 14/20/500/0,1) e `ShapeTokens.kt` (linha 29: `CornerExtraLarge` 28).

**Como o desenho segue o Compose**

- Contêiner `surface-container-high` com `corner-extra-large` (28) e 24 de margem dos quatro lados, sem sombra: o `Surface` do diálogo tem `tonalElevation` 0 e nenhum `shadowElevation`, então o `Level3` do token não é desenhado.
- Ícone do conjunto de 24 em `secondary` (`IconColor`), centralizado, com 16 até o título. Título em `headline-small` (24/32, peso 400) em `on-surface`, a 16 do texto, centralizado quando há ícone e à esquerda sem ele. Texto em `body-medium` (14/20) em `on-surface-variant`, a 24 dos botões. Tudo pelos tokens de tipografia, sem `family`.
- Botões de texto à direita, o de dispensar antes do de confirmar e 8 entre eles. Cada um é um `TextButton`: rótulo em `label-large` (14/20, peso 500, espaçamento 0,1) em `primary`, 12 de cada lado (`TextButtonContentPadding`), largura mínima de 58 (`ButtonDefaults.MinWidth`, o `minWidth` do quadro) e 40 de altura no mínimo (`ButtonDefaults.MinHeight`), com 24 até a borda de baixo, como no Material. A altura do botão abraça o rótulo (`hug`): 8 de respiro em cima e embaixo (`TextButtonContentPadding`, `Button.kt` linhas 469 e 504 a 510) e o mínimo de 40 (linhas 143 a 148); cada botão fica num quadro `área de toque (<botão>)` de no mínimo 48, a área de toque do `TextButton` (`minimumInteractiveComponentSize`), com o botão de 40 centrado nele, e a fileira dos botões abraça esses quadros (e também tem o mínimo de 48). Um rótulo mais longo que a largura da fileira quebra em linhas de 20 (o `conteúdo do rótulo`, uma coluna `hug`, limita o texto à largura do pai) e o botão, a fileira e o diálogo crescem junto: 3 linhas dão um botão de 76.
- Os botões quebram em linhas como o `AlertDialogFlowRow`: a fileira dos botões é `wrap-reverse`, com 8 entre os botões da mesma linha (`ButtonsMainAxisSpacing`, o `gap`) e 12 entre as linhas (`ButtonsCrossAxisSpacing`, o `lineGap`). Quando os dois não cabem na largura da fileira, o de dispensar fica na linha de baixo e o de confirmar vai para a de cima, os dois à direita (`justify: end` vale em cada linha), e a fileira e o diálogo crescem: 48 + 12 + 48.
- Largura de 280 a 560 (`DialogMinWidth` e `DialogMaxWidth`, o `minWidth` e o `maxWidth` da raiz) e altura que abraça o conteúdo (`sizing` com `height: "hug"`). O `sizing` da largura continua 312, o valor de partida do Material.
- O estilo `basic` desenha o mesmo diálogo: o `BasicAlertDialog` só abre a janela e o exemplo do Compose monta o conteúdo com a mesma forma, os mesmos 24 de margem e os mesmos espaços.
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo` dos dois botões usa `font.verticalAlign: "cap-middle"` e a caixa dele é a das linhas (`hug`), centrada na altura do botão como o `Row` do `TextButton` (`verticalAlignment = CenterVertically`, `Button.kt` linha 150). O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- A quebra das linhas dos botões parte do tamanho natural de cada botão (o rótulo numa linha só), a regra do `wrap`: um rótulo que sozinho passa da largura da fileira fica sozinho na linha e quebra dentro do próprio botão, e o texto que muda de altura ao quebrar não muda as linhas. Não há `alignContent`: as linhas ficam juntas, separadas pelos 12.
- A sombra da janela do diálogo (do sistema) e o `scrim` atrás dele não fazem parte do desenho, e o `onDismissRequest`, a janela, o foco e a animação de abertura também não.
- Título de mais de uma linha com ícone: o Compose centraliza a caixa do título e deixa as linhas à esquerda dentro dela; o desenho centraliza cada linha (`font.align: "center"`).
- O texto não rola quando passa da altura da janela (`weight(1f, fill = false)` com o `verticalScroll` da tela), e o conteúdo livre dos slots `title`, `text` e `icon` (composables) não existe: só texto e ícone do conjunto.
- A linha dos botões mede 48 e o `size` é 312 × 248 (o diálogo do exemplo "Confirmação com ícone"): o `TextButton` ocupa 48 no layout, os 40 do botão mais a área de toque mínima de `minimumInteractiveComponentSize` (`Surface.kt` linha 219). O botão desenhado continua com 40 de altura, centrado nos 48 (o quadro `área de toque (<botão>)`), e o rótulo fica a 28 da borda de baixo como no Compose; com os botões em duas linhas a fileira mede 48 + 12 + 48. Os exemplos sem ícone ou com menos texto sobram embaixo (efeito aceito, como na #863).
- Nenhum nó do diálogo tem posição vertical estimada: os espaços são os 24, 16 e 8 do Compose e o rótulo é centrado no botão. O `cap-middle` centra a maiúscula, e não a caixa de linha que o `Text` do Compose centra; com o Roboto a diferença fica abaixo de 1 px.
