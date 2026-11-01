# Spacer

Espaço vazio entre dois componentes. Use para afastar vizinhos com uma medida fixa ou, com peso, para empurrá-los para as pontas.

Tipo de anotação: `spacer` (camada Layout).

## Campos

| Chave    | Rótulo        | Tipo   | Obrigatório | Opções                  | Padrão  | Descrição                                                                                             |
| -------- | ------------- | ------ | ----------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `width`  | Largura       | enum   | não         | `wrap`, `fill`, `fixed` | `fixed` | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height` | Altura        | enum   | não         | `wrap`, `fill`, `fixed` | `fixed` | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight` | Peso (weight) | number | não         |                         |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.layout.Spacer`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Spacer.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Spacer(Modifier.width(16.dp))      // width/height fixed, com as medidas da marcação
Spacer(Modifier.weight(1f))        // weight = 1, dentro de uma Row ou Column
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `Spacer` só recebe um `Modifier`: `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)`, `fill` vira `fillMaxWidth()`/`fillMaxHeight()` e `weight` vira `Modifier.weight(<weight>f)` (o uso comum, para empurrar vizinhos numa Row ou Column). `wrap` não ocupa espaço; não tem filhos.

## Exemplos

- **Espaço de 16 dp**: width=fixed, height=fixed
- **Empurra para a ponta**: weight=1
