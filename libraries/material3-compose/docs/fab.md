# FAB

Botão de ação flutuante para a ação principal da tela. Small, regular ou large.

Tipo de anotação: `fab` (camada Componentes).

## Campos

| Chave                | Rótulo       | Tipo   | Obrigatório | Opções                                                         | Padrão             | Descrição                                        |
| -------------------- | ------------ | ------ | ----------- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| `icon`               | Ícone        | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Add`              | Ícone do botão.                                  |
| `contentDescription` | Descrição    | string | não         |                                                                |                    | Texto de acessibilidade do botão.                |
| `size`               | Tamanho      | enum   | não         | `small`, `regular`, `large`                                    | `regular`          | small (40 dp), regular (56 dp) ou large (96 dp). |
| `containerColor`     | Cor do botão | enum   | não         | papéis do `ColorScheme`                                        | `primaryContainer` | Papel de cor do tema usado no fundo do botão.    |

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
