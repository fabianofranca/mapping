# Exemplos

Este guia diz **o que dá para ver em cada exemplo** do repositório e como abri-lo. Serve a quem usa a app e o MCP: para aprender um recurso, escolha o exemplo que o mostra e abra.

Os exemplos moram em três lugares:

- `libraries/`: as bibliotecas reais, prontas para uso. É a primeira fonte de exemplo de qualquer recurso.
- `examples/`: só o que as bibliotecas não cobrem, mais os projetos e os zips prontos para os roteiros de teste.
- `tests/fixtures/`: arquivos que só os testes leem. Não são exemplos e não estão neste guia.

O teste `tests/examples/featureCoverage.test.ts` garante que todo recurso dos formatos de especialização e de componente tenha pelo menos um exemplo. O teste `tests/examples/examplesReadme.test.ts` garante que cada exemplo do disco tenha uma seção aqui e que nenhuma seção aponte para algo que não existe mais.

Os nomes dos botões vêm da app em português. Na tela inicial: **Abrir pasta**, **Abrir zip**, **Abrir projeto de exemplo** e **Abrir biblioteca**. Em **Especializações**: **Aplicar especialização…**, **Aplicar pasta…** (só no Chrome e no Edge), **Aplicar zip…** e **Atualizar de pasta…**. O **Catálogo** abre com `Ctrl+Shift+9`. Os roteiros `R…` estão em [`docs/TESTING.md`](../docs/TESTING.md).

## Bibliotecas prontas (`libraries/`)

### `libraries/notas/`

**O que é.** Notas soltas no canvas: o post-it de texto (**Nota**) e a tabela de chave e valor (**Tabela**). Dois tipos, os dois flutuantes.

**Como abrir.** Já vem na app e é aplicada sozinha em todo projeto novo. Para ver o desenho e a documentação sem projeto: **Abrir biblioteca** na tela inicial e escolher a pasta. Com um projeto aberto: **Catálogo** (`Ctrl+Shift+9`), aba **Componentes**, biblioteca **Notas**; na aba **Paleta**, **Adicionar**.

**O que dá para ver.**

- A marcação flutuante: a nota e a tabela ficam por cima de tudo, não pertencem a nenhuma tela e não se movem junto com ela (`floating` nos dois tipos).
- A nota (`nota`): campos `titulo` e `texto` (obrigatório), cartão amarelo com sombra.
- A tabela (`tabela`): campo `linhas` do tipo tabela (colunas `chave` e `valor`) desenhado linha a linha pelo nó `repeat`, com o `preview` já em forma de tabela.
- Um documento por tipo (`docs/nota.md`, `docs/tabela.md`) e um exemplo nomeado em cada tipo.
- Dimensionamento simples: `size`, `minSize` e `sizing` com `fill`; condições com `$has` para esconder o título vazio.

**Roteiros.** R10.8, R11.5, R12.13 a R12.16.

### `libraries/kotlin/`

**O que é.** As declarações Kotlin como tipos de anotação: classe, data class, sealed class, enum class, value class, annotation class, object, data object, interface, sealed interface e fun interface. Cada uma é um cartão de diagrama de classes.

**Como abrir.** Não vem embutida. **Especializações** › **Aplicar pasta…** (ou **Aplicar zip…** com um zip da pasta). Sem projeto: **Abrir biblioteca**. Já aplicada e com dados: `examples/sugestoes-kotlin.zip`.

**O que dá para ver.**

- Duas camadas (`kotlin-classes` e `kotlin-interfaces`) com onze tipos, cada um com componente, documento e exemplo.
- Tabelas com várias colunas: **Propriedades**, **Funções**, **Supertipos** e **Entradas** (enum class), desenhadas pelo `repeat`, com a altura medida pelo número de linhas.
- Referências entre declarações: o campo `outer` (**Declarada em**) e a coluna `typeRef` (**Tipo mapeado**) são `ref` que aceitam a etiqueta `kotlin-type`. Cada linha de **Propriedades** é alvo de referência com as etiquetas `data-field` e `kotlin-property`, nomeada pela coluna `name` (`rowLabel`).
- Sugestões de texto: a coluna **Tipo** de **Propriedades** tem `suggestions` (`String`, `Int`, `List`…), que não restringem o valor.
- Alvos mapeados na lista: `linkedRef` liga a coluna **Tipo** à coluna **Tipo mapeado**; escolher uma declaração grava o texto e a referência juntos, numa entrada do desfazer.
- `enum` com valor padrão (visibilidade, modalidade) e componentes com `$switch`, `$if`, `$concat`, `$has` e `$field` com `default`, texto em itálico e opacidade.

