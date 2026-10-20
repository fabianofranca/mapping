# Reteste do R3.6a — pergunta de conceito no Claude Code

> Reteste do achado 1 de [`relato-2026-10-20-instanciacao.md`](relato-2026-10-20-instanciacao.md), feito pelo dono numa sessão limpa do Claude Code (passo [pessoa] do R3.6a), em 2026-10-20, depois do PR #188 (`codeHint` em `get_specialization` e `get_project`; o cliente stdio imprimindo as instruções do servidor). Ambiente: repositório de teste montado pela seção 6 do guia, com `assets/sdui.json` do épico (`formatVersion` 5) e o servidor `mcp-v0.6.0-rc.2`, sem projeto aplicado, sem `CLAUDE.md`, skill ou outra orientação.

**Resultado: ✅ passou.** A resposta diz que o `code` é o código de instanciação ("como criar uma instância do componente em cada plataforma"), que o `symbol` é "o que você chama para criar o componente", que o `path` é o arquivo que define o símbolo e serve "para abrir esse arquivo e ler a assinatura real antes de escrever a chamada", e que o arquivo está no repositório declarado pela especialização (ou no clone local, quando houver projeto). Não fala em código gerado para a anotação, nem em onde a instância foi implementada, nem em o mapeamento guardar a solução. O agente leu a especialização em `assets/sdui.json` e chamou `get_component` (a resposta cita `definition.path`, `localFile`, `exists` e `hasComponent: false`).

## Pergunta

> O que é o `code` do tipo Button desta especialização, para que serve o `path` e onde está esse arquivo?

## Resposta literal

No Button da especialização `sdui` (v3), o `code` é o **código de instanciação** do tipo. Ele diz como criar uma instância do componente em cada plataforma. Não há projeto Mapping aplicado, então li direto de `assets/sdui.json`.

### O que é o `code`

Cada plataforma tem as chaves abaixo:

| Chave             | Significado                                                   |
| ----------------- | ------------------------------------------------------------- |
| `symbol`          | O que você chama para criar o componente.                     |
| `definition.path` | O arquivo que define esse símbolo.                            |
| `params`          | Mapa de campo da anotação para nome do parâmetro na chamada.  |
| `values`          | Mapa de valor do campo para valor no código.                  |
| `notes`           | Observações extras.                                           |

Para o Button, o `symbol` de cada plataforma é:

| Plataforma | `symbol`                  | Parâmetros                                                                 |
| ---------- | ------------------------- | -------------------------------------------------------------------------- |
| Android    | `com.app.ds.DSButton`     | `texto`→`text`, `estilo`→`style`, `habilitado`→`enabled`                   |
| iOS        | `DSButton`                | `texto`→`title`, `estilo`→`style`, `habilitado`→`isEnabled`                |
| BFF        | `com.app.bff.sdui.button` | `id`→`id`, `texto`→`label`, `estilo`→`variant`, `habilitado`→`enabled`     |

- **Valores do campo `estilo`:** no Android, `primary` vira `ButtonStyle.Primary`. No iOS, vira `.primary`.
- **Valores do campo `habilitado`:** `sim` vira `true` e `não` vira `false`.
- **Notas:** no Android, use o modifier `testTag` com o valor do campo `id`. No BFF, a função devolve o nó do componente no JSON da tela.

### Para que serve o `path`

O `path` indica **o arquivo onde o símbolo está definido**. Serve para você abrir esse arquivo e ler a assinatura real (parâmetros, tipos, defaults) antes de escrever a chamada. Ele é relativo à raiz do repositório da plataforma.

### Onde está o arquivo

Os arquivos ficam em repositórios externos, na ref `v3`:

- **Android:** `app/src/main/java/com/app/ds/DSButton.kt`, em https://github.com/org/app-android/blob/v3/app/src/main/java/com/app/ds/DSButton.kt
- **iOS:** `App/DesignSystem/DSButton.swift`, em https://github.com/org/app-ios/blob/v3/App/DesignSystem/DSButton.swift
- **BFF:** `src/main/kotlin/com/app/bff/sdui/Components.kt`, em https://github.com/org/bff/blob/v3/src/main/kotlin/com/app/bff/sdui/Components.kt

Neste ambiente os arquivos não estão disponíveis localmente. `localFile` e `exists` vêm `null`, porque não há projeto com clone local das bibliotecas. As URLs de exemplo (`github.com/org/...`) parecem placeholders, e não conferi se existem.

O tipo também não tem componente nem documento na biblioteca (`hasComponent: false`). Ele só traz os campos `id`, `texto`, `estilo` e `habilitado`.
