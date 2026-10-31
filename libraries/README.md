# Bibliotecas

Pacotes de biblioteca prontos para uso (formato em [`docs/SPEC-FORMAT.md`](../docs/SPEC-FORMAT.md), "Biblioteca: o pacote"). Cada pasta é um pacote: a especialização na raiz, `components/` e `docs/`.

| Pasta     | O que é                                                                                                  | Como chega ao projeto                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `notas/`  | Notas e tabelas flutuantes no canvas (post-its).                                                         | **Embutida** no build (`index.ts`) e aplicada por padrão em projeto novo.                                |
| `kotlin/` | Declarações Kotlin: os onze tipos de classe, objeto e interface, com propriedades, funções e supertipos. | **Não embutida.** Baixe a pasta (ou um zip dela) e aplique em **Especializações › Aplicar pasta…/zip…**. |

| `material3-compose/` | Material Design 3 (tema claro) para Jetpack Compose, com o composable de cada tipo no `code` (`variants`). | **Não embutida.** Aplicada pela pasta ou por um zip, como a `kotlin/`. |

Uma pasta com `index.ts` é embutida; sem ele, a biblioteca é aplicada pela pessoa. Toda pasta daqui tem um teste que a valida (`validateLibrary`, sem erros): `tests/model/notesLibrary.test.ts`, `tests/model/kotlinLibrary.test.ts` e `tests/model/material3ComposeLibrary.test.ts`.

## Kotlin

As propriedades de cada declaração (cada linha de **Propriedades**) são alvos de referência com as etiquetas `data-field` e `kotlin-property`: um campo `ref` de outra camada ou especialização que aceite uma delas aponta para a propriedade. As declarações se ligam entre si por campos `ref` que aceitam `kotlin-type` (**Declarada em**, **Supertipos › Tipo mapeado**, **Propriedades › Tipo mapeado**), que o agente lê em `refs` e `backlinks`. Os detalhes de cada tipo estão em `kotlin/docs/`.

## Material 3 (Compose)

Especialização `formatVersion` 9 (`id` `material3-compose`) que mapeia os componentes do Material Design 3 (tema claro baseline) para o Jetpack Compose: cada tipo traz o composable no `code` (`symbol` e `path`), as variantes em `variants` (um botão `outlined` vira `OutlinedButton`) e, no `notes`, como montar os espaços. É a biblioteca pronta para uso; o pacote `examples/libraries/material3/` continua como base fixa dos testes.

**Versão fixada.** `androidx.compose.material3:material3` **1.4.0**, o commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` do androidx (o espelho do GitHub não tem tags, por isso o commit; é o que `platforms[].repo` e o `path` de cada tipo apontam). Nenhum tipo exige a API expressiva: ela nem existe como composable público nesse commit.

**Camadas e tipos desta versão (26).**

- Layout: `scaffold`, `surface`, `box`, `row`, `column`, `lazy-column`, `lazy-row`, `lazy-vertical-grid`, `flow-row`, `spacer`, `horizontal-pager`.
- Conteúdo: `text`, `icon`, `image`.
- Componentes: `top-app-bar`, `button`, `fab`, `extended-fab`, `text-field`, `switch`, `checkbox`, `chip`, `card`, `list-item`, `navigation-bar`, `bottom-sheet`.

Cada tipo tem componente, documento em `material3-compose/docs/` e de um a três exemplos. As fases seguintes acrescentam tipos à camada Componentes.

**Padrões.**

- **Espaços (lambdas) no `notes`.** `onClick`, `icon = { … }`, `title = { … }` e `content` não são campos: o `params` passa só valores simples (booleanos, cores, números, enums) e o `notes` diz como montar cada espaço com os campos (`label = { Text(label) }`).
- **Scaffold pelo tipo da filha.** `top-app-bar` vai em `topBar`, `navigation-bar` em `bottomBar`, `fab` e `extended-fab` em `floatingActionButton` e o resto em `content = { innerPadding -> … }`.
- **Tamanho.** `width` e `height` (`wrap`, `fill`, `fixed`) e `weight` não entram no `params`; viram `Modifier.fillMaxWidth()`, `Modifier.width(<largura da marcação>.dp)` e `Modifier.weight(<weight>f)`. Nos containers da biblioteca 1 px = 1 dp; numa captura de tela, divida pela densidade (largura da imagem em px ÷ largura do dispositivo em dp).
- **Alinhamento.** As opções têm o nome do Compose (`SpaceBetween`, `CenterVertically`, `TopStart`) e o `values` as traduz para a expressão completa (`Arrangement.SpaceBetween`).
- **Ícones.** Campos `string` com `suggestions` (`Home`, `Search`, `Add`…), sem restringir o valor; o `notes` usa `Icons.Filled.<nome>`. A 1.4.0 deixou de trazer os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`; os que espelham (`ArrowBack`, `KeyboardArrowRight`, `List`) ficam em `Icons.AutoMirrored.Filled`.
- **Imagem remota.** `image.url`, `card.media` e `list-item.leadingImage` são URLs; o desenho usa o carregador de imagens do app, e o código (por exemplo Coil `AsyncImage`) fica fora do androidx e da biblioteca.
- **Opt-in.** Os tipos que exigem `@OptIn(ExperimentalMaterial3Api::class)` (como `bottom-sheet`) dizem isso no `notes`.

**Fora desta versão.** A API expressiva (`ButtonGroup`, `ToggleButton`, `FloatingActionButtonMenu` e parentes), que não existe como composable público no commit fixado; o side sheet; e o Scrim, que o `ModalBottomSheet` já desenha.

As fontes (`fonts/`) não são versionadas: veja `material3-compose/fonts/LEIA-ME.txt` (a ausência delas gera dois avisos aceitos). O teste `tests/model/material3ComposeLibrary.test.ts` valida o pacote.