**Roteiros.** R14.

### `libraries/material3-compose/`

**O que é.** O Material Design 3 para Jetpack Compose: 50 tipos em três camadas (layout, conteúdo e componentes), fixados no `androidx.compose.material3` 1.4.0, com a fonte Roboto no pacote.

**Como abrir.** Não vem embutida. **Especializações** › **Aplicar pasta…**, ou **Aplicar zip…** com o `examples/material3-compose.zip`. Sem projeto: **Abrir biblioteca**. Pelo MCP: `validate_library` e `apply_specialization`.

**O que dá para ver.**

- O Button, com a tabela de variantes no Catálogo (`variants` no `code`): o campo `style` troca o composable (`Button`, `OutlinedButton`, `TextButton`, `FilledTonalButton`, `ElevatedButton`). Vinte e seis tipos têm variantes.
- O `code` completo de cada tipo na plataforma Compose: `symbol`, `path` no repositório do androidx (com `repo` fixado num commit e `urlTemplate`), `params`, `values` (a tradução das opções para a expressão do código) e `notes`.
- Os quatro tamanhos prontos de container (`containers`): Celular, Celular grande, Tablet e Desktop, no diálogo **Novo container**.
- As fontes Roboto 400 e 500 em `.woff2` (`fonts`), então os textos saem em Roboto e a validação não dá avisos.
- Componentes com espaço para filhas (nó `slot`): Scaffold, Surface, Box, Row, Column, LazyColumn, LazyRow, LazyVerticalGrid, FlowRow, HorizontalPager e PullToRefresh.
- Tabelas desenhadas (`repeat`, na coluna e na linha): Navigation bar, Navigation rail, Navigation drawer, Tabs, Segmented button, Dropdown menu, Bottom sheet, Carousel e Short navigation bar.
- Imagem remota (nó `image` com `fit` `cover`, `contain` e `fill`): Image, Card (`media`), List item (`leadingImage`) e Carousel. Sem consentimento da origem, aparece o reservado cinza.
- Ícones e formas: nó `path` (a maioria dos tipos), `ellipse` (Switch, Radio button, Slider, Progress indicator) e `rect`.
- Tamanho mínimo oficial (`minSize`) só onde o Compose define nos dois eixos: Button 58 × 40, Text field 280 × 56, FAB 40 × 40 e outros.
- Sugestões de texto nos campos de ícone (`suggestions`: `Home`, `Search`, `Add`…).
- Dimensionamento com porcentagem (Slider, Short navigation bar), âncoras (`anchors`, inclusive `centerX`), degradê (Carousel), traço tracejado e `outside`, `$and`, `$or` e `$not` nas condições.
- Os 50 tipos têm componente, documento e de um a três exemplos.

**Roteiros.** R17.

## Bibliotecas que ficam (`examples/libraries/`)

### `examples/libraries/analytics/`

**O que é.** Eventos de analytics no canvas: o **Evento** (tabela solta com nome e propriedades) e a **Transição** (anotação de uma seta).

**Como abrir.** **Especializações** › **Aplicar pasta…** e escolher a pasta. Ou **Abrir biblioteca** para só ver o Catálogo.

**O que dá para ver.**

- O tipo que só vale em seta (`appliesTo: arrow`): a **Transição** só aparece para quem seleciona uma seta, com os campos **Condição** e **Evento**. Nenhuma outra biblioteca tem um tipo só de seta.
- O **Evento** é uma marcação flutuante com componente: cabeçalho roxo com o nome do evento e uma linha por propriedade, desenhada pelo nó `repeat` (campo `propriedades`).
- Um documento por tipo e um exemplo nomeado em cada.

**Roteiros.** R12.19 e R12.20.

### `examples/libraries/sdui-backend/`

