# Divider

Linha fina que separa conteúdo. Horizontal separa itens de uma lista ou seções de uma coluna; vertical separa itens lado a lado numa linha.

Tipo de anotação: `divider` (camada Componentes).

## Campos

| Chave         | Rótulo         | Tipo   | Obrigatório | Opções                   | Padrão       | Descrição                                                                                       |
| ------------- | -------------- | ------ | ----------- | ------------------------ | ------------ | ----------------------------------------------------------------------------------------------- |
| `orientation` | Orientação     | enum   | não         | `horizontal`, `vertical` | `horizontal` | horizontal (HorizontalDivider) ou vertical (VerticalDivider).                                   |
| `thickness`   | Espessura (dp) | number | não         |                          |              | Espessura da linha em dp. Vazio = 1 (o padrão do Compose). O desenho aproxima valores de 1 a 4. |
| `inset`       | Recuo (dp)     | number | não         |                          |              | Recuo nas duas pontas da linha, em dp. Vazio = de ponta a ponta (sem recuo).                    |

## Compose

- Símbolo: `androidx.compose.material3.HorizontalDivider`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt`
- O campo `orientation` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `orientation`       | Símbolo             |
| ------------------- | ------------------- |
| `horizontal` (base) | `HorizontalDivider` |
| `vertical`          | `VerticalDivider`   |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
HorizontalDivider(    // orientation vertical: VerticalDivider (mesmos parâmetros)
    thickness = 1.dp,    // sem thickness na anotação: omita (1 dp)
)

// com inset 16: recuo nas duas pontas
HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

// VerticalDivider entre dois itens de uma Row
Row(Modifier.height(48.dp)) {
    Text("Hoje")
    VerticalDivider()
    Text("Ontem")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. `thickness` é um `Dp`: escreva `thickness = <thickness>.dp` (sem o campo, fica o padrão de 1 dp). O `HorizontalDivider` já ocupa a largura toda do pai (`fillMaxWidth()` por dentro); para um recuo nas pontas use `Modifier.padding(horizontal = <inset>.dp)`. A cor padrão é `DividerDefaults.color` (outline variant); só passe `color` se o tema pedir outra. Numa `Column` ou `LazyColumn` vai entre os itens; dentro de um `ListItem` use a posição entre um item e o seguinte.

Variante `vertical`: Estável, sem opt-in. `thickness = <thickness>.dp` (sem o campo, 1 dp). O `VerticalDivider` já ocupa a altura toda do pai (`fillMaxHeight()` por dentro); dentro de uma `Row`, dê a altura à linha com `Modifier.height(<altura da marcação>.dp)` ou deixe a `Row` limitar. Para um recuo no alto e embaixo use `Modifier.padding(vertical = <inset>.dp)`.

## Exemplos

- **Horizontal**: orientation=horizontal
- **Horizontal com recuo**: orientation=horizontal, thickness=1, inset=16
- **Vertical**: orientation=vertical, thickness=1

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt` (linhas 49 a 61: `HorizontalDivider(thickness, color)` com `fillMaxWidth()`; linhas 111 a 118: `DividerDefaults.Thickness` e `DividerDefaults.color`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DividerTokens.kt` (linhas 24 e 25: `Color` = `OutlineVariant`, `Thickness` = 1 dp).
- `ColorLightTokens.kt` e `ColorDarkTokens.kt`: o papel `outline-variant`.

**Como o desenho segue o Compose**

- A linha é um `rect` de `outline-variant`, com a espessura do campo `thickness` (qualquer valor, 1 dp quando vazio) lida por expressão no tamanho do nó: o `rect` de cada espessura (1 a 4) saiu.
- Horizontal: a linha ocupa a largura da caixa; vertical: a altura, como o `fillMaxWidth()` e o `fillMaxHeight()` do Compose. O `inset` recua as duas pontas.
- A linha fica centrada na caixa da marcação.

**O que ainda difere do Compose**

- O parâmetro `color` do Compose não é campo do tipo: a linha é sempre `outline-variant`, a cor padrão (`DividerDefaults.color`).
- O `inset` é o mesmo nas duas pontas (o Compose o faz com `Modifier.padding`, que aceita valores diferentes).
