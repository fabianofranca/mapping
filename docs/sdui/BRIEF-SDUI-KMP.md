# Briefing: SDUI com Material 3 em Kotlin Multiplatform

> Origem: conversa do dono com o Claude Code em 2026-11-01, durante a etapa Exemplos enxutos. Este documento leva para **outro repositório** o que foi decidido sobre um Server-Driven UI (SDUI) para produção, baseado no Material 3, com Android e iOS a partir de um código só. Também diz onde o Mapping entra. Nada aqui é implementado neste repositório agora.

## 1. Objetivo

Um SDUI que um time possa adotar em produção:

- o backend (BFF) descreve cada tela em JSON;
- os apps Android e iOS desenham essa tela com componentes do Material 3, sem código novo por tela;
- o contrato (o formato do JSON) é um só, compartilhado entre o BFF e os apps;
- o Mapping descreve esse contrato numa biblioteca (`sdui-material3`), para mapear telas desenhadas, gerar o código do BFF com um agente e trazer telas existentes de volta ao canvas.

## 2. Decisões

1. **Material 3 no iOS pelo Compose Multiplatform.** Não existe Material 3 nativo no iOS. A biblioteca oficial do Google para iOS (Material Components for iOS, MDC-iOS) está só em manutenção desde 2021 e nunca teve o Material 3. O Compose Multiplatform, da JetBrains, roda o mesmo Jetpack Compose e o mesmo `material3` no iOS, com suporte estável ao iOS desde a versão 1.8 (maio de 2025). No iOS a tela tem cara de Material, não de app nativo da Apple; para um app com design system próprio, isso é o desejado.
2. **Kotlin Multiplatform com três peças:** o módulo do contrato, o renderer e o BFF (seção 3).
3. **Repositório separado.** O código do SDUI (contrato, renderer, BFF, apps de exemplo) vive em outro repositório. O Mapping só descreve o contrato e aponta para os símbolos.
4. **Tela nova não muda os apps.** Só o BFF muda. Um componente ou uma ação nova muda o contrato e o renderer, uma vez, para as duas plataformas.
5. **MVP primeiro.** Os itens marcados "Depois" nas tabelas ficam para uma versão seguinte do contrato. Acrescentar um gatilho ou uma ação não quebra telas existentes (seção 7, compatibilidade).

## 3. Arquitetura

```
módulo contract (KMP, commonMain)
  Screen, Component (sealed), Action (sealed), Trigger, com kotlinx.serialization
        │                              │
        ▼                              ▼
bff (Kotlin/JVM)                  renderer (Compose Multiplatform, commonMain)
monta o JSON de cada tela         lê o JSON e desenha com material3
                                       │
                              ┌────────┴────────┐
                           androidApp         iosApp
                     (embute o renderer)  (embute o renderer)
```

- **`contract`:** os tipos do JSON, com `kotlinx.serialization`. É a fonte única: o BFF serializa, o renderer desserializa. Publicado como biblioteca KMP (alvos JVM, Android e iOS).
- **`renderer`:** um `@Composable fun SduiScreen(screen: Screen, ...)` em `commonMain` que desenha cada `Component` com o composable do `material3` correspondente e executa as `Action`s. Recebe de fora o que é da plataforma: navegação, cliente HTTP, analytics, abrir URL.
- **`bff`:** o serviço (Ktor ou Spring) que monta as telas. Uma função por componente (o "construtor") deixa o código de cada tela curto e tipado, por exemplo `button(id = "salvar", label = "Salvar") { onClick(navigate("/home")) }`.
- **Apps:** cascas finas. O Android chama o renderer direto; o iOS o embute por `ComposeUIViewController`.

## 4. O contrato do JSON

### Tela

```json
{
  "version": 1,
  "screen": {
    "id": "settings",
    "title": "Configurações",
    "state": { "notifications": true, "email": "" },
    "topBar": { "type": "TopAppBar", "id": "top", "props": { "title": "Configurações" } },
    "content": { "type": "Column", "id": "content", "children": [] },
    "bottomBar": null,
    "floating": null,
    "modals": [],
    "events": { "onAppear": { "type": "track", "name": "settings_view" } }
  }
}
```

