# Histórico — Etapa Biblioteca Material 3 (seção do antigo PLAN.md)

> Fases MD1 a MD5 concluídas no épico `epic/material3` (plano no PR #259, MD1 no #261, MD2 no #262, MD3 no #263, MD4 no #265, MD5 no #269, relato, correções do guia e ajustes da biblioteca no #270 e fechamento num PR sem número; o épico é o PR #260). Especialização `formatVersion` 9 (`variants` no `code`) e MCP 0.12.0; sem schema (v13), formato de proposta (3) nem de componente (3) novos.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois.

---

## Etapa — Biblioteca Material 3 (épico `epic/material3`)

- **Objetivo:** o dono pediu (2026-10-31) uma especialização **completa** do Material 3 que sirva de verdade para um agente gerar código, como a biblioteca Kotlin, e não mais um exemplo. Hoje `examples/libraries/material3/` tem 15 tipos (11 do catálogo do M3 e 4 estruturas de layout), sem `platforms` nem `code`: o agente adivinha a API pelo nome. Para gerar código, o agente precisa da árvore da tela (estruturas de layout com alinhamento e tamanho), de todos os componentes do catálogo com as variantes, e de dizer com que composable se cria cada um.
- **Base:** o épico nasce do `epic/imagens-remotas` (decisão do dono em 2026-10-31), e não da `main`, porque os componentes com imagem (Image, Card com mídia, List item com avatar, Carousel) usam o nó `image` do componente (`formatVersion` 3). Ele só vai para a `main` **depois** do `epic/imagens-remotas`; até lá, o PR dele para a `main` mostra também os commits das Imagens remotas, e cada mudança que entrar no `epic/imagens-remotas` entra aqui por merge (nunca rebase).
- **Versões:** especialização `formatVersion` 9 (`variants` no `code`; as versões 1 a 8 continuam aceitas sem mudança) e MCP 0.12.0. Schema do `mapping.json` (v13), formato da proposta (3) e do componente (3, das Imagens remotas) sem mudança.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                                                                       |
| ---- | ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| MD1  | Opus        | high                   | Sonnet high (modelo, validador, `resolveCode`); Sonnet medium (docs, JSON Schema, skill, MCP); Haiku low          |
| MD2  | Opus        | high                   | Sonnet high (pesquisa das assinaturas no androidx e os tipos de layout); Sonnet medium (documentos); Haiku low    |
| MD3  | Sonnet      | medium                 | Sonnet medium; Haiku low                                                                                         |
| MD4  | Sonnet      | medium                 | Sonnet medium; Haiku low                                                                                         |
| MD5  | Sonnet      | medium                 | Sonnet medium; Haiku low                                                                                         |

### Decisões

1. **`variants` no `code` (especialização `formatVersion` 9).** Em Compose, a variante do M3 troca o composable (`Button`, `FilledTonalButton`, `OutlinedButton`, `TextButton`, `ElevatedButton`), não um parâmetro; o `code` de hoje tem um só `symbol` por plataforma. A entrada de `code` de uma plataforma ganha `variants` opcional: `{ "field": "<chave>", "cases": { "<valor>": { symbol?, path?, params?, values?, notes? } } }`.
   - `field` é a `key` de um campo `enum` do próprio tipo (nível de cima, não coluna de `table`); cada chave de `cases` é uma das `options` dele; um caso vazio é erro. Qualquer outra propriedade é recusada.
   - O caso declara só o que muda: `symbol`, `path` e `notes` **substituem** os da base; `params` e `values` **se somam** aos da base, chave por chave (o `ExtendedFloatingActionButton` acrescenta `"label": "text"`). Valor sem caso usa a base.
   - Anotação sem valor no campo usa o `default` do campo; sem `default`, a base.
   - **Um nível só:** um campo escolhe a variante. Duas dimensões viram um `enum` que as junta ou dois tipos (FAB e Extended FAB são tipos separados, como no Compose).
   - `variants` numa versão anterior à 9 é o erro `só é permitido com formatVersion 9`, no caminho exato, como as outras chaves por versão.
2. **Um só lugar resolve o caso.** Função pura `resolveCode(code, values, fields)` em `src/model/`, que devolve a entrada com o caso aplicado (sem `variants`). Todo leitor de `code` por anotação passa por ela: `codeBlueprint` (`get_code_hints`), `codeLocations` (`find_by_code`), `typedDisplay` (a "Definição" nos Detalhes, com o `path` do caso da anotação). O Catálogo mostra a base e uma tabela variante → símbolo; `get_specialization` devolve o JSON cru, com `variants`.
3. **`find_by_code` compara com o código resolvido de cada anotação.** Numa especialização 9, buscar `androidx.compose.material3.Button` traz só os botões da base (filled), e `OutlinedButton` só os outlined; buscar por `path` continua achando todos os casos que apontam para o arquivo. Nas versões 1 a 8 nada muda. `docs/AGENT-GUIDE.md` registra.
4. **Compatibilidade.** Para trás: total (sem `variants`, `resolveCode` devolve a base, que é o `code` de hoje; cópias em `specs/` abrem sem migração). Para frente: a app e o MCP antigos recusam a 9 (validador estrito: versão e chave desconhecidas), nunca ignoram `variants` em silêncio. Projeto com uma cópia que a app não lê abre com as anotações como "tipo inexistente": a MD1 prova por teste que editar e gravar outra coisa nesse projeto **preserva** os valores dessas anotações e a cópia em `specs/` (integridade do `mapping.json`). Só sobe para a 9 a especialização que usa `variants`: Kotlin e notas ficam na 8.
5. **Biblioteca nova em `libraries/material3-compose/`**, ao lado de `kotlin/`: pronta para uso, **não embutida** (a pessoa aplica pela pasta ou pelo zip), escrita à mão (skill `spec-author`), validada por teste próprio no molde de `tests/model/kotlinLibrary.test.ts` e listada em `libraries/README.md`. Não é gerada pelo laboratório (`lab/` é experimento fora do produto).
6. **`id` `material3-compose`, nome "Material 3 (Compose)", `version` 1**, sem compatibilidade com o exemplo (decisão do dono: nenhum projeto real o usa). Ids de tipo pelo nome do componente em `[a-z0-9-]` (`button`, `top-app-bar`, `lazy-column`); a `key` de cada campo é o **nome do parâmetro do Compose** quando houver um (`enabled`, `label`, `contentDescription`), para o agente não traduzir. `examples/libraries/material3/` **fica como está**, como base fixa dos testes de catálogo, desempenho, MCP, e2e, guia e projeto de exemplo (uma biblioteca que cresce não serve de base fixa).
7. **Só Jetpack Compose** (decisão do dono). Uma plataforma, `compose` (`language: "kotlin"`), com `repo` no androidx (`https://github.com/androidx/androidx`, `urlTemplate` para o arquivo e `ref` numa tag de release estável do `compose.material3`, escolhida na MD2). O `path` é relativo à raiz do androidx (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt`); os tipos da `foundation` (Box, Row, Column, Lazy*, Spacer, Image) apontam para o mesmo repositório. Outra plataforma (Flutter, por exemplo) entra depois como mais uma entrada em `platforms` e no `code`, sem quebrar nada.
8. **Só o que é estável no `compose.material3` fixado.** Componentes e variantes que no Compose exigem `@ExperimentalMaterial3ExpressiveApi` ficam fora (seção "Fora"); os que exigem `@ExperimentalMaterial3Api` mas são de uso corrente (date picker, time picker, search bar, top app bar) entram, com o opt-in dito no `notes`. A lista exata sai da MD2, conferindo o código na tag fixada.
9. **Estruturas de layout e conteúdo** (MD2): Scaffold, Surface, Box, Row, Column, LazyColumn, LazyRow, LazyVerticalGrid, FlowRow, Spacer, Text, Icon, Image e HorizontalPager. Rolagem sem lazy é um campo do Column e do Row (`scroll`), não um tipo. Alinhamento e distribuição viram campos com o nome do parâmetro (`horizontalArrangement`, `verticalAlignment`, `verticalArrangement`, `horizontalAlignment`, `contentAlignment`), com as opções do Compose (`Start`, `Center`, `SpaceBetween`…); tamanho vira `width` e `height` (`wrap`, `fill`, `fixed`) e `weight` (número, opcional), que o `notes` traduz para `Modifier.fillMaxWidth()`, `Modifier.weight(1f)`. Pertencimento continua só pela geometria: o agente sabe o espaço do Scaffold pelo tipo do filho (Top app bar no `topBar`, Navigation bar no `bottomBar`, FAB no `floatingActionButton`), o que o `notes` do Scaffold diz.
10. **Espaços (lambdas) no `notes`.** `onClick`, `icon = { … }` e `content` não são campos: o `params` passa os valores simples e o `notes` diz como montar os espaços (`content = { Text(label) }`). O padrão é escrito uma vez no documento da biblioteca e em `docs/AGENT-GUIDE.md`.
11. **Ícones por `suggestions`.** Campo de ícone é `string` com `suggestions` (os nomes mais comuns de `Icons.Filled`), que não restringe o valor; o `notes` diz `Icon(Icons.Filled.<nome>, contentDescription = …)`. O componente desenha o ícone que conhece e o reservado nos outros.
12. **Imagem remota.** O tipo Image, a mídia do Card, o avatar do List item e os itens do Carousel usam o nó `image` com o `src` ligado a um campo `string` (a URL), seguindo as Imagens remotas. No código, `Image` da `foundation` recebe um `Painter`: o `notes` diz que URL remota usa o carregador de imagens do app (por exemplo, Coil `AsyncImage`), que fica fora do androidx e da biblioteca.
13. **Cobertura do catálogo.** Todas as famílias do catálogo do M3 com API estável no Compose fixado (MD2 a MD4), cada uma com todas as variantes (decisão 1), componente que desenha, documento e de um a três exemplos. Os 15 tipos do exemplo são refeitos na MD2 com o que faltava: Top app bar small, center, medium e large; Text field filled e outlined; FAB small, regular e large com a cor tertiary; Chip assist, filter, input e suggestion; Bottom sheet modal e standard; Navigation bar de 3 a 5 destinos (`repeat`); Checkbox com o estado indeterminado; List item de uma a três linhas.
14. **Versão da biblioteca.** Quando o `ref` do androidx subir, sobe o `version` da biblioteca e as `migrations` cobrem campos renomeados (formato da etapa Biblioteca).

### Fora (de propósito)

- Componentes e variantes do M3 Expressive que no Compose ainda exigem `@ExperimentalMaterial3ExpressiveApi` (button group, split button, FAB menu, loading indicator, toolbar flutuante e as formas novas): entram numa versão futura da biblioteca, quando ficarem estáveis.
- Flutter, Material Web e qualquer outra plataforma.
- Tema escuro e cores dinâmicas no desenho dos componentes (o desenho é o tema claro baseline, como no exemplo).
- Variantes aninhadas (mais de um campo escolhendo o símbolo).
- O BFF de SDUI de quem usa a biblioteca: fica numa especialização própria, que declara a plataforma dele.

### Fases

#### MD1 — `variants` no `code` (formato, modelo e MCP)

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet high (modelo, validador, `resolveCode`), Sonnet medium (docs, JSON Schema, skill, MCP), Haiku low. Decisões 1 a 4. Antes de começar, o coordenador confere o modelo da sessão (regra do `CLAUDE.md`).

**Toca em:** `src/model/spec.ts`, `src/model/` (`resolveCode` novo), `src/model/codeBlueprint.ts`, `src/model/codeLocations.ts`, `src/model/typedDisplay.ts`, `src/model/catalog.ts`, a interface do Catálogo, `mcp/`, `docs/spec.schema.json`, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, `docs/MCP.md`, `mcp/version.ts`, `.claude/skills/spec-author/SKILL.md`, `src/i18n/specHelp.ts`, `CHANGELOG.md`, `tests/`.

- [x] `formatVersion` 9 no parser (`SPEC_FORMAT_VERSION`, `SPEC_FORMAT_VERSIONS`) e `variants` na entrada de `code`, com a decisão 1 (testes: v1 a v8 sem mudança; `variants` numa 8 é erro no caminho; `field` ausente, que não existe, que não é `enum` ou que é coluna de `table`; chave de `cases` fora das `options`; caso vazio; propriedade desconhecida no `variants` e no caso)
- [x] `resolveCode` puro com a decisão 1 (testes: valor com caso, valor sem caso, sem valor com e sem `default`, `symbol`/`path`/`notes` substituídos, `params`/`values` somados, entrada sem `variants` devolvida igual)
- [x] `get_code_hints` (`codeBlueprint`), `find_by_code` (`codeLocations`) e a "Definição" dos Detalhes (`typedDisplay`) pelo código resolvido de cada anotação, com a decisão 3 (testes de modelo e de `tests/mcp/`: Button outlined devolve `OutlinedButton`; busca pelo símbolo da base não traz os outlined; busca por `path` traz todos; especialização 8 sem mudança)
- [x] Catálogo com a base e a tabela variante → símbolo; textos em pt-BR e en-US (teste de componente e de paridade de `tests/i18n/`)
- [x] Integridade (decisão 4): projeto com uma cópia em `specs/` que a app não lê (`formatVersion` maior que a suportada) abre, edita outra marcação e grava sem perder os valores das anotações daquela especialização nem a cópia (teste de `tests/storage/` ou `tests/store/`); se não preservar, parar e registrar no PR para decidir com o dono — na pasta já preservava tudo; a exportação do zip não levava a cópia ilegível (`specFiles` só incluía cópias lidas) e foi corrigida: o zip leva o texto cru da cópia que a app não leu
- [x] `validate_specialization`, `validate_library` e `apply_specialization` aceitam a 9 com os mesmos erros da app (testes de `tests/mcp/`)
- [x] JSON Schema `docs/spec.schema.json` com a v9 (teste dos schemas), `docs/SPEC-FORMAT.md` (a seção "Plataformas e code" com `variants` e um exemplo), `docs/AGENT-GUIDE.md` (o código já vem resolvido; a mudança do `find_by_code`; o padrão dos espaços da decisão 10), `docs/MCP.md` e MCP 0.12.0 em `mcp/version.ts` (teste `tests/mcp/version.test.ts`)
- [x] Skill `spec-author`: quando usar `variants` (a variante troca o símbolo), um nível só, a versão mínima 9 só com `variants` (revisão do `SKILL.md`)
- [x] Roteiro novo na seção 8 do `docs/TESTING.md`, feito pelo agente sozinho (cliente MCP por stdio: aplicar uma especialização 9 pequena, criar anotações em duas variantes, conferir `get_code_hints` e `find_by_code`; na app, a "Definição" e o Catálogo pela extensão), com o teste de `tests/tooling/testingGuide.test.ts`
- [x] `CHANGELOG.md` (seção `[Não lançado]` da etapa)
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

#### MD2 — Base da biblioteca: plataforma, layout e os 15 refeitos

**Coordenador:** Opus (define os padrões que as fases MD3 e MD4 copiam). **Esforço:** high; subagentes Sonnet high (pesquisa das assinaturas no código do androidx na tag fixada e os tipos de layout), Sonnet medium (documentos), Haiku low. Decisões 5 a 13.

- [x] Tag do `compose.material3` fixada no `repo.ref` e a lista de famílias estáveis nela (decisão 8), registrada no PR e no documento da biblioteca; o ambiente alcança o código do androidx pela rede (se não alcançar, parar e avisar o dono)
- [x] `libraries/material3-compose/` com a especialização v9 (`id`, nome, `version` 1, `platforms` com o `repo`, os `containers` de dispositivo, as fontes), `libraries/README.md` e `docs/SPEC-FORMAT.md` (a lista de bibliotecas)
- [x] Estruturas de layout e conteúdo da decisão 9, com `code` (`symbol`, `path`, `params`, `notes`), componente, documento e exemplos
- [x] Os 15 tipos do exemplo refeitos com `code`, `variants` e as variantes da decisão 13; ícones por `suggestions` (decisão 11); imagem pelo nó `image` (decisão 12)
- [x] Documento da biblioteca com o padrão dos espaços (decisão 10), do Scaffold e de tamanho e alinhamento
- [x] `tests/model/material3ComposeLibrary.test.ts` no molde de `kotlinLibrary.test.ts`: `validateLibrary` sem erros, todo tipo com `code.compose`, todo `path` dentro de `compose/`, toda `variants` resolvendo para um símbolo, todo arquivo do disco citado, todo exemplo desenhando
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

**Commit fixado e famílias (registro da MD2).** O espelho do androidx no GitHub não tem tags; o `repo.ref` é o commit `5113b82a4ed6416d6344efa50e41db8cb65928ff`, o fim do intervalo da release `compose.material3` 1.4.0 (24/09/2025) nas notas de versão (`libraryversions.toml` nele: `COMPOSE_MATERIAL3 = "1.4.0"`; a foundation no commit é a `1.10.0-alpha01`, com a mesma API estável da `1.9.0-beta01.txt`). Status lido na linha de cada função em `compose/material3/material3/api/current.txt`: `@ExperimentalMaterial3Api` na linha exige opt-in de quem chama; o `@OptIn` no fonte é interno. `@ExperimentalMaterial3ExpressiveApi` é `internal` e não aparece no `current.txt`: os expressivos da seção "Fora" (button group, toggle/split button, FAB menu, loading indicator, toolbars, app bar with search, Medium FAB) **não existem** como composable público no commit. Raiz dos arquivos: `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/`.

| Família | Composables | Arquivo | Status | Fase |
| --- | --- | --- | --- | --- |
| Icon buttons | `IconButton`, `IconToggleButton`, `FilledIconButton`, `FilledIconToggleButton`, `FilledTonalIconButton`, `FilledTonalIconToggleButton`, `OutlinedIconButton`, `OutlinedIconToggleButton` | `IconButton.kt` | estáveis | MD3 |
| Segmented buttons | `SingleChoiceSegmentedButtonRow`, `MultiChoiceSegmentedButtonRow`, `SegmentedButton` | `SegmentedButton.kt` | estáveis | MD3 |
| Radio button | `RadioButton` | `RadioButton.kt` | estável | MD3 |
| Sliders | `Slider`, `RangeSlider` | `Slider.kt` | só o overload `(value, onValueChange, …)` é estável; os de `SliderState` pedem opt-in (usar o estável) | MD3 |
| Search | `SearchBar`, `DockedSearchBar`, `ExpandedFullScreenSearchBar`, `ExpandedDockedSearchBar`, `TopSearchBar` | `SearchBar.kt` | `@ExperimentalMaterial3Api` | MD3 (opt-in) |
| Date picker | `DatePicker`, `DateRangePicker`, `DatePickerDialog` | `DatePicker.kt`, `DateRangePicker.kt`, `DatePickerDialog.kt` | estáveis (os `remember…State` com `java.time` pedem opt-in) | MD3 |
| Time picker | `TimePicker`, `TimeInput`, `TimePickerDialog` | `TimePicker.kt`, `TimePickerDialog.kt` | `TimePicker`/`TimeInput` com opt-in; `TimePickerDialog` estável | MD3 (opt-in) |
| Badge | `Badge`, `BadgedBox` | `Badge.kt` | estáveis | MD3 |
| Snackbar | `Snackbar`, `SnackbarHost` | `Snackbar.kt`, `SnackbarHost.kt` | estáveis | MD3 |
| Tooltips | `TooltipBox`, `PlainTooltip`, `RichTooltip` | `Tooltip.kt` | `@ExperimentalMaterial3Api` | MD3 (opt-in) |
| Progress indicators | `CircularProgressIndicator`, `LinearProgressIndicator` | `ProgressIndicator.kt` | estáveis | MD3 |
| Secure text field | `SecureTextField`, `OutlinedSecureTextField` | `SecureTextField.kt` | estáveis | MD3 |
| Divider | `HorizontalDivider`, `VerticalDivider` | `Divider.kt` | estáveis | MD4 |
| Dialogs | `AlertDialog`, `BasicAlertDialog` | `AlertDialog.kt` | `AlertDialog` estável; `BasicAlertDialog` com opt-in | MD4 |
| Menus | `DropdownMenu`, `DropdownMenuItem`, `ExposedDropdownMenuBox` | `Menu.kt`, `ExposedDropdownMenu.kt` | `DropdownMenu` estável; `ExposedDropdownMenuBox` com opt-in | MD4 |
| Navigation rail | `NavigationRail`, `NavigationRailItem`, `WideNavigationRail`, `ModalWideNavigationRail`, `WideNavigationRailItem` | `NavigationRail.kt`, `WideNavigationRail.kt` | estáveis | MD4 |
| Short navigation bar | `ShortNavigationBar`, `ShortNavigationBarItem` | `ShortNavigationBar.kt` | estáveis | MD4 |
| Navigation drawer | `ModalNavigationDrawer`, `DismissibleNavigationDrawer`, `PermanentNavigationDrawer`, os `*DrawerSheet`, `NavigationDrawerItem` | `NavigationDrawer.kt` | estáveis | MD4 |
| Tabs | `PrimaryTabRow`, `SecondaryTabRow`, `PrimaryScrollableTabRow`, `SecondaryScrollableTabRow`, `Tab`, `LeadingIconTab` | `TabRow.kt`, `Tab.kt` | estáveis (`TabRow`/`ScrollableTabRow` são `@Deprecated`) | MD4 |
| Bottom app bar | `BottomAppBar` | `AppBar.kt` | estável sem `scrollBehavior` | MD4 |
| Carousel | `HorizontalMultiBrowseCarousel`, `HorizontalUncontainedCarousel`, `HorizontalCenteredHeroCarousel` | `carousel/Carousel.kt` | `@ExperimentalMaterial3Api` | MD4 (opt-in) |
| Pull to refresh | `PullToRefreshBox` | `pulltorefresh/PullToRefresh.kt` | estável | MD4 |
| Swipe to dismiss | `SwipeToDismissBox` | `SwipeToDismissBox.kt` | estável | MD4 |
| Side sheet | nenhum composable público | — | não existe | fora |


#### MD3 — Ações, seleção e comunicação

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Segue os padrões da MD2.

- [x] As famílias de ação, seleção e comunicação estáveis na tag fixada (as da fase MD3 na tabela da MD2: icon button, segmented button, radio button, slider, search, date picker, time picker, badge, snackbar, tooltip, progress indicator e secure text field), cada uma com `code`, `variants`, componente, documento e exemplos; o teste da biblioteca cobre os tipos novos
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

**Registro da MD3.** 13 tipos novos na camada Componentes (39 no total): `icon-button` e `icon-toggle-button` (`variants` em `style`), `segmented-button` (`selection`; o `repeat` das opções), `radio-button`, `slider` (`type`; valores em décimos, porque o componente não faz aritmética), `search-bar` (`style`; opt-in), `date-picker` (`selection`), `time-picker` (`mode`; opt-in), `badge`, `snackbar`, `tooltip` (`style`; opt-in), `progress-indicator` (`shape`) e `secure-text-field` (`style`). Estáveis no commit fixado, sem opt-in: os botões de ícone, o segmented, o radio, o slider (overload `value`/`onValueChange`), o date picker, o badge, o snackbar, o progress e o secure text field; com `@ExperimentalMaterial3Api`: search bar, time picker e tooltip (o `notes` diz o opt-in). Desvios: o slider segue o desenho 1.4.0 (trilho de 16 dp); `date-picker.json` e `time-picker.json` têm 120 KB e 98 KB (desenho de 31 dias e do relógio); `secure-text-field` tem `hasText` em vez de um `value`; `rememberTooltipPositionProvider` usa `TooltipAnchorPosition.Above`, porque o overload sem argumento é deprecated.

#### MD4 — Navegação e contenção

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Segue os padrões da MD2.

- [x] As famílias de navegação e contenção estáveis na tag fixada (as da fase MD4 na tabela da MD2: divider, dialog, menu, navigation rail e wide rail, short navigation bar, navigation drawer, tabs, bottom app bar, carousel, pull to refresh e swipe to dismiss; o side sheet não tem composable público), cada uma com `code`, `variants`, componente, documento e exemplos; o teste da biblioteca cobre os tipos novos
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

**Registro da MD4.** 11 tipos novos na camada Componentes (50 no total): `divider` (`orientation`; a espessura é aproximada por quatro retângulos, porque `width`/`height` de nó não aceitam expressão), `alert-dialog` (`style`; `BasicAlertDialog` com opt-in), `dropdown-menu` (`style`; `ExposedDropdownMenuBox` com opt-in, troca o `path`), `navigation-rail` (`style`: rail, wide, modal-wide), `short-navigation-bar`, `navigation-drawer` (`style`: modal, dismissible, permanent; envolve o Scaffold), `tabs` (`style` com as quatro fileiras; `iconPosition` escolhe `Tab` ou `LeadingIconTab` só no `notes`, porque `variants` tem um nível), `bottom-app-bar` (overload sem `scrollBehavior`), `carousel` (`style`; pacote `material3.carousel`; opt-in; desenho de largura uniforme), `pull-to-refresh` e `swipe-to-dismiss` (`direction` vai em `initialValue` do estado). Tudo estável no commit fixado, menos alert-dialog `basic`, dropdown-menu `exposed` e carousel (`@ExperimentalMaterial3Api`). Desvios: exemplos de tipo não aceitam valores de `table`, então os exemplos de tipos com itens desenham sem linhas (o preview traz as linhas); o `centered` do short-navigation-bar usa margem de 10% (o real é 60% a 80%); o Scaffold não tem slot para rail nem drawer (o `notes` de cada um diz onde entram). Os avisos fixos do teste ganharam os campos de modificador não usados pelo desenho do alert-dialog, carousel e swipe-to-dismiss.

#### MD5 — Roteiro e fechamento técnico

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low.

- [x] Roteiro na seção 8 do `docs/TESTING.md` (R17), feito pelo agente sozinho: aplicar `libraries/material3-compose/`, mapear uma tela com Scaffold, Top app bar, LazyColumn com List items, um Button outlined e um FAB, e conferir pelo MCP que `get_code_hints` devolve a árvore com os composables certos (teste de `tests/tooling/testingGuide.test.ts`)
- [x] Zip da biblioteca para aplicar pela app (`examples/material3-compose.zip`, ao lado dos outros zips de teste; a pasta `libraries/` fica só com as fontes), conferido por teste
- [x] PR da MD5 aberto com o rótulo `mcp-rc` (última fase do épico)
- [x] Rodada dirigida do Cowork e o relato entre os documentos da etapa (`docs/history/relato-2026-11-01-material3.md`: build `11d9b65`, 35 ✅ e 1 ❌ baixo)
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-material3.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md`
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

**Avisos do pacote.** O validador deixou de avisar "campo não usado pelo desenho" quando o `code` do tipo usa o campo (`params`, `values`, `variants` ou palavra das `notes`): a biblioteca passou de 82 para 50 avisos. Depois, o `minSize` dos componentes foi conferido contra o código do androidx no commit fixado: ficou só onde há mínimo oficial nos dois eixos (15 tipos mantidos, 4 deles depois removidos por serem mínimo do controle e não do desenho com rótulo; 35 removidos) e, como o aviso de conteúdo maior que a caixa no tamanho mínimo só serve a quem escreve o componente, a prova de desenho passou a desenhar só o tamanho inicial: a biblioteca ficou com 2 avisos (a fonte Roboto, depois resolvida com os `.woff2` no pacote: 0 avisos) e a de exemplo `examples/libraries/material3/` foi de 42 para 3. A tabela de fontes está em `libraries/README.md`.

**Rodada do Cowork da etapa (2026-11-01).** R0, R16, R17, R3.6 e R10 no build `11d9b65`: 35 ✅ e 1 ❌ baixo (R10.7). O ❌ foi texto velho do guia, não defeito: desde a etapa Marcações espaciais, o "Adicionar" do Catálogo sem seleção e sem container sob o centro da vista põe o componente no canvas (`componentTarget`, regra 4), e o botão só fica desabilitado em projeto somente leitura. Guia corrigido (R10.7; R16.3 com `background`; R16.9 com a dica `.tooltip`; R16.10 pela **Abrir biblioteca** com uma pasta de pacote; R17.1 com os 82 avisos; R17.9 com "Variantes (Estilo)"). Fica para decidir: o botão do diálogo do Catálogo diz "Adicionar à tela" mesmo quando o destino é o canvas (o rótulo da Paleta já muda).

**Registro da MD5.** Zip em `examples/material3-compose.zip` (conteúdo da pasta na raiz, gerado por `scripts/material3ComposeZip.mjs`, sem fonte própria além de `libraries/material3-compose/`; `tests/examples/material3ComposeZip.test.ts` prova que o zip tem exatamente o conteúdo da pasta e que é um pacote válido). Roteiro R17 (9 passos, quadro "Comece aqui" na linha 19) e `tests/mcp/material3Compose.test.ts`, que mapeia a mesma tela com o MCP real e confere a árvore de `get_code_hints` e o `find_by_code` pela variante. No `get_code_hints`, só as anotações de tipos com `variants` trazem `code` na `tree`; as demais têm o composable em `types`.

## Decisões consolidadas dos PRs

- **Plano (PR #259):** a biblioteca nasce de um épico próprio, a partir do `epic/imagens-remotas` (os componentes com imagem usam o nó `image`); só entra na `main` depois dele. Só Jetpack Compose, só o que é estável no `compose.material3` fixado, e a variante que troca o composable vira `variants` no `code`.
- **MD1 (PR #261, `variants` no `code`):**
  - Especialização `formatVersion` 9: `variants` com `field` (um `enum` do tipo) e `cases` que trocam `symbol`, `path` e `notes` e somam `params` e `values`; um nível só. `resolveCode` é o único lugar que resolve o caso (`get_code_hints`, `get_annotation`, `get_marking`, `find_by_code`, a Definição dos Detalhes). Catálogo com a tabela de variantes. MCP 0.12.0.
  - Integridade: um projeto com uma cópia em `specs/` que a app não lê preserva as anotações e a cópia ao gravar outra coisa. A exportação do zip não levava essa cópia (`specFiles` só incluía cópias lidas) e foi corrigida: o zip leva o texto cru dela.
- **MD2 (PR #262, base da biblioteca):** `libraries/material3-compose/` com o commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` do androidx (o espelho do GitHub não tem tags) como `repo.ref`; layout e conteúdo (14 tipos) e os 15 tipos do exemplo refeitos; teste `tests/model/material3ComposeLibrary.test.ts`.
- **MD3 (PR #263) e MD4 (PR #265):** 13 e 11 tipos novos, 50 no total; os desvios de cada fase estão nos "Registro da MD3" e "Registro da MD4" acima.
- **MD5 (PR #269):** `examples/material3-compose.zip` (`npm run build:material3-zip`, conferido por teste), roteiro R17 (9 passos, feito pelo agente sozinho) e `tests/mcp/material3Compose.test.ts`, que mapeia uma tela com a biblioteca pelo MCP real. O zip fica em `examples/`, ao lado dos outros zips de teste; a fonte é só a pasta `libraries/material3-compose/`.
- **Relato, guia e ajustes da biblioteca (PR #270):**
  - Relato da rodada do Cowork arquivado. O ❌ (R10.7) era texto velho do guia: desde a etapa Marcações espaciais, o "Adicionar" do Catálogo sem seleção e sem container sob o centro da vista põe o componente no canvas. Guia corrigido (R10.7, R16.3, R16.10, R17.1, R17.9 e o apêndice A).
  - Validador da biblioteca (`src/model/library.ts`): um campo que o desenho não usa deixa de avisar quando o `code` do tipo o usa (`params`, `values`, `variants` ou palavra das `notes`). Regra em `docs/COMPONENT-FORMAT.md`.
  - Validador (`src/model/libraryDrawing.ts`): a prova de desenho desenha só o tamanho inicial (`size`); o `minSize` deixou de ser desenhado. A biblioteca de exemplo `material3` foi de 42 para 3 avisos.
  - **`minSize` só com fonte oficial:** cinco subagentes leram o androidx no commit fixado e levantaram o mínimo oficial dos 50 tipos; o campo ficou em 11 componentes (mínimo oficial nos dois eixos, valores corrigidos: Button 58 × 40, campos de texto 280 × 56, Search bar 360 × 56 etc.) e foi removido dos outros 39, com a tabela de fontes em `libraries/README.md`. O formato exige os dois eixos, então mínimos de um eixo só ficaram de fora.
  - A fonte Roboto vem no pacote (`.woff2` do `@fontsource/roboto` 5.3.0, licença OFL em `fonts/LICENSE-Roboto.txt`): a biblioteca valida sem nenhum aviso. O desenho dos componentes é sempre o tema claro baseline.
  - A etapa **Exemplos enxutos** (`epic/exemplos-enxutos`, EX1 a EX3) foi planejada no `PLAN.md`: `examples/libraries/` fica só com o que as bibliotecas de `libraries/` não cobrem.
- **Fechamento:** histórico (este arquivo), `PLAN.md` com a etapa como ponteiro, `CHANGELOG.md`, `docs/ROADMAP.md` e `CLAUDE.md` atualizados. O MCP 0.12.0 estável (`mcp-v0.12.0`) é tag do dono depois do merge do épico na `main`; a `mcp-v0.12.0-rc.1` é do commit `c3f2b0a`, anterior ao PR #270.

## Rodada do Cowork

Dirigida (R0, R16.1 a R16.10, R17.1 a R17.9, R3.6 e R10), no preview do épico, build `11d9b65 · 2026-11-01`: 36 passos, 35 ✅, 1 ❌ (R10.7, texto velho do guia), 0 não executados; 1 achado baixo, sem regressão, tratado no PR #270. Relato em [`relato-2026-11-01-material3.md`](relato-2026-11-01-material3.md).

## O que ficou para depois

- Componentes e variantes do M3 Expressive, quando ficarem estáveis no Compose; Flutter, Material Web e outras plataformas; tema escuro e cores dinâmicas no desenho dos componentes (o desenho é o tema claro baseline).
- `minSize` de um eixo só (mudança de formato): hoje os mínimos oficiais que existem em um eixo só (a largura do `alert-dialog` e do `navigation-drawer`, a altura do `top-app-bar`, do `list-item` e do `chip`) ficam sem registro no campo.
- O botão do diálogo do Catálogo diz "Adicionar à tela" mesmo quando o destino é o canvas (o rótulo da Paleta já muda); o seletor **Biblioteca** do Catálogo volta para "Notas" ao trocar de aba; o aviso "Não foi possível ler o pacote." de **Abrir biblioteca** não diz que faltou o gesto da pessoa.
- A etapa **Exemplos enxutos** (EX1 a EX3), que tira de `examples/libraries/` o que a `material3-compose` já cobre.
- O BFF de SDUI de quem usa a biblioteca, que fica numa especialização própria.
