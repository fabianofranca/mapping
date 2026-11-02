# Icon

Ícone de 24 dp da família Material. Use sozinho ou dentro de botões, campos e itens de lista.

Tipo de anotação: `icon` (camada Conteúdo).

## Campos

| Chave                | Rótulo    | Tipo   | Obrigatório | Opções                                                         | Padrão | Descrição                                                                                                  |
| -------------------- | --------- | ------ | ----------- | -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `imageVector`        | Ícone     | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Home` | Nome do ícone em Icons.Filled (por exemplo Home). A lista sugere os mais comuns, mas aceita qualquer nome. |
| `contentDescription` | Descrição | string | não         |                                                                |        | Texto de acessibilidade do ícone. Vazio = decorativo (null).                                               |
| `tint`               | Cor       | enum   | não         | papéis do `ColorScheme`                                        |        | Papel de cor do tema usado no ícone. Vazio = cor do conteúdo (LocalContentColor).                          |

## Compose

- Símbolo: `androidx.compose.material3.Icon`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Icon.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Icon(
    imageVector = Icons.Filled.Home,
    contentDescription = "Início",    // sem descrição: null
    tint = MaterialTheme.colorScheme.error,   // só se tint preenchido
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> O ícone vem de `Icons.Filled.<imageVector>`, por exemplo `Icon(imageVector = Icons.Filled.Home, contentDescription = <contentDescription>)`; sem descrição use `contentDescription = null`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`. `tint` só entra quando preenchido; o tamanho é o padrão de 24 dp.

## Exemplos

- **Início**: imageVector=Home, contentDescription=Início
- **Favorito colorido**: imageVector=Favorite, tint=error