- `version`: a versão do contrato que o BFF usou. O app manda no cabeçalho a maior versão que entende; o BFF responde numa que o app conhece.
- Raízes da tela: `topBar`, `content`, `bottomBar`, `floating` (o FAB, ancorado) e `modals` (BottomSheet e Dialog, fechados até uma ação abri-los).
- `state`: os valores iniciais do estado local da tela (seção 7).

### Componente

```json
{
  "type": "Button",
  "id": "save",
  "props": { "label": "Salvar", "style": "filled", "enabled": { "$state": "formValid" } },
  "events": {
    "onClick": {
      "type": "request",
      "method": "POST",
      "endpoint": "/profile",
      "body": { "email": { "$state": "email" } },
      "onSuccess": { "type": "navigateBack" },
      "onError": { "type": "showSnackbar", "message": "Não deu certo. Tente de novo." }
    }
  },
  "visible": true,
  "testTag": "profile.save",
  "a11y": { "label": "Salvar perfil" },
  "analytics": { "name": "profile_save" }
}
```

- `type`: o tipo do componente (seção 5). `id`: estável e único na tela (testes, analytics, `setState`, abrir um modal).
- `props`: as propriedades do componente; qualquer uma pode ser um valor fixo ou uma ligação ao estado (`{ "$state": "chave" }`).
- `children`: só nos contêineres.
- `events`: gatilho → ação (seção 6). Uma lista de ações vira um `sequence`.
- `visible`: `true`, `false` ou uma ligação ao estado.
- `testTag`, `a11y` e `analytics`: transversais (seção 7).

## 5. Componentes (MVP, cerca de 24)

Os nomes são os do JSON (`type`). As props listadas são as principais; o contrato final sai dos parâmetros do `material3`.

| Grupo               | Tipo                | Props principais                                                                                                                                                    |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estrutura           | `TopAppBar`         | `title`, `navigationIcon`, `actions` (ícones), `style` (small, center, medium, large)                                                                               |
|                     | `Column`            | `spacing`, `padding`, `horizontalAlignment`, `scroll`                                                                                                               |
|                     | `Row`               | `spacing`, `padding`, `verticalAlignment`, `horizontalArrangement`                                                                                                  |
|                     | `Box`               | `contentAlignment`, `padding`                                                                                                                                       |
|                     | `LazyColumn`        | `spacing`, `padding` (lista longa com `onLoadMore` e `onRefresh`)                                                                                                   |
|                     | `Spacer`            | `size`                                                                                                                                                              |
|                     | `Divider`           | `inset`                                                                                                                                                             |
| Conteúdo            | `Text`              | `text`, `style` (tipografia do M3), `color`, `maxLines`, `align`                                                                                                    |
|                     | `Image`             | `url`, `contentScale`, `aspectRatio`, `placeholder`                                                                                                                 |
|                     | `Icon`              | `name` (Material Symbols), `tint`, `size`                                                                                                                           |
|                     | `Card`              | `style` (filled, elevated, outlined), `children`                                                                                                                    |
|                     | `ListItem`          | `headline`, `supporting`, `overline`, `leading`, `trailing`                                                                                                         |
|                     | `Badge`             | `count`, `children`                                                                                                                                                 |
|                     | `ProgressIndicator` | `kind` (linear, circular), `progress` (vazio = indeterminado)                                                                                                       |
| Ação e formulário   | `Button`            | `label`, `style` (filled, tonal, elevated, outlined, text), `icon`, `enabled`, `loading`                                                                            |
|                     | `IconButton`        | `icon`, `style`, `enabled`                                                                                                                                          |
|                     | `FAB`               | `icon`, `label` (extended), `size`                                                                                                                                  |
|                     | `TextField`         | `value`, `label`, `placeholder`, `supportingText`, `error`, `keyboard` (text, email, number, phone, password), `imeAction`, `maxLength`, `style` (filled, outlined) |
|                     | `Checkbox`          | `checked`, `label`, `enabled`                                                                                                                                       |
|                     | `Switch`            | `checked`, `label`, `enabled`                                                                                                                                       |
|                     | `RadioGroup`        | `options`, `selected`                                                                                                                                               |
|                     | `Chip`              | `label`, `kind` (assist, filter, input, suggestion), `selected`, `icon`                                                                                             |
| Navegação e camadas | `NavigationBar`     | `items` (ícone, rótulo, rota), `selected`                                                                                                                           |
|                     | `Tabs`              | `items`, `selected`, `style` (primary, secondary)                                                                                                                   |
|                     | `BottomSheet`       | `id`, `children`, `dragHandle`                                                                                                                                      |
|                     | `Dialog`            | `id`, `title`, `text`, `confirm`, `dismiss` (botões com ação)                                                                                                       |
|                     | `Snackbar`          | mostrado pela ação `showSnackbar`, não declarado na tela                                                                                                            |