**O que é.** O exemplo da **origem executável**: um sistema externo fictício (um backend de SDUI) descreve telas em JSON e a declaração `origins` as traduz em componentes. Seis tipos: **Column** (com slot), **Button**, **FAB** (flutuante), **Bottom sheet** (modal), **Scrim** e **Endpoint** (anotação só de marcação, sem componente). Versão 2, sem fontes.

**Como abrir.** **Especializações** › **Aplicar pasta…** e escolher a pasta. Ou **Abrir biblioteca** para só ver o Catálogo (sem erro nem aviso).

**O que dá para ver.**

- A origem (`origins`): `booleans`, `background.values`, raízes da tela com `anchor`, `margin` e `scrim` (o tipo `sdui-scrim`) e a tela de exemplo `examples/settings.sdui.json`.
- As correspondências com o sistema externo (`sources`): `slot` e `ignore` no tipo, `id` de um sistema não executável (`figma`), `path` e `values` nos campos e na coluna de uma tabela, e o exemplo de um nó do sistema externo (`examples/button.sdui.json`, na Galeria do Button).
- O contrato de versão (`migrations`): uma migração da versão 1 para a 2 com os seis passos (`rename-type`, `rename-field`, `map-values`, `fill-field`, `remove-field`, `remove-type` em `convert` e em `delete`).
- O tipo **Endpoint**: `appliesTo: marking`, `linkedRef` (o texto do tipo da resposta grava o vínculo junto), e uma tabela com colunas `number`, `date`, `enum` com origem e `ref` que aceita `free`.
- Um container com `background` (`containers[].background`).
- Recursos do componente: `font.decoration` (sublinhado e tachado no Button), `verticalAlign` `top` e `bottom` e `layout.align` `end` (Bottom sheet), `fillRule` `nonzero` e `evenodd` (FAB) e uma imagem com `src` literal (Bottom sheet).

**Roteiros.** R10.10 e R10.11.

## Bibliotecas de exemplo que saem (`examples/libraries/`)

### `examples/libraries/material3/`

**O que é.** Um pacote antigo e completo do Material 3 com quinze tipos (`m3-button`, `m3-card`, `m3-chip`…), gerado do laboratório. Os testes e o projeto de exemplo ainda o usam.

**Sai nesta etapa (EX3): vai para `tests/fixtures/`; o que só ele mostrava passa à `sdui-backend` (EX1) ou à `material3-compose`.**

**Como abrir.** **Especializações** › **Aplicar pasta…** ou **Aplicar zip…** (zip da pasta). Sem projeto: **Abrir biblioteca**.

**O que dá para ver.**

- A origem executável completa (`origins`): um sistema externo que descreve telas em JSON, com `booleans`, `background.values`, raízes da tela com `anchor`, `margin` e `scrim` (a película `m3-scrim`) e a tela de exemplo `examples/settings.sdui.json`.
- A correspondência entre os tipos e os elementos do sistema externo (`sources` com `slot`, `values` e `ignore`).
- Os quatro tamanhos prontos de container.
- Um componente com largura calculada por expressão (`m3-text-field`), `minSize` e `sizing` em todos os quinze.
- Fontes declaradas sem os arquivos (só o `LEIA-ME.txt`): os textos saem na fonte do sistema e a validação avisa.

**Roteiros.** R3.10 a R3.17, R9, R10 e R12.12 (passam à `material3-compose` na EX3).

### `examples/libraries/pessoas/`

**O que é.** Um tipo só, o **Avatar**: a foto redonda de uma pessoa com o nome ao lado.

**Sai nesta etapa (EX3): vai para `tests/fixtures/`; o que só ele mostrava passa à `sdui-backend` (EX1) ou à `material3-compose`.** O tipo `image` da `material3-compose` tem o campo `url` e mostra o mesmo recurso.

**Como abrir.** **Especializações** › **Aplicar pasta…** e escolher a pasta.

**O que dá para ver.**

- A imagem remota: o nó `image` com o `src` ligado ao campo `foto`. Antes do consentimento da origem, com URL recusada ou com falha, aparece o reservado (a caixa cinza com um X). Nada além da URL é gravado.
- A faixa de consentimento por origem e os interruptores de **Configurações** › **Privacidade**.

**Roteiros.** R15.

