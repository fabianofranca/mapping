# Icon

Ícone de 24 dp da família Material. Use sozinho ou dentro de botões, campos e itens de lista.

Tipo de anotação: `icon` (camada Conteúdo).

## Campos

| Chave                | Rótulo    | Tipo   | Obrigatório | Opções                                                         | Padrão | Descrição                                                                                                                                                 |
| -------------------- | --------- | ------ | ----------- | -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageVector`        | Ícone     | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Home` | Nome do ícone em Icons.Default (por exemplo Home). A lista sugere os 164 ícones do conjunto da biblioteca; um nome fora dela desenha o reservado e avisa. |
| `contentDescription` | Descrição | string | não         |                                                                |        | Texto de acessibilidade do ícone. Vazio = decorativo (null).                                                                                              |
| `tint`               | Cor       | enum   | não         | papéis do `ColorScheme`                                        |        | Papel de cor do tema usado no ícone. Vazio = cor do conteúdo (LocalContentColor).                                                                         |

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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Icon.kt` (linhas 65 a 70: `tint = LocalContentColor.current`; linhas 207 a 219: o tamanho padrão `SmallIconButtonTokens.IconSize`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SmallIconButtonTokens.kt` (linha 29: `IconSize` = 24 dp).
- `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de `tint`.
- Os desenhos dos ícones vêm do pacote npm `@material-design-icons/svg` 0.14.15, pasta `filled` (o `Icons.Default` do Compose), em `icons/material-icons.json` (origem e licença em `icons/LEIA-ME.txt` e `icons/LICENSE-material-icons.txt`).

**Como o desenho segue o Compose**

- O nó `icon` do formato 4 escolhe o desenho no conjunto da biblioteca. O campo `imageVector` guarda o nome do Compose (`Home`, `KeyboardArrowRight`, o que vai em `Icons.Default.<nome>`) e o componente o traduz para o nome do conjunto (`home`, `keyboard_arrow_right`) por um `$switch`; os `$switch` de caminhos SVG saíram do componente.
- O tamanho é o do `viewBox` do ícone (24 por 24), escalado para a caixa da marcação.
- A cor é o papel de `tint`; sem `tint`, a cor do conteúdo herdada (`Icon.kt`, linha 69: `tint = LocalContentColor.current`): dentro de um `surface` ou `scaffold` sai na cor que o pai oferece, e sem pai, em `on-surface`.

**O que ainda difere do Compose**

- O conjunto tem um subconjunto fechado do `Icons.Default` (ver as sugestões do campo `imageVector`). Um nome fora dele desenha o reservado (um quadrado contornado) e o Diagnóstico mostra o aviso `ícone desconhecido`; para usar outro ícone, acrescente-o ao conjunto (`icons/LEIA-ME.txt`).
- Só a variante `Filled`: `Outlined`, `Rounded`, `Sharp` e `TwoTone` ficam fora da etapa.
- Os ícones que espelham em idiomas da direita para a esquerda (`Icons.AutoMirrored.Filled`) desenham sempre na direção da esquerda para a direita.
- `PhotoCamera` e os outros ícones do pacote que têm formas além de `<path>` (círculo, por exemplo) não estão no subconjunto.