## 6. Gatilhos e ações

### Gatilhos: quando algo acontece

| Gatilho              | Quando                                              | Onde                                    | Fase   |
| -------------------- | --------------------------------------------------- | --------------------------------------- | ------ |
| `onClick`            | toque                                               | botões, card, item de lista, chip, aba  | MVP    |
| `onChange`           | valor mudou                                         | TextField, Checkbox, Switch, RadioGroup | MVP    |
| `onSubmit`           | envio do formulário                                 | TextField (tecla de ação), Button       | MVP    |
| `onAppear`           | tela ou componente ficou visível (impressão, carga) | tela, qualquer componente               | MVP    |
| `onRefresh`          | puxar para atualizar                                | tela, LazyColumn                        | MVP    |
| `onLoadMore`         | chegou ao fim da lista (paginação)                  | LazyColumn                              | MVP    |
| `onDismiss`          | camada fechada                                      | BottomSheet, Dialog, Snackbar           | MVP    |
| `onBack`             | voltar do sistema                                   | tela                                    | MVP    |
| `onLongClick`        | toque longo                                         | botões, item de lista                   | Depois |
| `onFocus` / `onBlur` | foco entrou ou saiu                                 | TextField                               | Depois |

### Ações: o que acontece

| Grupo           | Ação                                                                       | Parâmetros                                                                                                         | Fase   |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| Navegação       | `navigate`                                                                 | `route`, `params`, `replace`                                                                                       | MVP    |
|                 | `navigateBack`                                                             | nenhum                                                                                                             | MVP    |
|                 | `openDeeplink`                                                             | `uri`                                                                                                              | MVP    |
|                 | `openUrl`                                                                  | `url`, `mode` (external, inApp)                                                                                    | MVP    |
|                 | `closeFlow`                                                                | `result`                                                                                                           | Depois |
| Camadas         | `openSheet` / `closeSheet`                                                 | `id` do BottomSheet                                                                                                | MVP    |
|                 | `openDialog` / `closeDialog`                                               | `id` do Dialog                                                                                                     | MVP    |
|                 | `showSnackbar`                                                             | `message`, `actionLabel`, `action`                                                                                 | MVP    |
| Dados           | `request`                                                                  | `method`, `endpoint`, `body` (com ligações ao estado), `loading` (none, screen, component), `onSuccess`, `onError` | MVP    |
|                 | `setState`                                                                 | `key`, `value`                                                                                                     | MVP    |
|                 | `validate`                                                                 | `fields` (ids), `onValid`, `onInvalid`                                                                             | MVP    |
|                 | `refreshScreen`                                                            | nenhum                                                                                                             | MVP    |
| Observabilidade | `track`                                                                    | `name`, `properties`                                                                                               | MVP    |
| Composição      | `sequence`                                                                 | `actions` (em ordem)                                                                                               | MVP    |
|                 | `condition`                                                                | `if` (ligação ao estado), `then`, `else`                                                                           | Depois |
| Sistema         | `share`, `copyToClipboard`, `call`, `requestPermission`, `openAppSettings` | os de cada uma                                                                                                     | Depois |

Por que os "Depois" esperam: dá para fazer um app completo sem eles, ou eles se resolvem com o MVP. `onLongClick` costuma ser atalho de algo que já está num menu. `onFocus`/`onBlur` são cobertos em boa parte por `onChange` com `validate`. `closeFlow` se faz com `navigateBack` ou `navigate`. Em `condition`, quem decide costuma ser o BFF, que já manda a tela certa. As ações do sistema são pontuais e pedem tratamento por plataforma. Se alguma for comum nos apps do time (por exemplo `share` ou `copyToClipboard` num app financeiro), ela sobe para o MVP.

## 7. O que vale para todos os componentes

