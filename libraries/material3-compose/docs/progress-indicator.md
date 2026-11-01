# Progress indicator

Indicador de progresso. Circular gira no lugar; linear é uma barra. Com valor entre 0 e 1 é determinado; sem valor é indeterminado.

Tipo de anotação: `progress-indicator` (camada Componentes).

## Campos

| Chave      | Rótulo    | Tipo   | Obrigatório | Opções               | Padrão     | Descrição                                                                                                                           |
| ---------- | --------- | ------ | ----------- | -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shape`    | Forma     | enum   | não         | `circular`, `linear` | `circular` | circular (CircularProgressIndicator) ou linear (LinearProgressIndicator).                                                           |
| `progress` | Progresso | number | não         |                      |            | Progresso de 0 a 1. Vazio = indeterminado (o desenho mostra um arco ou uma barra parcial; o desenho aproxima o valor ao centésimo). |

## Compose

- Símbolo: `androidx.compose.material3.CircularProgressIndicator`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt`
- O campo `shape` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `shape`           | Símbolo                     |
| ----------------- | --------------------------- |
| `circular` (base) | `CircularProgressIndicator` |
| `linear`          | `LinearProgressIndicator`   |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
CircularProgressIndicator(    // shape linear: LinearProgressIndicator (mesmos parâmetros)
    progress = { 0.6f },    // sem progress na anotação: chame sem este parâmetro (indeterminado)
)

LinearProgressIndicator(
    progress = { uploadProgress },    // estado da tela, de 0f a 1f
    modifier = Modifier.fillMaxWidth(),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Com `progress` preenchido, passe-o como lambda: `progress = { <progress>f }` (ou ligado ao estado da tela, por exemplo `progress = { uploadProgress }`); o overload com `progress: Float` está `@Deprecated`. Com `progress` vazio, chame sem o parâmetro (indeterminado). O tamanho vem do `Modifier` (`Modifier.size(<largura da marcação>.dp)` no circular, que tem 48 dp por padrão; `Modifier.fillMaxWidth()` no linear).

Variante `linear`: Estável, sem opt-in. Com `progress` preenchido, `progress = { <progress>f }`; vazio é indeterminado (sem o parâmetro). A barra ocupa a largura da marcação: `Modifier.fillMaxWidth()` ou `Modifier.width(<largura da marcação>.dp)`.

## Exemplos

- **Circular indeterminado**: shape=circular
- **Circular a 60%**: shape=circular, progress=0.6
- **Linear a 30%**: shape=linear, progress=0.3
