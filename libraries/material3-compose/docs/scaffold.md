# Scaffold

Estrutura de uma tela do Material 3: barra do topo, barra de baixo, botão flutuante e conteúdo. Cada marcação filha vai para o espaço do Scaffold pelo tipo dela.

Tipo de anotação: `scaffold` (camada Layout).

## Campos

| Chave                          | Rótulo                     | Tipo | Obrigatório | Opções                                 | Padrão       | Descrição                                                                                             |
| ------------------------------ | -------------------------- | ---- | ----------- | -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `containerColor`               | Cor do fundo               | enum | não         | papéis do `ColorScheme`                | `background` | Papel de cor do tema usado como fundo da tela.                                                        |
| `floatingActionButtonPosition` | Posição do botão flutuante | enum | não         | `Start`, `Center`, `End`, `EndOverlay` | `End`        | Onde fica o FAB (FabPosition). EndOverlay o sobrepõe à barra de baixo.                                |
| `width`                        | Largura                    | enum | não         | `wrap`, `fill`, `fixed`                | `fill`       | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`                       | Altura                     | enum | não         | `wrap`, `fill`, `fixed`                | `fill`       | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |

## Espaços pelo tipo da filha

O Scaffold tem espaços fixos, e cada marcação filha vai para o espaço que o **tipo** dela indica:

| Tipo da filha         | Espaço do Scaffold                |
| --------------------- | --------------------------------- |
| `top-app-bar`         | `topBar`                          |
| `navigation-bar`      | `bottomBar`                       |
| `fab`, `extended-fab` | `floatingActionButton`            |
| qualquer outro        | `content = { innerPadding -> … }` |

Aplique `Modifier.padding(innerPadding)` ao primeiro filho do `content`. Um `bottom-sheet` `standard` não é filha do Scaffold: ele é o próprio `BottomSheetScaffold`, com a tela no `content`.

## Compose

- Símbolo: `androidx.compose.material3.Scaffold`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Scaffold.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Scaffold(
    containerColor = MaterialTheme.colorScheme.background,
    floatingActionButtonPosition = FabPosition.End,
    modifier = Modifier.fillMaxSize(),
    topBar = { /* filha top-app-bar */ },
    bottomBar = { /* filha navigation-bar */ },
    floatingActionButton = { /* filha fab ou extended-fab */ },
) { innerPadding ->
    Column(Modifier.padding(innerPadding)) { /* as demais filhas */ }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> O espaço de cada marcação filha vem do tipo dela: `top-app-bar` vai em `topBar`, `navigation-bar` em `bottomBar`, `fab` e `extended-fab` em `floatingActionButton` e o resto em `content = { innerPadding -> … }`, aplicando `Modifier.padding(innerPadding)` ao primeiro filho do conteúdo. Um `bottom-sheet` `modal` vai no conteúdo (o `ModalBottomSheet` abre sobre a tela); o `standard` é o próprio `BottomSheetScaffold` e substitui o Scaffold. Com width e height `fill`, use `Modifier.fillMaxSize()`; `snackbarHost` e `contentWindowInsets` ficam nos padrões.

## Exemplos

- **Tela padrão**: containerColor=background, floatingActionButtonPosition=End, width=fill, height=fill
- **FAB ao centro**: containerColor=surface, floatingActionButtonPosition=Center, width=fill, height=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Scaffold.kt` (linhas 83 a 94: `Scaffold(containerColor = MaterialTheme.colorScheme.background, floatingActionButtonPosition = FabPosition.End)`; linhas 100 a 105: o fundo é o `Surface(color = containerColor)`, sem elevação tonal; linha 355: `FabSpacing = 16.dp`).
  `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de cor do tema, lidos como tokens (`$token`) nos dois modos.

**Como o desenho segue o Compose**

- O fundo é o papel `containerColor` (padrão `background`), lido do token do papel nos dois modos; antes eram hex fixos, iguais nos dois modos.
- Como o `Surface` do `Scaffold.kt` não passa `tonalElevation`, o fundo não leva a sobreposição tonal.

**O que ainda difere do Compose**

- O Scaffold desenha só o fundo e a área do `content`: `topBar`, `bottomBar`, `snackbarHost` e `floatingActionButton` são filhas (outros tipos) que ficam onde a pessoa as marcou. A posição do FAB (`floatingActionButtonPosition`) e o `FabSpacing` de 16 dp são só informação do campo; não há desenho da posição.
- `contentColor` (`contentColorFor`) e `contentWindowInsets` não são campos do tipo; os filhos escolhem a própria cor.