## Especializações de arquivo único (`examples/specs/`)

Para aplicar um arquivo solto: **Especializações** › **Aplicar especialização…**. Os dois principais também saem da própria app, em **Ajuda** (F1) › **Downloads**. Pelo MCP: `validate_specialization` e `apply_specialization`.

### `examples/specs/sdui.json`

**O que é.** A especialização SDUI, `formatVersion` 5: componentes de uma interface descrita por servidor (Button, Input, Text, Image), eventos (onClick, onHold, onChange) e telas.

**O que dá para ver.**

- Três plataformas (Android, iOS e BFF), cada uma com `repo`, `urlTemplate` e `ref`, e o `code` de cada tipo nelas (`symbol`, `path`, `params`, `values` e `notes`). Nos Detalhes, a linha **Definição** tem **Abrir no repositório** e **Copiar caminho**.
- Relações entre camadas: o Button aceita `onClick` e `onHold` como filhos (`allowedChildren`); os eventos exigem um dono (`requiresOwner`).
- Referência forte: o campo `dado` do Input e do Text é um `ref` que aceita a etiqueta `data-field` ou uma anotação livre (`accepts`).
- Os tipos de valor `string`, `number`, `enum` (com valor padrão) e `table` (os `parametros` do onClick), e campos obrigatórios.
- Um arquivo sem biblioteca: não tem componente nem documento.

**Roteiros.** R1.3, R3 (R3.1 a R3.9) e R8.

### `examples/specs/modelo-de-dados.json`

**O que é.** O Modelo de dados, `formatVersion` 1, o formato mais simples: duas camadas, Classes e Endpoints.

**O que dá para ver.**

- O tipo `date` (`revisadoEm`, data `AAAA-MM-DD`) e o `number` com valor padrão (`versao`, `timeoutMs`).
- A tabela `atributos` com a etiqueta `data-field` e `rowLabel`: cada linha vira alvo de referência, que o campo `dado` da SDUI aceita.
- Uma especialização sem plataformas, sem `code` e sem biblioteca: é a `formatVersion` 1.

**Roteiros.** R1.3 e R8.

### `examples/specs/biblioteca.json`

**O que é.** Um arquivo pequeno de `formatVersion` 4 que reúne `component`, `doc`, `examples`, `fonts`, `origins`, `sources` e `migrations`. É só o arquivo da especialização: os arquivos que ele cita não vêm junto.

**Sai nesta etapa (EX3): vai para `tests/fixtures/`; o que só ele mostrava passa à `sdui-backend` (EX1) ou à `material3-compose`.**

**O que dá para ver.**

- As migrações (`migrations`): a versão 2 com um passo `rename-field` (`texto` vira `label`) que a atualização de uma biblioteca aplica aos dados.
- A origem e as correspondências, em ponto pequeno: `sources` com `ignore` e uma propriedade de origem com `values` (`filled` vira `primary`).
- Uma fonte declarada (`fonts`).

## Projetos e zips prontos (`examples/`)

### `examples/exemplo-completo/` e `examples/exemplo-completo.zip`

**O que é.** O projeto de exemplo da app, com quatro telas, e a fonte do guia interativo. A pasta e o zip têm o mesmo conteúdo; o zip é o que a app embute.

**Como abrir.** Tela inicial › **Abrir projeto de exemplo** (grava só uma cópia **Neste dispositivo**, nada em pasta). Ou **Abrir zip** com o `examples/exemplo-completo.zip`, ou **Abrir pasta** na pasta. O guia: link **Guia interativo** na tela inicial e na **Ajuda**.

**O que dá para ver.**

- Quatro telas lado a lado: Cadastro e Login (com foto), Configurações e Detalhes do pedido (container sem foto, com componentes Material 3 desenhados com os textos das anotações).
- Nove camadas e quatro especializações aplicadas: SDUI, Modelo de dados, Material 3 e Notas. Há anotações de todos os tipos principais (Button, Input, Text, onClick, onHold, onChange, Screen, classe e endpoint) e livres (Model e Dúvidas).
- Casos de edição: uma marcação trancada (**Título**), uma com posição a revisar (**Idade**, em **Incompletas**), uma nota flutuante da biblioteca de notas e as marcações aninhadas na **Árvore**.
- Uma proposta aberta, **Tela de Perfil e ajuste no Cadastro**, com dez mudanças para praticar a revisão: aceitar, rejeitar com nota e aplicar.
- O **Arrumar** (`Alt+Shift+A`) de um Row com chips, o **Catálogo** com a **Paleta** e o **Diagnóstico**.