- **Id estável:** todo componente tem `id`, único na tela. É a chave de testes, analytics, `setState` e de abrir modais.
- **Estado local da tela:** `screen.state` tem os valores iniciais; `{ "$state": "chave" }` liga uma prop ou um corpo de `request` a um valor; `onChange` dos campos grava no estado pela própria chave ligada em `value`/`checked`; `setState` muda um valor. Uma forma de objeto (não texto com `${}`) evita escrever um interpretador de expressões.
- **Visibilidade:** `visible` fixo ou ligado ao estado.
- **Carregamento e erro:** `request` diz onde mostrar o carregamento; `onError` decide o que a pessoa vê. Falha ao carregar a tela inteira cai numa tela de erro do app, com tentar de novo.
- **Analytics:** `analytics.name` em componente dispara impressão e clique com o mesmo nome; `track` envia eventos explícitos.
- **Acessibilidade:** `a11y.label` (o `contentDescription`), e o `testTag` para testes de UI nas duas plataformas.
- **Tema:** o `MaterialTheme` do app (cores, tipografia, formas) vale para tudo; o JSON usa os papéis do M3 (`primary`, `onSurface`, `titleMedium`), nunca cores e tamanhos soltos.
- **Compatibilidade:** componente de `type` desconhecido não é desenhado (e é registrado em log); ação desconhecida não faz nada (e é registrada). Prop nova é sempre opcional. Assim, acrescentar gatilho, ação, componente ou prop não quebra app antigo. Remover ou mudar o sentido de algo sobe a `version` do contrato.
- **Cache:** o app guarda a última resposta de cada tela para abrir rápido e sem rede; o BFF manda `ETag`.

## 8. Onde o Mapping entra

Uma biblioteca do Mapping, `sdui-material3`, descreve o contrato. Ela nasce **depois** que o contrato existir no outro repositório, porque o `code` e as `sources` precisam apontar para símbolos e chaves reais.

- **Tipos:** um por componente da seção 5, com os campos iguais às props (as `sources` dizem a chave no JSON). O desenho de cada um pode partir da biblioteca `libraries/material3-compose/` deste repositório (copiada e adaptada; ela não muda).
- **Eventos:** uma camada **Eventos**, com um tipo por gatilho (`onClick`, `onChange`…), que só existe preso a um componente (`requiresOwner`) e que cada tipo de componente aceita pelo `allowedChildren`. A ação é um campo `enum` com os parâmetros dela. É o padrão do `examples/specs/sdui.json`. A forma de ligar `onSuccess`/`onError` (outro evento referenciado ou uma tabela) se decide ao escrever a biblioteca.
- **Plataformas (`platforms` e `code`):**
  - `app` (`language: kotlin`): o renderer multiplataforma; o `code` de cada tipo aponta para o composable que o desenha (`symbol` e `path` no repositório do SDUI).
  - `bff` (`language: kotlin`): o construtor da tela; o `code` aponta para a função do BFF que gera aquele componente.
  - Android e iOS não aparecem como plataformas separadas: o renderer é um só.
- **Da tela desenhada ao código:** a pessoa marca a tela no Mapping com os tipos da biblioteca; o agente, pelo MCP (`get_code_hints` da plataforma `bff`), escreve o código do BFF que gera aquela tela.
- **Do código à tela desenhada:** a origem (`origins`) lê um JSON que o BFF já devolve e cria a tela no canvas, com os componentes no lugar (raízes `topBar`, `content`, `bottomBar`, `floating` com âncora e `modals` com o fundo escurecido).
- **Referências:** neste repositório, `docs/SPEC-FORMAT.md` (seções "Plataformas e code", "Variantes do código", "Origens" e "Origem executável"), `docs/COMPONENT-FORMAT.md`, `examples/specs/sdui.json` (eventos como tipos, `code` em várias plataformas) e `libraries/material3-compose/` (desenho dos componentes e `variants` no `code`).

## 9. Em aberto

- Os nomes finais dos `type`, das props e dos ícones (Material Symbols por nome?).
- Como o `request` lida com autenticação e com os cabeçalhos do app (provavelmente fora do JSON, no cliente HTTP que o app entrega ao renderer).
- Navegação: as rotas são telas do SDUI (o app pede ao BFF) ou também telas nativas? Proposta: as duas, com um registro de rotas nativas no app.
- Formulários longos: validação só no cliente (`validate`) ou também a resposta de erro do BFF por campo?
- A versão do Compose Multiplatform e a correspondência do `material3` dele com o androidx: conferir a estável mais recente ao criar o repositório.
