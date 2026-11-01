# Bibliotecas

O que cada biblioteca e cada exemplo mostra, e como abri-los, está em [`examples/README.md`](../examples/README.md).

Pacotes de biblioteca prontos para uso (formato em [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md), "Biblioteca: o pacote"). Cada pasta é um pacote: a especialização na raiz, `components/` e `docs/`.

| Pasta     | O que é                                                                                                  | Como chega ao projeto                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `notas/`  | Notas e tabelas flutuantes no canvas (post-its).                                                         | **Embutida** no build (`index.ts`) e aplicada por padrão em projeto novo.                                |
| `kotlin/` | Declarações Kotlin: os onze tipos de classe, objeto e interface, com propriedades, funções e supertipos. | **Não embutida.** Baixe a pasta (ou um zip dela) e aplique em **Especializações › Aplicar pasta…/zip…**. |

| `material3-compose/` | Material Design 3 (tema claro) para Jetpack Compose, com o composable de cada tipo no `code` (`variants`). | **Não embutida.** Aplicada pela pasta ou pelo zip pronto `examples/material3-compose.zip` (`npm run build:material3-zip` o regera), como a `kotlin/`. |

Uma pasta com `index.ts` é embutida; sem ele, a biblioteca é aplicada pela pessoa. Toda pasta daqui tem um teste que a valida (`validateLibrary`, sem erros): `tests/model/notesLibrary.test.ts`, `tests/model/kotlinLibrary.test.ts` e `tests/model/material3ComposeLibrary.test.ts`.

## Kotlin

As propriedades de cada declaração (cada linha de **Propriedades**) são alvos de referência com as etiquetas `data-field` e `kotlin-property`: um campo `ref` de outra camada ou especialização que aceite uma delas aponta para a propriedade. As declarações se ligam entre si por campos `ref` que aceitam `kotlin-type` (**Declarada em**, **Supertipos › Tipo mapeado**, **Propriedades › Tipo mapeado**), que o agente lê em `refs` e `backlinks`. Os detalhes de cada tipo estão em `kotlin/docs/`.

## Material 3 (Compose)

Especialização `formatVersion` 9 (`id` `material3-compose`) que mapeia os componentes do Material Design 3 (tema claro baseline) para o Jetpack Compose: cada tipo traz o composable no `code` (`symbol` e `path`), as variantes em `variants` (um botão `outlined` vira `OutlinedButton`) e, no `notes`, como montar os espaços. É a biblioteca pronta para uso; o pacote `examples/libraries/material3/` continua como base fixa dos testes.

**Versão fixada.** `androidx.compose.material3:material3` **1.4.0**, o commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` do androidx (o espelho do GitHub não tem tags, por isso o commit; é o que `platforms[].repo` e o `path` de cada tipo apontam). Nenhum tipo exige a API expressiva: ela nem existe como composable público nesse commit.

**Camadas e tipos desta versão (50).**

- Layout: `scaffold`, `surface`, `box`, `row`, `column`, `lazy-column`, `lazy-row`, `lazy-vertical-grid`, `flow-row`, `spacer`, `horizontal-pager`.
- Conteúdo: `text`, `icon`, `image`.
- Componentes: `top-app-bar`, `button`, `fab`, `extended-fab`, `text-field`, `switch`, `checkbox`, `chip`, `card`, `list-item`, `navigation-bar`, `bottom-sheet`, `icon-button`, `icon-toggle-button`, `segmented-button`, `radio-button`, `slider`, `search-bar`, `date-picker`, `time-picker`, `badge`, `snackbar`, `tooltip`, `progress-indicator`, `secure-text-field`, `divider`, `alert-dialog`, `dropdown-menu`, `navigation-rail`, `short-navigation-bar`, `navigation-drawer`, `tabs`, `bottom-app-bar`, `carousel`, `pull-to-refresh`, `swipe-to-dismiss`.

Cada tipo tem componente, documento em `material3-compose/docs/` e de um a três exemplos. O catálogo do Material 3 estável no Compose fixado está completo (o side sheet não tem composable público).

**Tamanho mínimo (`minSize`).** Só tem `minSize` o componente cujo composable define um mínimo oficial **nos dois eixos**, com o valor do código do androidx no commit fixado (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/`); sem fonte oficial, o campo não existe e vale só o mínimo geral da app (8 px).

