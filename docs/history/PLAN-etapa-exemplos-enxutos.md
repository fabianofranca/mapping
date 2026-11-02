# Histórico — Etapa Exemplos enxutos (seção do antigo PLAN.md)

> Fases EX0 a EX4 concluídas no épico `epic/exemplos-enxutos` (EX0 no PR #272, EX1 no #274, EX2 no #275, EX3 nos #276 e #277, EX4 nos #278 e #289; o épico é o PR #273). Sem schema (v13), formato de especialização (`formatVersion` 9), de proposta (3) nem de componente (3) novos, e sem MCP novo (0.12.0): reorganização de exemplos, fixtures, roteiros e documentação, mais duas correções de produto vindas dos relatos do Cowork.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs, as rodadas do Cowork e o que ficou para depois.

---

## Etapa — Exemplos enxutos (épico `epic/exemplos-enxutos`)

- **Objetivo:** o dono decidiu (2026-11-01) que **todo recurso** dos formatos de especialização e de componente tenha um exemplo, usando **ao máximo as bibliotecas prontas** de `libraries/` (`notas`, `kotlin` e `material3-compose`). `examples/` guarda só o que elas não cobrem e não devem cobrir, os testes deixam de ler exemplos e passam a usar fixtures próprias, e um teste garante que nenhuma limpeza tire o último exemplo de um recurso. Replanejada na EX0 (2026-11-01) a partir da análise da primeira versão do plano.
- **Estado de partida:** `examples/libraries/` tem três pacotes: `material3` (15 tipos, gerado do laboratório por `scripts/buildLibraryExamples.mjs`), `analytics` (1 tipo) e `pessoas` (1 tipo). Varredura das chaves (EX0): o `material3` antigo é o único com a origem executável completa (`origins` com `booleans`, `background.values`, raízes com `anchor`, `margin` e `scrim`; `sources` com `slot`, `values` e `ignore`) e a tela de exemplo do sistema externo (`examples/settings.sdui.json` dentro do pacote); o resto dele a `material3-compose` já mostra. A `analytics` é a única com `appliesTo`. A `pessoas` não tem nada que a `material3-compose` não tenha (o tipo `image` tem o campo `url`). `examples/specs/biblioteca.json` é só o arquivo de um pacote (os arquivos que ele cita não vêm junto) e é o único exemplo de `migrations`. Os testes leem `examples/libraries/material3/` (ids `m3-*`, usados em mais de 30 arquivos), `examples/libraries/pessoas/` e `examples/specs/biblioteca.json`, e o projeto de exemplo (`examples/exemplo-completo/`, 21 anotações `m3-*`), o guia e o `proposta-componentes.zip` (R13) levam uma cópia do `material3` antigo.
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e sem MCP novo (a versão do servidor não muda). É uma reorganização de exemplos, fixtures, roteiros e documentação.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](../../CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                           |
| ---- | ----------- | ---------------------- | -------------------------------------------------------------------- |
| EX0  | Opus        | high                   | Sonnet medium (teste de cobertura)                                   |
| EX1  | Sonnet      | medium                 | Sonnet medium (pacote, componentes, documentos, roteiro); Haiku low  |
| EX2  | Sonnet      | medium                 | Sonnet medium (projeto de exemplo, guia, zip do R13); Haiku low      |
| EX3  | Sonnet      | medium                 | Sonnet medium (migração dos testes, roteiros, documentos); Haiku low |
| EX4  | Sonnet      | medium                 | Sonnet medium; Haiku low                                             |

### Decisões

1. **Três lugares, três papéis.**
   - `libraries/`: as bibliotecas reais, a primeira fonte de exemplo de qualquer recurso. Não mudam nesta etapa.
   - `examples/libraries/` e `examples/specs/`: só o que uma biblioteca real não deve ter. Ficam a `analytics` (`appliesTo`: tipo só de seta ou só de marcação), uma biblioteca **`sdui-backend`** nova (a origem executável: um sistema externo fictício que descreve telas) e as especializações de arquivo único `sdui.json` (`code` em várias plataformas, `allowedChildren`, `requiresOwner`) e `modelo-de-dados.json` (`formatVersion` 1, campo `date`). Saem a `material3` de 15 tipos, a `pessoas` e o `biblioteca.json`.
   - `tests/fixtures/`: o que os testes leem. Os testes não leem `examples/` nem `libraries/`, exceto os que conferem um exemplo distribuído (o projeto de exemplo, os zips, a validação de cada biblioteca e o teste de cobertura).
2. **Teste de cobertura (EX0), a guarda da etapa.** `tests/examples/featureCoverage.test.ts` deriva os recursos da especialização do `specSchema` (cada caminho de chave e cada valor de enum) e lista os do componente (tipos de nó, chaves, layout, dimensionamento, âncoras, operadores de expressão); cada um precisa aparecer em `libraries/`, `examples/libraries/` ou `examples/specs/`. As raízes que vão sair ficam em `LEAVING`, e o que só elas cobrem fica em `PENDING_AFTER_REMOVAL` (igualdade exata); um recurso sem exemplo nenhum fica em `MISSING_TODAY` e ganha exemplo na etapa. Ao fim da etapa, as três listas estão vazias, e um recurso novo no schema sem exemplo quebra o teste.
3. **A `sdui-backend` nasce da `material3` antiga, cortada** ao mínimo que zera o `PENDING_AFTER_REMOVAL` do lado da origem: um contêiner com slot (`sources.slot`), um botão (`values` e `ignore`), uma flutuante com `anchor` e `margin`, uma folha modal com o tipo do `scrim`, a origem com `booleans` e `background.values`, a tela de exemplo do sistema externo e as `migrations` (versão 2 com uma migração da 1), de 4 a 6 tipos, cada um com componente e documento, sem fontes. `id` `sdui-backend` (não colide com o `sdui` do `sdui.json`), nome "SDUI do backend". A `material3-compose` não ganha origem: uma biblioteca real não descreve o backend de ninguém.
4. **Os testes usam uma cópia congelada.** Os testes provam o motor, não o design system: `examples/libraries/material3/` vai para `tests/fixtures/material3/` e `examples/libraries/pessoas/` para `tests/fixtures/pessoas/` por `git mv`, com os mesmos ids (`m3-*`) e o mesmo conteúdo, sem mudar o que cada teste prova nem as contagens; o orçamento de desempenho continua medindo a mesma carga. `examples/specs/biblioteca.json` vai para `tests/fixtures/specs/`. A `material3-compose` não vira base de teste: ela muda a cada versão do androidx. O gerador (`scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts`, `npm run build:examples`) sai; o laboratório continua com os próprios exemplos (`lab/components/samplesMaterial3.ts`), que os testes do `lab/` e alguns do modelo importam como hoje (fora desta etapa).
5. **O que a pessoa vê usa a `material3-compose`.** O projeto de exemplo (`examples/exemplo-completo/specs/material3-compose/`, cópia conferida por teste como hoje, e o zip), o guia interativo e o `proposta-componentes.zip` (R13) trocam o `material3` antigo pela `material3-compose`; as anotações e as instâncias passam aos tipos e campos dela. O zip do projeto de exemplo cresce (a `material3-compose` tem 50 tipos e a Roboto); a EX2 confere e registra o tamanho.
6. **Roteiros:** o R3.10, o R3.12, o R3.14 a R3.17 (as cópias `mat-v3`, `mat-v4` e `mat-v5` com migrações), o R9, o R10, o R12.12 e o R13 passam à `material3-compose` (pasta ou `material3-compose.zip`); o R15 usa o tipo `image` dela (campo `url`); o R10 ganha os passos da origem (seção de origens do componente e a galeria com a tela de exemplo) na `sdui-backend`; o R12.19 continua com a `analytics`. Todo passo continua feito pelo agente sozinho (seção 8 do `docs/TESTING.md`).

7. **Guia dos exemplos:** `examples/README.md` diz, para cada biblioteca de `libraries/` e cada exemplo de `examples/`, o que é, como abrir, o que dá para ver e que roteiros o usam, e termina com a tabela "Onde ver cada recurso". `tests/examples/examplesReadme.test.ts` exige uma seção por exemplo no disco e nenhuma seção de exemplo que não existe; cada fase que cria, troca ou remove um exemplo atualiza o guia no mesmo PR.

8. **SDUI de produção fica fora desta etapa.** O dono decidiu (2026-11-01) fazer um SDUI de produção com Material 3 em Kotlin Multiplatform (contrato único, renderer em Compose Multiplatform para Android e iOS, BFF em Kotlin) num **repositório separado**; o que foi decidido está em [`docs/sdui/BRIEF-SDUI-KMP.md`](../sdui/BRIEF-SDUI-KMP.md). A biblioteca do Mapping que o descreve (`sdui-material3`, em `libraries/`) nasce depois que o contrato existir lá, porque o `code` e as `sources` precisam apontar para símbolos e chaves reais; quando nascer, ela pode substituir a `sdui-backend` como exemplo de origem. Até lá, a EX1 segue com a `sdui-backend` enxuta.

### Fora (de propósito)

- Alterar a `material3-compose`, as notas ou a Kotlin.
- Aceitar `minSize` de um eixo só ou qualquer outra mudança de formato.
- Dar a Roboto às bibliotecas de exemplo restantes (a `analytics` e a `sdui-backend` não usam fontes).
- Tirar dos testes do modelo e do canvas a importação dos exemplos do laboratório (`lab/components/samplesMaterial3.ts`).
- Cobertura de exemplos dos formatos do projeto (`mapping.json`) e da proposta: o projeto de exemplo e os zips de proposta continuam como são.

### Fases

#### EX0 — Replanejamento e teste de cobertura

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium. Decisões 1, 2 e 7.

- [x] Etapa replanejada neste `PLAN.md` (a primeira versão deixava sem dono os testes da `pessoas`, o `proposta-componentes.zip`, o R3.14 a R3.17 e os recursos da origem que o `biblioteca.json` não mostra)
- [x] `tests/examples/featureCoverage.test.ts` com `LEAVING`, `PENDING_AFTER_REMOVAL` e `MISSING_TODAY` (172 recursos de especialização, derivados do `specSchema`, e 131 de componente; a origem, que o schema não declara, e o componente, lido à mão, em listas conferidas contra o código)
- [x] Guia dos exemplos (`examples/README.md`, decisão 7) do estado de hoje, com o que sai marcado, e `tests/examples/examplesReadme.test.ts`
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX1 — Biblioteca `sdui-backend` e a origem no roteiro

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Decisões 1 a 3 e 6.

- [x] `examples/libraries/sdui-backend/` (decisão 3) validada por teste no molde de `tests/model/libraryExamples.test.ts`, sem erro nem aviso no Diagnóstico
- [x] Exemplos para os 39 recursos de `MISSING_TODAY` (passos de migração, colunas `date`/`number` e com `sources`, `linkedRef` em campo, `appliesTo: marking`, `containers[].background`, `fonts[].style`, `font.decoration`, `verticalAlign`, `fillRule` e outros; a lista está no teste), de preferência na `sdui-backend` ou na `analytics`; a lista fica vazia. O que não couber sem ferir o "Fora" (ex.: `fonts[].style` pede arquivo de fonte) vai para `EXCEPTIONS` com a justificativa e é levado ao dono no PR. **Feito:** 36 recursos ganharam exemplo na `sdui-backend` (6 tipos, 5 componentes) e `fonts[].style` (3 recursos, `fonts[].style`, `=italic`, `=normal`) foi para `EXCEPTIONS`: o exemplo pede um arquivo de fonte e a `sdui-backend` não leva fontes (sem ele o validador avisa); decisão do dono (2026-11-01): a fonte é fixa no cliente mobile, fora do SDUI, então fica como exceção
- [x] `PENDING_AFTER_REMOVAL` vazia (hoje 48 recursos: `origins` inteira, `sources` de tipo e de campo, `migrations`; a `sdui-backend` cobre o que só a `material3` antiga e o `biblioteca.json` mostravam)
- [x] R10 com os passos da origem na `sdui-backend` (a seção de origens e a galeria com a tela de exemplo); `docs/SPEC-FORMAT.md` e `libraries/README.md` apontam para ela como o exemplo de `origins`, `sources` e `migrations`; seção `examples/libraries/sdui-backend/` no guia dos exemplos e a tabela "Onde ver cada recurso" atualizada
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX2 — Exemplos distribuídos na `material3-compose`

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Decisão 5.

**Toca em:** `examples/exemplo-completo/` (troca `specs/material3/` por `specs/material3-compose/` e as 21 anotações `m3-*`), `tests/examples/exampleProject.test.ts`, `scripts/guia/template.html` e `public/guia/` (`npm run build:guia`), `examples/exemplo-completo.zip` (`npm run build:example`), `tests/e2e/proposedComponentsFixture.ts`, os e2e que o usam, `examples/proposta-componentes.zip` (`npm run build:proposal-components`), `tests/examples/proposalComponents.test.ts`, `src/i18n/specHelp.ts` (os exemplos da ajuda com ids `m3-*`), R13 do `docs/TESTING.md`.

- [x] Projeto de exemplo e zip com a `material3-compose` (a cópia conferida por teste) e o tamanho do zip registrado no PR (289.104 bytes, eram 64.988). Decisão do dono (2026-11-01): embutir o zip levaria o `dist/index.html` a 1.868.223 bytes, acima do orçamento de 1,5 MiB, então o botão **Abrir projeto de exemplo** e o zip embutido saíram (`src/app/exampleProject.ts`) e a app orienta a baixar `examples/exemplo-completo.zip` do repositório (Ajuda e guia); o orçamento fica em 1,5 MiB (1.482.050 bytes)
- [x] Guia interativo regenerado, com os textos falando dos tipos da `material3-compose`
- [x] `proposta-componentes.zip` com a `material3-compose` (inclusive o tipo que só existe no pacote da proposta) e o R13 reescrito
- [x] Ajuda da especialização (`specHelp.ts`) sem ids do pacote antigo, em pt-BR e en-US
- [x] Guia dos exemplos: seções do projeto de exemplo e do `proposta-componentes.zip` atualizadas
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX3 — Fixtures de teste, remoção e roteiros

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium (por grupo de testes), Haiku low (troca de caminhos). Decisões 4 e 6.

**Toca em:** os testes que leem os pacotes que saem: `tests/storage/packageFixture.ts`, `tests/components/libraryHarness.ts` (e quem o usa), `tests/components/SpecsDialog.test.tsx`, `tests/model/` (`catalog`, `componentArrange`, `componentCatalog`, `libraryPackage`, `libraryExamples`, `spec`, `specV4`), `tests/store/` (`componentLibrary`, `libraryPreview`, `sessionComponents`, `sessionPackage`), `tests/mcp/` (`library`, `libraryUpdate`, `containerComponents`), `tests/canvas/renderPerformance.test.ts`, `tests/app/` (`controller`, `library`), `tests/examples/pessoasLibrary.test.ts`, `tests/lab/viewer/remoteImages.test.ts`, `tests/e2e/` (`catalog`, `container`, `remoteImages`). Conferir com `grep -rn "examples/libraries/\(material3\|pessoas\)\|specs/biblioteca.json" tests scripts`.

- [x] `git mv` dos três para `tests/fixtures/` (decisão 4) e os testes apontando para lá, com os mesmos ids e contagens; `LEAVING` vazia no teste de cobertura; as seções dos três saem do guia dos exemplos e a tabela "Onde ver cada recurso" não os cita mais
- [x] Remover `scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts`, o script `build:examples` do `package.json` e do `CLAUDE.md`, e a menção em `lab/README.md`
- [x] Roteiros da decisão 6 reescritos (R3.10, R3.12, R3.14 a R3.17, R9, R10, R12.12, R15) e o preparo da seção 2; `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `docs/GUIDE.md`, `docs/COMPONENT-FORMAT.md`, `docs/SPEC-FORMAT.md`, `libraries/README.md` e a skill `spec-author` sem citar os pacotes removidos (`grep -rn "examples/libraries/\(material3\|pessoas\)\|specs/biblioteca.json"` fora de `docs/history/` volta vazio)
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

#### EX4 — Rodada do Cowork e fechamento

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low.

- [x] Rodada dirigida do Cowork (R3, R9, R10, R12, R13 e R15) e o relato entre os documentos da etapa ([`relato-2026-11-01-exemplos-enxutos.md`](relato-2026-11-01-exemplos-enxutos.md): 68 ✅, 4 🟡, 4 ⏭️, 2 achados de produto); achados corrigidos: A1 (Diagnóstico de imagem remota troca a razão no lugar) e os textos dos roteiros; A2 (`\n` no `url`) é Shift+Enter por desenho, o R15 passou a conferir no disco
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-exemplos-enxutos.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md`
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

## Decisões consolidadas dos PRs

- **EX0 (PR #272, replanejamento e guarda):** `tests/examples/featureCoverage.test.ts` deriva os recursos da especialização do `specSchema` (172) e lista os do componente (131); `LEAVING`, `PENDING_AFTER_REMOVAL` e `MISSING_TODAY` mostram o caminho até a lista vazia. Guia dos exemplos (`examples/README.md`) e `tests/examples/examplesReadme.test.ts`.
- **EX1 (PR #274, `sdui-backend`):**
  - `examples/libraries/sdui-backend/` (6 tipos, 5 componentes, sem fontes) cobre a origem executável, `sources` e `migrations`; 36 dos 39 recursos de `MISSING_TODAY` ganharam exemplo nela ou na `analytics`.
  - `fonts[].style`, `=italic` e `=normal` ficaram em `EXCEPTIONS`, por decisão do dono (2026-11-01): a fonte é fixa no cliente mobile, fora do SDUI, então a biblioteca de origem não leva arquivo de fonte. É a única exceção.
  - R10 com os passos da origem; `docs/SPEC-FORMAT.md` e `libraries/README.md` apontam para a `sdui-backend`.
- **EX2 (PR #275, o que a pessoa vê):**
  - Projeto de exemplo, guia, `proposta-componentes.zip`, ajuda da especialização (`specHelp.ts`) e R13 passaram à `material3-compose`; o zip do projeto de exemplo foi de 64.988 para 289.104 bytes.
  - Decisão do dono (2026-11-01): embutir o zip levaria o `dist/index.html` a 1.868.223 bytes, acima do orçamento de 1,5 MiB. O botão **Abrir projeto de exemplo** e o zip embutido saíram (`src/app/exampleProject.ts`); a Ajuda e o guia orientam a baixar `examples/exemplo-completo.zip` do repositório. O orçamento ficou em 1,5 MiB (1.482.050 bytes).
- **EX3 (PRs #276 e #277, fixtures, remoção e roteiros):**
  - `git mv` de `examples/libraries/material3/`, `examples/libraries/pessoas/` e `examples/specs/biblioteca.json` para `tests/fixtures/`, com os mesmos ids (`m3-*`) e contagens; os testes deixaram de ler `examples/` e `libraries/`, salvo os que conferem um exemplo distribuído.
  - Saíram o gerador (`scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts`, `npm run build:examples`); `LEAVING` e `PENDING_AFTER_REMOVAL` ficaram vazias.
  - Roteiros R3.10, R3.12, R3.14 a R3.17, R9, R10, R12.12 e R15 reescritos para a `material3-compose`; documentos e a skill `spec-author` sem citar os pacotes removidos.
- **EX4 (PRs #278 e #289, rodadas e fechamento):**
  - Duas correções de produto vindas dos relatos: o Diagnóstico › Imagens remotas troca a razão da mesma URL no lugar (`src/store/diagnostics.ts`), e o editor de texto de várias linhas tira a quebra de linha do fim ao gravar, para a `url` de uma imagem não ir ao `mapping.json` com `\n` (`src/ui/FieldEditors.tsx`).
  - O R8.1b passou a abrir a própria cópia da Loja pelo `proposta-exemplo.zip` e deixou de depender do R4; textos de vários roteiros (R9, R10, R13, R15) corrigidos pelos relatos.
- **Fechamento:** histórico (este arquivo), `PLAN.md` com a etapa como ponteiro, `CHANGELOG.md`, `docs/ROADMAP.md` e `CLAUDE.md` atualizados. Sem MCP novo: continua o 0.12.0.

## Rodada do Cowork

- **1ª, dirigida (R3, R9, R10, R12, R13 e R15, depois do R0 e do R1), no preview do épico, build `36f7215 · 2026-11-02`:** 68 ✅, 4 🟡, 4 ⏭️. Dois achados de produto: A1 (Diagnóstico de imagem remota sem trocar a razão), corrigido, e A2 (`\n` no fim do `url`), que na hora foi lido como Shift+Enter por desenho e o R15 passou a conferir no disco; o resto foi texto de roteiro. Relato em [`relato-2026-11-01-exemplos-enxutos.md`](relato-2026-11-01-exemplos-enxutos.md).
- **2ª, reteste curto (R15.1 a R15.12, R9.6, R9.7, R10.7 e R8.1b opcional, depois do R0), build `2eb2da0 · 2026-11-02`:** 30 ✅, 0 ❌, 1 não executado (R8.1b, precisa do dono). A correção do Diagnóstico funcionou (a mesma linha vai de "origem sem permissão" a "não carregou", sem duplicar). Achado médio: num campo que já virou de várias linhas (mais de 60 caracteres, o caso de toda URL `https`), o Enter grava `\n` no fim do `url`; corrigido ao gravar. Mais 5 achados baixos, todos de texto de roteiro. Relato em [`relato-2026-11-02-exemplos-enxutos-reteste.md`](relato-2026-11-02-exemplos-enxutos-reteste.md).

## O que ficou para depois

- O SDUI de produção em Kotlin Multiplatform é outro repositório ([`BRIEF-SDUI-KMP.md`](../sdui/BRIEF-SDUI-KMP.md)). A biblioteca `sdui-material3` nasce quando o contrato existir lá e pode substituir a `sdui-backend` como exemplo de origem.
- No painel Detalhes do Row, barra de rolagem horizontal e seletor "Alinhamento vertical" cortado (observação do reteste).
- O foco que cai no `body` e a troca por `TEXTAREA` ao confirmar texto longo no editor de campo.
- O orçamento de 1,5 MiB do `dist/index.html`, que hoje impede embutir o projeto de exemplo.