**Roteiros.** R11.

### `examples/proposta-exemplo.zip`

**O que é.** O projeto **Loja** com uma proposta de um agente a revisar.

**Como abrir.** **Abrir zip** com o arquivo. Depois **Propostas** (`Ctrl+Shift+7`) › **Revisar**.

**O que dá para ver.**

- A proposta **Checkout a partir do Figma**: cria a camada Eventos e a imagem **Confirmação** (com a marcação **Mensagem de sucesso**), troca a imagem do Carrinho, renomeia o **Cabeçalho**, move o **Botão Pagar**, cria o **Campo Cupom** (com uma anotação Input), remove o **Banner promoção** e mexe em anotações.
- A visão **Atual** × **Proposto**, as marcas de decisão, o conflito de nome (renomear antes de revisar), o cadeado do **Botão Pagar** trancado, a nota para o agente, **Aplicar aceitas** e o desfazer em um passo.
- **Exportar** com a proposta aberta e **Apagar proposta…**.

**Roteiros.** R4, R6 e R8.

### `examples/proposta-componentes.zip`

**O que é.** O projeto **Telas** (uma tela em branco de 360 × 800 com o Material 3 aplicado) e uma proposta aberta que cria componentes.

**Como abrir.** **Abrir zip** com o arquivo; **Propostas** › **Revisar** em **Componentes novos**.

**O que dá para ver.** Na visão **Proposto**, os componentes que a proposta cria, desenhados com a marca de criada, em cada caso de revisão: o **Existente** alterado (Label `Antigo` vira `Novo valor`), **Pendente**, **Aceito**, **Rejeitado** (só o fantasma pontilhado, nas duas visões), **Inválido** (retângulo de 3 × 3), **Sem rótulo** (campo obrigatório faltando) e **Do pacote** (um tipo que só existe no pacote da proposta, que não é gravado em `specs/`). Também a legenda das marcas, nos dois idiomas.

**Roteiros.** R13.

### `examples/sugestoes-kotlin.zip`

**O que é.** O projeto **Sugestões Kotlin**: uma imagem lisa e duas data classes da biblioteca Kotlin, **Usuario** e **Endereco**.

**Como abrir.** **Abrir zip** com o arquivo. Selecione **Usuario** e abra **Detalhes** (`Ctrl+Shift+3`).

**O que dá para ver.**

- A lista de sugestões ao digitar na coluna **Tipo** de **Propriedades** (24 tipos como `String`, `Int` e `List`), que não restringe o valor: `String?` e `List<Endereco>` são aceitos.
- A propriedade `ativo` com o **Tipo** vazio, para praticar.
- Os alvos mapeados na lista: **Endereco** aparece antes das sugestões fixas, e escolhê-la grava o texto e o **Tipo mapeado** juntos, desfeitos num `Ctrl+Z`.

**Roteiros.** R14.

### `examples/material3-compose.zip`

**O que é.** O pacote `libraries/material3-compose/` compactado, com o conteúdo na raiz do zip. Serve a quem não tem como escolher uma pasta.

**Como abrir.** **Especializações** › **Aplicar zip…**; ou **Abrir biblioteca** (o botão abre o seletor de zip quando não há pasta); ou `validate_library` pelo MCP.

**O que dá para ver.** O mesmo de `libraries/material3-compose/`, descrito acima, em um arquivo só. Um teste confere que o zip é igual à pasta.

**Roteiros.** R17.

### `examples/workspace/`

**O que é.** O esqueleto de uma pasta central de mapeamentos para trabalhar com um agente de IA: o servidor MCP, as raízes, a skill `spec-author` e as instruções (`AGENTS.md`) para qualquer cliente MCP.

**Como abrir.** Copie a pasta para onde quiser, rode `./setup.sh` e abra a pasta no agente (Claude Code, Cursor, Gemini CLI, Copilot ou Codex). Os projetos ficam em `projetos/` e as especializações em `especializacoes/`.

