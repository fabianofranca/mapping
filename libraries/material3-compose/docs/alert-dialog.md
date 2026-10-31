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