| Tipo                                | `minSize`              | Fonte oficial                                                                                                     |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `button`                            | 58 × 40                | `Button.kt:527,533` (`ButtonDefaults.MinWidth`, `MinHeight`), aplicado em `Button.kt:144`                         |
| `segmented-button`                  | 58 × 40 (por segmento) | `SegmentedButton.kt:155-157` (os mesmos `ButtonDefaults`)                                                         |
| `text-field`, `secure-text-field`   | 280 × 56               | `TextFieldDefaults.kt:75,81` (`MinHeight`, `MinWidth`), aplicado em `TextField.kt:305` e `SecureTextField.kt:173` |
| `search-bar`                        | 360 × 56               | `SearchBar.kt:2712` (`SearchBarMinWidth`) e `:1036` (`InputFieldHeight`)                                          |
| `tooltip`                           | 40 × 24                | `Tooltip.kt:1642-1643` (`TooltipMinWidth`, `TooltipMinHeight`)                                                    |
| `badge`                             | 6 × 6                  | `Badge.kt:169` com `BadgeTokens.Size` (6 dp, sem conteúdo; com conteúdo o mínimo é 16 × 16)                       |
| `fab`                               | 40 × 40                | `FloatingActionButton.kt:212` (FAB pequeno; o regular é 56 × 56 e o grande 96 × 96, o piso é o da menor variante) |
| `extended-fab`                      | 56 × 56                | `FloatingActionButton.kt:407-412` (recolhido: 56; com rótulo a largura mínima é 80)                               |
| `icon-button`, `icon-toggle-button` | 40 × 40                | `IconButton.kt:178` (`smallContainerSize`, `SmallIconButtonTokens.ContainerHeight` e `IconSize`)                  |

Sem `minSize`, por não haver mínimo oficial nos dois eixos: os contêineres e o layout (`scaffold`, `surface`, `box`, `row`, `column`, `lazy-*`, `flow-row`, `spacer`, `horizontal-pager`), `text`, `icon`, `image`, `card`, `carousel`, `pull-to-refresh`, `swipe-to-dismiss`, `bottom-sheet`, `date-picker`, `time-picker` e `progress-indicator` (tamanho fixo por forma). Com mínimo oficial em **um eixo só** (a largura de `alert-dialog` 280 e `navigation-drawer` 240, a altura de `top-app-bar` 64, `navigation-bar` 80, `short-navigation-bar` 64, `list-item` 56 a 88, `snackbar` 48 e `chip` 32, entre outros): o formato exige os dois eixos, então ficam sem `minSize`. `checkbox`, `radio-button`, `switch` e `slider` também ficam sem: o mínimo oficial é do controle, e o desenho da biblioteca inclui o rótulo ou um polegar maior.

**Padrões.**

- **Espaços (lambdas) no `notes`.** `onClick`, `icon = { … }`, `title = { … }` e `content` não são campos: o `params` passa só valores simples (booleanos, cores, números, enums) e o `notes` diz como montar cada espaço com os campos (`label = { Text(label) }`).
- **Scaffold pelo tipo da filha.** `top-app-bar` vai em `topBar`, `navigation-bar` em `bottomBar`, `fab` e `extended-fab` em `floatingActionButton` e o resto em `content = { innerPadding -> … }`.
- **Tamanho.** `width` e `height` (`wrap`, `fill`, `fixed`) e `weight` não entram no `params`; viram `Modifier.fillMaxWidth()`, `Modifier.width(<largura da marcação>.dp)` e `Modifier.weight(<weight>f)`. Nos containers da biblioteca 1 px = 1 dp; numa captura de tela, divida pela densidade (largura da imagem em px ÷ largura do dispositivo em dp).
- **Alinhamento.** As opções têm o nome do Compose (`SpaceBetween`, `CenterVertically`, `TopStart`) e o `values` as traduz para a expressão completa (`Arrangement.SpaceBetween`).
- **Ícones.** Campos `string` com `suggestions` (`Home`, `Search`, `Add`…), sem restringir o valor; o `notes` usa `Icons.Filled.<nome>`. A 1.4.0 deixou de trazer os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`; os que espelham (`ArrowBack`, `KeyboardArrowRight`, `List`) ficam em `Icons.AutoMirrored.Filled`.
- **Imagem remota.** `image.url`, `card.media` e `list-item.leadingImage` são URLs; o desenho usa o carregador de imagens do app, e o código (por exemplo Coil `AsyncImage`) fica fora do androidx e da biblioteca.
- **Opt-in.** Os tipos que exigem `@OptIn(ExperimentalMaterial3Api::class)` (como `bottom-sheet`) dizem isso no `notes`.

**Fora desta versão.** A API expressiva (`ButtonGroup`, `ToggleButton`, `FloatingActionButtonMenu` e parentes), que não existe como composable público no commit fixado; o side sheet; e o Scrim, que o `ModalBottomSheet` já desenha.

As fontes (`fonts/`) vêm no pacote: a Roboto 400 e 500 em `.woff2` (subconjunto latino, Fontsource 5.3.0, licença OFL em `fonts/LICENSE-Roboto.txt`; veja `material3-compose/fonts/LEIA-ME.txt`), então a biblioteca valida **sem nenhum aviso**. O teste `tests/model/material3ComposeLibrary.test.ts` valida o pacote.

## Exemplo de origem executável

O exemplo de `origins`, `sources` e `migrations` não é uma biblioteca pronta para uso: é `examples/libraries/sdui-backend/` (um sistema externo fictício que descreve telas em JSON, com seis tipos). Uma biblioteca real não descreve o backend de ninguém, por isso a `material3-compose` não ganha origem.