**O que dá para ver.**

- O `setup.sh`, que baixa o `tools/mapping-mcp.js` da última versão do servidor, confere o `sha256` e traz a skill.
- Um arquivo de configuração por ferramenta (`.mcp.json`, `.cursor/mcp.json` e os outros), todos apontando para o mesmo comando com as duas raízes.
- O `AGENTS.md` com a seção "Para que servem estes mapeamentos" para a pessoa preencher, e o `CLAUDE.md` que o importa.
- Como trabalhar a partir do repositório do código (`get_code_hints`, `find_by_code`).

**Roteiros.** Nenhum. A seção 6 do guia do testador monta o servidor MCP à parte, sem esta pasta.

## Onde ver cada recurso

Sempre que existe, o exemplo é de `libraries/`. Os recursos de origem executável, de `sources` e de migração estão na `sdui-backend`; os que dependem de arquivo de fonte e de itálico (`fonts[].style`) não têm exemplo, por decisão do dono (a fonte é fixa no cliente mobile, fora do SDUI; ficam em `EXCEPTIONS` do teste `tests/examples/featureCoverage.test.ts`, que diz qual exemplo cobre cada chave e cada valor).

### Especialização

| Recurso                                                      | Onde ver                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `string`                                                     | Nota: `texto` (`notas`); Class: `name` (`kotlin`)                                                                                 |
| `number`                                                     | `surface.tonalElevation` (`material3-compose`); `endpoint.timeoutMs` (`modelo-de-dados.json`)                                     |
| `date`                                                       | `classe.revisadoEm` (`modelo-de-dados.json`); coluna `since` de `endpoint.params` (`sdui-backend`)                                |
| `enum` e booleano como `enum`                                | `button.enabled` e `button.style` (`material3-compose`); visibilidade das classes (`kotlin`)                                      |
| `table`                                                      | Tabela: `linhas` (`notas`); Propriedades e Funções (`kotlin`); `onClick.parametros` (`sdui.json`)                                 |
| `ref` e `accepts`                                            | `outer` e **Tipo mapeado** (`kotlin`); `input.dado` com `free` (`sdui.json`)                                                      |
| Etiquetas (`tags`) e `rowLabel`                              | Propriedades com `data-field` e `kotlin-property` (`kotlin`); `classe.atributos` (`modelo-de-dados.json`)                         |
| `suggestions`                                                | Coluna **Tipo** de Propriedades (`kotlin`); campos de ícone (`material3-compose`)                                                 |
| `linkedRef`                                                  | Colunas **Tipo** de Propriedades e de Supertipos (`kotlin`); `examples/sugestoes-kotlin.zip` mostra o uso                         |
| Relações: `allowedChildren` e `requiresOwner`                | `button` e `onClick` (`sdui.json`)                                                                                                |
| Referências entre tipos                                      | **Declarada em** e **Supertipos** (`kotlin`); `input.dado` aponta para o Modelo de dados (`sdui.json` com `modelo-de-dados.json`) |
| `platforms` e `repo` (`url`, `urlTemplate`, `ref`)           | `compose` fixado num commit (`material3-compose`); `android`, `ios` e `bff` (`sdui.json`)                                         |
| `code`: `symbol`, `path`, `params`, `values`, `notes`        | Todos os tipos (`material3-compose`); `button` e `input` em três plataformas (`sdui.json`)                                        |
| `variants` no `code`                                         | `button.style` e outros 25 tipos (`material3-compose`); a tabela de variantes no Catálogo                                         |
| `containers` (tamanhos prontos)                              | Celular, Celular grande, Tablet e Desktop (`material3-compose`); `background` no Celular (`sdui-backend`)                         |
| `fonts`                                                      | Roboto 400 e 500 em `.woff2` (`material3-compose`)                                                                                |
| Tipo flutuante (`floating`)                                  | Nota e Tabela (`notas`); Evento (`analytics`)                                                                                     |
| `appliesTo`                                                  | Transição, só em seta (`analytics`); Endpoint, só em marcação (`sdui-backend`)                                                    |
| `component`, `doc` e `examples` (pacote de biblioteca)       | Todas as pastas de `libraries/` e a `analytics`                                                                                   |
| `origins`, `sources` e exemplo de tela de um sistema externo | `sdui-backend` (e `material3` e `biblioteca.json`, que saem)                                                                      |
| `migrations`                                                 | `sdui-backend` (e `biblioteca.json`, que sai)                                                                                     |
| `formatVersion` 1                                            | `modelo-de-dados.json`                                                                                                            |
| `formatVersion` 4 e 5                                        | `biblioteca.json` (4); `sdui.json` (5)                                                                                            |
| `formatVersion` 6 a 9                                        | `material3` (6); `notas`, `analytics` e `pessoas` (7); `kotlin` (8); `material3-compose` (9)                                      |
| `formatVersion` 2 e 3                                        | Sem exemplo próprio: a app aceita, e uma especialização 1 é uma 2 sem plataformas                                                 |

