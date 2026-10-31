# Changelog

Este arquivo registra, por etapa (épico), o que mudou para quem usa a app e o servidor MCP. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), adaptado: uma seção por épico ou etapa mesclada na `main`, da mais recente para a mais antiga.

**Regra:** toda entrega de `epic/*` para a `main` atualiza este arquivo no próprio PR do épico, com uma nova seção no topo. A entrada `[Não lançado]` vira a data do merge quando o dono mesclar. Os detalhes de cada etapa estão em `docs/history/`.

## [Não lançado] Biblioteca Material 3 (épico `epic/material3`, MCP 0.12.0, schema v13)

### Adicionado

- Especialização `formatVersion` 9 com `variants` no `code` de uma plataforma: um campo `enum` do tipo escolhe a variante do código, que troca o `symbol` (em Compose, `Button`, `OutlinedButton`, `TextButton`), o `path` e as `notes` e soma `params` e `values` aos da base. Um nível só; as versões 1 a 8 continuam aceitas sem mudança, e `variants` numa versão anterior é o erro `só é permitido com formatVersion 9`, no caminho exato.
- Tabela de variantes no Catálogo: abaixo do código da plataforma, "Variantes (campo)" lista cada valor e o símbolo dele.
- Roteiro de teste R16 (Variantes no código), feito pelo agente sozinho.
- Biblioteca **Material 3 (Compose)** pronta para uso em `libraries/material3-compose/` (especialização `formatVersion` 9, não embutida: aplique pela pasta ou por um zip dela): 39 tipos em três camadas (Layout: Scaffold, Surface, Box, Row, Column, LazyColumn, LazyRow, LazyVerticalGrid, FlowRow, Spacer, HorizontalPager; Conteúdo: Text, Icon, Image; Componentes: Top app bar, Button, FAB, Extended FAB, Text field, Switch, Checkbox, Chip, Card, List item, Navigation bar, Bottom sheet, Icon button, Icon toggle button, Segmented button, Radio button, Slider, Search bar, Date picker, Time picker, Badge, Snackbar, Tooltip, Progress indicator, Secure text field), cada um com o composable do `compose.material3` 1.4.0 no `code` (o arquivo no androidx, os parâmetros e as variantes que trocam o composable), componente, documento e exemplos.

### Alterado

- MCP: `get_annotation` e `get_marking` devolvem o `code` já resolvido para a variante de cada anotação (sem `variants` na saída); `get_code_hints` mantém o `code` cru da base em `types` e traz o `code` resolvido da variante nas anotações da `tree` de tipos com `variants`; `get_specialization` e `get_component` continuam devolvendo o JSON cru.
- MCP: `find_by_code` compara com o código resolvido de cada anotação (buscar o símbolo da base só traz as anotações da base, o de uma variante só as dela; buscar por `path` traz todas). Nas especializações 1 a 8 nada muda.
- A "Definição" dos Detalhes mostra o arquivo e o símbolo da variante da anotação.
- `validate_specialization`, `validate_library` e `apply_specialization` aceitam a `formatVersion` 9, com os mesmos erros da app.

### Corrigido

- O zip exportado passa a levar, sem alteração, a cópia em `specs/` de uma especialização que a app não consegue ler (versão de formato maior, arquivo inválido ou `id` diferente); antes ela ficava de fora e o zip citava uma cópia ausente.

## [Não lançado] Imagens remotas (épico `epic/imagens-remotas`, MCP 0.11.0, schema v13)

### Adicionado

- Nó `image` nos componentes (componente `formatVersion` 3; as versões 1 e 2 continuam aceitas): um componente pode exibir uma imagem por URL `https://`, ligada a um campo `string`.
- Consentimento por origem: uma faixa acima do canvas lista as origens novas e só pede a imagem à rede depois de "Permitir estas"; o padrão é "Agora não".
- Configurações › Privacidade: origens permitidas com Revogar e interruptores (desligados por padrão) para qualquer origem, `http:`, rede local e servidores sem CORS.
- Visualizador embutível 0.3.0 com a opção `remoteImages` (desligada por padrão) e `allowOrigin`.
- Roteiro de teste R15 e um exemplo de biblioteca com componente de avatar.

### Alterado

- A CSP do `index.html` passa a liberar `https:` e `http:` em `img-src`, com Trusted Types e `no-referrer`; `connect-src` continua `'none'`.
- A imagem nunca é gravada (projeto, zip, IndexedDB ou cache): só a URL fica no `mapping.json`.
- O MCP nunca baixa imagens: desenha o reservado e devolve a URL como texto.
- Imagens que falham ou são bloqueadas aparecem no Diagnóstico e ficam no reservado.

## Proposto com componentes — 2026-10-25 (PR #226, MCP 0.9.0, schema v13)

### Adicionado

