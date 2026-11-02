# Snackbar

Aviso rápido e temporário na parte de baixo da tela, com uma mensagem curta, uma ação opcional e, se quiser, o botão de fechar.

Tipo de anotação: `snackbar` (camada Componentes).

## Campos

| Chave             | Rótulo             | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                                                                           |
| ----------------- | ------------------ | ------ | ----------- | --------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `message`         | Mensagem           | string | sim         |                 |         | Texto do snackbar.                                                                                  |
| `actionLabel`     | Ação               | string | não         |                 |         | Texto do botão de ação. Vazio = sem ação.                                                           |
| `dismissAction`   | Botão de fechar    | enum   | não         | `true`, `false` | `false` | true mostra o botão de fechar (ícone Close) depois da ação.                                         |
| `actionOnNewLine` | Ação em nova linha | enum   | não         | `true`, `false` | `false` | true põe a ação abaixo da mensagem, para textos longos (a altura do retângulo passa de 48 para 68). |

## Compose

- Símbolo: `androidx.compose.material3.Snackbar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Snackbar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
val snackbarHostState = remember { SnackbarHostState() }
val scope = rememberCoroutineScope()

Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { innerPadding ->
    Button(
        onClick = {
            scope.launch {
                snackbarHostState.showSnackbar(
                    message = "Mensagem arquivada",
                    actionLabel = "Desfazer",
                    withDismissAction = true,
                )
            }
        },
        modifier = Modifier.padding(innerPadding),
    ) { Text("Arquivar") }
}

// Visual próprio, sem o host:
Snackbar(
    action = { TextButton(onClick = { /* desfazer */ }) { Text("Desfazer") } },
    dismissAction = { IconButton(onClick = { /* fechar */ }) { Icon(Icons.Filled.Close, contentDescription = "Fechar") } },
    actionOnNewLine = false,
) { Text("Mensagem arquivada") }
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. O snackbar costuma ser mostrado pelo `SnackbarHost` (arquivo `SnackbarHost.kt`) no slot `snackbarHost` do Scaffold: `snackbarHost = { SnackbarHost(snackbarHostState) }`, com `val snackbarHostState = remember { SnackbarHostState() }`, e aparece com `scope.launch { snackbarHostState.showSnackbar(message = <message>, actionLabel = <actionLabel>, withDismissAction = <dismissAction>) }`; nesse caso a `Snackbar` é a padrão do host e não se chama à mão. Para um visual próprio, use `Snackbar(action = { TextButton(onClick = …) { Text(<actionLabel>) } }, dismissAction = { IconButton(onClick = …) { Icon(Icons.Filled.Close, contentDescription = …) } }, actionOnNewLine = <actionOnNewLine>) { Text(<message>) }`: `action` só entra com `actionLabel` preenchido e `dismissAction` só com `dismissAction = true`.

## Exemplos

- **Só mensagem**: message=Arquivo salvo
- **Com ação**: message=Mensagem arquivada, actionLabel=Desfazer
- **Com ação e fechar**: message=Sem conexão, actionLabel=Tentar de novo, dismissAction=true