### Componente

| Recurso                                        | Onde ver                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `frame` e `text`                               | Todos os componentes                                                                                                                          |
| `rect`                                         | Divider e Checkbox (`material3-compose`); o cartão das classes (`kotlin`)                                                                     |
| `ellipse`                                      | Switch, Radio button, Slider e Progress indicator (`material3-compose`)                                                                       |
| `path`                                         | Ícones do Button, do Checkbox, do Chip e de outros (`material3-compose`)                                                                      |
| `image`                                        | Image, Card, List item e Carousel (`material3-compose`); Avatar (`pessoas`, sai)                                                              |
| `slot`                                         | Box, Column, Row, Scaffold e outros (`material3-compose`)                                                                                     |
| `repeat`                                       | Tabela (`notas`); Propriedades (`kotlin`); Evento (`analytics`); Navigation bar, Tabs e Carousel (`material3-compose`)                        |
| Layout `row`, `column` e `none`                | `row` e `column` em todas as bibliotecas; `none` no Box (`material3-compose`)                                                                 |
| `gap`, `padding` (número, par e quatro lados)  | Número em todas; par e quatro lados (`material3-compose`)                                                                                     |
| `align` e `justify`                            | `align` `start`, `center` e `stretch`; `justify` `start`, `center`, `end` e `space-between` (`material3-compose`: Tabs, Alert dialog, Slider) |
| Tamanho do nó: px, `fill`, `hug` e `%`         | px, `fill` e `hug` em todas; `%` no Slider e no Short navigation bar (`material3-compose`)                                                    |
| `size`, `minSize` e `sizing`                   | Todos os componentes; `minSize` oficial só no Button, FAB, Text field e outros (`material3-compose`)                                          |
| Âncoras (`anchors`)                            | `left`, `right`, `top`, `bottom`, `centerX` e `centerY` (`material3-compose`: FAB, Pull to refresh)                                           |
| Âncoras da tela e película                     | `sdui-scrim` e as raízes com `anchor` e `margin` (`sdui-backend`; também `material3`, que sai)                                                |
| Expressões `$field`, `$if`, `$switch`          | `kotlin` e `material3-compose`; `$field` com `default` em ambos                                                                               |
| `$concat`                                      | Cabeçalho das classes (`kotlin`); Box, Column e Image (`material3-compose`)                                                                   |
| Condições `$has`, `$eq`, `$not`, `$and`, `$or` | `$has` em `notas`; todas em `material3-compose`                                                                                               |
| `visible`, `opacity`, `clip`                   | `visible` em `notas`; `opacity` em `kotlin` e Surface; `clip` no Box (`material3-compose`)                                                    |
| `fill`, degradê, `stroke`, `shadow`            | Cor em todas; degradê no Carousel; `stroke` com `dash` e `align`; `shadow` em `notas` (`material3-compose`)                                   |
| `cornerRadius`                                 | Número em todas; quatro cantos (`material3-compose`)                                                                                          |
| Fonte do texto: `size`, `weight`, `italic`     | Todas; `italic` em `kotlin` e Text (`material3-compose`)                                                                                      |
| `preview`                                      | Todos; em forma de tabela em `notas`, `kotlin` e `analytics`                                                                                  |

Para um recurso que esta tabela não cita, rode o teste de cobertura (`npx vitest run tests/examples/featureCoverage.test.ts`): ele diz qual exemplo cobre cada chave e cada valor.