- A visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, com a marca de criada.
- Roteiro R13 e o exemplo `examples/proposta-componentes.zip`.

### Alterado

- A criação rejeitada vira só o fantasma pontilhado, nas duas visões.

## Marcações espaciais, notas e setas — 2026-10-23 (PR #217, MCP 0.9.0, schema v13)

### Adicionado

- Marcação que pertence ao canvas (sem container) e que pode envolver containers; o pertencimento é resolvido pela geometria e gravado (o agente lê `parent`/`members`, nunca calcula).
- Seleção múltipla e arrasto conjunto.
- Notas: biblioteca embutida de marcações flutuantes (`floating`).
- Setas como marcações que apontam (coleção `arrows`, `appliesTo`) e tabelas com `repeat`.
- Especialização `formatVersion` 7, proposta `formatVersion` 3 e componente `formatVersion` 2.

### Alterado

- A herança entre marcações foi removida (schema v13).

## Container — 2026-10-22 (PR #213, MCP 0.8.0, schema v12)

### Alterado

- O objeto de topo do canvas passa a se chamar container (`containers` e `containerId` no `mapping.json`; tools `*_container` no MCP, com as antigas aceitas com aviso por uma versão).
- Os presets de dispositivo vêm da especialização (`formatVersion` 6) e a proposta passa à `formatVersion` 2.

## Recorte com URL — 2026-10-21 (PR #198, MCP 0.7.0)

### Alterado

- As tools de imagem do MCP, com `save`, gravam o recorte em `crops/` e devolvem `path`, `url` e `markdown`.

## Canvas limpo — 2026-10-21 (PR #203)

### Adicionado

- Ver limpo (`Alt+H`): mostra só a imagem e os componentes, sem gravar nada no projeto.

### Alterado

- O cartão de texto do zoom semântico saiu do canvas; as anotações ficam só no painel direito.

## Código de instanciação — 2026-10-20 (PR #190, MCP 0.6.0, schema v11)

### Alterado

- O `code` das especializações passa a ser o código com que se cria uma instância do tipo.
- `platforms[].repo` fica na especialização e o projeto guarda só o clone local (especialização `formatVersion` 5).

## Biblioteca — 2026-10-19 (PR #180, MCP 0.5.0, schema v10)

### Adicionado

- Biblioteca como pacote: a pasta da especialização com componentes, fontes, documentos e exemplos.
- Telas com componentes e o Catálogo.
- Atualização da biblioteca com migrações; `validate_library` no MCP.

### Alterado

- Especialização `formatVersion` 4 e formato de componente (`docs/COMPONENT-FORMAT.md`).

## Laboratório de componentes — 2026-10-17 (PR #160)

### Adicionado

- `lab/components/`: experimentos fora do produto que provaram o formato de componente (template de primitivas com expressões sobre os campos), containers e fontes do design system.

## Etapa 10 — 2026-10-15 (PRs #154 e #155, MCP 0.4.0, schema v9)

### Corrigido

- Nota sugerida e foco ao rejeitar pelo marcador na revisão; seleção depois de rejeitar a criação.
- Guia do testador atualizado.

## Etapa 9 — 2026-10-15 (PRs #145 a #152, MCP 0.4.0, schema v9)

### Adicionado

- Apagar proposta que não está aberta.
- `path` (arquivo do símbolo) no `code` da especialização.
- Detalhes na revisão, com o painel normal e um marcador por campo.

### Alterado

- `codeRef` removido (schema v9).

## Etapa 8 — 2026-10-14 (PR #141, MCP 0.3.4)

### Alterado

- Consolidação por subsistema: sessão com fila única, revisão pelo projeto à vista e um dono de foco por fechamento.

## Etapas 1 a 7 e 2.x

- **Etapa 7 (PRs #117 a #120, MCP 0.3.2):** o foco nunca cai no `body` ao fechar diálogos.
- **Etapa 6 (PRs #108 a #114, MCP 0.3.2):** correções da primeira rodada de testes; recentes de pasta na tela inicial.
- **Etapa 5 (MCP 0.3.1):** pré-voo para uso real e guia do testador.
- **Etapa 4 (MCP 0.3.0, schema v8):** propostas de alteração com revisão.
- **Etapa 3b (schema v7):** referências de código nas especializações.
- **Etapa 3a:** servidor MCP (base).
- **Etapa 2.5 (schema v5):** trava (`locked`) de marcações e imagens.
- **Etapa 2.4:** privacidade garantida por CSP gerada no build.
- **Etapa 2.3:** redesign da interface (fases R1 a R9).
- **Etapas 2.1 e 2.2:** revisões técnicas, sem mudança de comportamento visível.
- **Etapas 1 e 2:** marcações retangulares, camadas, anotações chave-valor, `mapping.json` e especializações.
