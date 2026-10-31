# Histórico — Etapa Sugestões no campo de texto (seção do antigo PLAN.md)

> Fases SG1 e SG2 concluídas no épico `epic/sugestoes-campo` (plano no PR #246, SG1 no #248, SG2 no #249, correções da rodada do Cowork no #250 e fechamento num PR sem número; o épico é o PR #247). Origem: pedido do dono em 2026-10-28. Especialização `formatVersion` 8 (`suggestions` e `linkedRef`) e MCP 0.10.0; sem schema novo do `mapping.json` (continua v13), formato de proposta (3) nem de componente (2) novos.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois.

---

## Etapa — Sugestões no campo de texto (épico `epic/sugestoes-campo`)

- **Objetivo:** o dono pediu (2026-10-28) facilitar o preenchimento do **Tipo** na biblioteca Kotlin (`libraries/kotlin/`). Hoje Propriedades › Tipo, Funções › Retorno e Supertipos › Tipo são campos `string` livres nos onze tipos de declaração, sem nenhuma opção; nem os tipos básicos do Kotlin (`Int`, `String`, `Boolean`) aparecem. `enum` não serve, porque trava o valor e o tipo precisa aceitar `String?` e `List<Endereco>`.
- **O que muda:** especialização `formatVersion` 8 (`suggestions` e `linkedRef` em campos e colunas `string`) e MCP 0.10.0. **Sem** schema novo do `mapping.json` (continua v13), formato de proposta (3) nem de componente (2) novos: os valores gravados continuam texto e `ref` comuns. Uma proposta pode trazer um pacote v8 porque a validação é a mesma da app.
- **Genérico:** nada de Kotlin no núcleo; a lista vem da especialização e serve a qualquer linguagem ou vocabulário.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                         |
| ---- | ----------- | ---------------------- | ---------------------------------- |
| SG1  | Opus        | medium                 | Sonnet medium; mecânicos Haiku low |
| SG2  | Sonnet      | high                   | Sonnet medium; mecânicos Haiku low |

### Decisões

1. **`suggestions`** (a partir da `formatVersion` 8): só em campo `string` ou coluna `string` de `table`. Lista não vazia (até 200 itens) de textos únicos, não vazios e sem espaço nas pontas. Erro em outro tipo de campo ou em `formatVersion` anterior. **Não restringe o valor:** qualquer texto continua aceito; texto fora da lista não é pendência nem aviso. Um `default`, se houver, não precisa estar na lista.
2. **`linkedRef`** (a partir da `formatVersion` 8): no mesmo lugar (campo ou coluna `string`); é a chave de um campo `ref` do mesmo tipo (no campo) ou de uma coluna `ref` da mesma `table` (na coluna). Erro se a chave não existir, não for `ref` ou estiver em versão anterior. Efeito: a lista de sugestões ganha os rótulos dos alvos que esse `ref` aceita (os mesmos candidatos que o editor do `ref` oferece), cada um com o nome do tipo do alvo como texto secundário; os alvos do projeto vêm antes das sugestões fixas.
3. **Interação (genérica):** o campo vira um combobox (ARIA `combobox` e `listbox`): `TextField` de `src/ui/controls/` ganha a propriedade de sugestões (nada de controle avulso), com a lista no `Popover` existente e só tokens. Completa a **palavra sob o cursor**: a sequência de letras, dígitos, `_` e `.` imediatamente antes do cursor. A lista filtra sem diferenciar maiúsculas, quem começa com a palavra antes de quem só a contém, até 8 visíveis com rolagem; sem correspondência, fica fechada. Abre ao digitar uma palavra que tenha correspondência, com ↓ ou Ctrl+Espaço, ou com um clique no campo vazio (com a palavra vazia mostra tudo). ↑/↓ navegam, Enter ou clique escolhem, Esc fecha sem mudar nada (o Esc seguinte segue a regra atual do campo), Tab fecha e mantém o texto digitado. **Escolher troca só a palavra sob o cursor pela sugestão, põe o cursor depois dela e mantém o campo em edição** (não grava): o próximo Enter ou sair do campo grava, como hoje (`CommitInput`). Assim `String` + `?` vira `String?` e `List<Usu` + escolha vira `List<Usuario`. Somente leitura ou desabilitado: sem lista. A filtragem e a troca da palavra são funções puras fora do componente, em `src/ui/` (não no `src/model/`, que é do MCP também), com teste.
4. **Escolher um alvo do `linkedRef`:** além do texto, o campo guarda o alvo escolhido e, ao confirmar (Enter ou sair do campo), grava o texto e o `ref` juntos, numa entrada só do desfazer, desde que o rótulo do alvo ainda apareça como palavra no texto confirmado. O Esc que cancela a edição descarta os dois. Digitar o nome à mão sem escolher não mexe no `ref`; apagar o texto não limpa o `ref` (ele tem o próprio botão de limpar). Um `ref` já preenchido com outro alvo é trocado (a escolha é explícita).
5. **Onde aparece:** em todo editor de campo e célula `string`: Detalhes (`SimpleEditor`/`StringEditor` em `src/ui/FieldEditors.tsx`), células de tabela (`src/ui/TableField.tsx`) e o formulário do Catálogo (`src/ui/TypedForm.tsx`). Na revisão (somente leitura), nada.
6. **Biblioteca Kotlin** passa a `version` 2 e `formatVersion` 8, sem migrações. Propriedades › Tipo (inclusive na `annotation-class`): `suggestions` com a lista fixa e `linkedRef: "typeRef"`. Funções › Retorno: só a lista fixa (não há coluna `ref` ali; não se cria uma nesta etapa). Supertipos › Tipo: só `linkedRef: "typeRef"`. Lista fixa, nesta ordem: `String`, `Int`, `Long`, `Boolean`, `Double`, `Float`, `Short`, `Byte`, `Char`, `UInt`, `ULong`, `UShort`, `UByte`, `Any`, `Unit`, `Nothing`, `List`, `MutableList`, `Set`, `MutableSet`, `Map`, `MutableMap`, `Array`, `Pair`. As descrições das colunas e os documentos em `libraries/kotlin/docs/` que falam do Tipo citam as sugestões.
7. **Contrato de versão** (`src/model/specVersions.ts`): incluir, mudar ou tirar `suggestions` ou `linkedRef` é compatível e não pede migração; a fase confere que um pacote pode passar da `formatVersion` 7 à 8 entre versões e, se não puder, ajusta e registra.
8. **MCP 0.10.0** (bump em `mcp/version.ts` na SG1, uma versão só no épico): `get_specialization` já devolve os dois campos (é o JSON); `validate_specialization` e `validate_library` aceitam a v8 com os mesmos erros da app; nenhuma tool nova. `docs/AGENT-GUIDE.md`: `suggestions` é o vocabulário preferido (escrever exatamente como na lista quando couber), não uma restrição; com `linkedRef`, quando o texto nomeia um alvo mapeado, preencher também o `ref`. A skill `spec-author` explica quando usar `suggestions` (vocabulário aberto), `enum` (fechado) e `linkedRef` (texto com o `ref` ao lado). A descrição em `mcp/docs.ts` que diz "formatVersion 1 a 4" passa a "1 a 8".
9. **Roteiro R14** (`docs/TESTING.md`, seção 8, feito pelo agente sozinho) com o projeto `examples/sugestoes-kotlin.zip`: a biblioteca Kotlin aplicada e duas data classes (`Usuario`, `Endereco`), gerado por script e conferido por teste, do mesmo jeito que o `examples/proposta-componentes.zip` (`scripts/proposalComponents.mjs`).
10. **Fica fora:** sugestões tiradas dos valores já usados no projeto; sugestões em `number`; campo de vários valores (Modificadores separados por espaço); coluna `ref` nova em Funções › Retorno ou Parâmetros; aceitar a sugestão com Tab; trecho com cursor no meio (`List<|>`).

### Fases

#### SG1 — `suggestions` no formato e o campo com sugestões

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:** `src/model/spec.ts`, `docs/spec.schema.json`, `src/model/specVersions.ts`, `src/ui/controls/TextField.tsx` (e o CSS dele), função pura nova em `src/ui/`, `src/ui/FieldEditors.tsx`, `src/ui/TableField.tsx`, `src/ui/TypedForm.tsx`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `libraries/kotlin/`, `scripts/` e `examples/sugestoes-kotlin.zip`, `mcp/version.ts`, `mcp/docs.ts`, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, `docs/MCP.md`, `.claude/skills/spec-author/`, `tests/model/`, `tests/ui/`, `tests/components/`, `tests/mcp/`, `docs/TESTING.md` (R14), `PLAN.md`.

- [x] `formatVersion` 8 e `suggestions` no validador e no JSON Schema (decisão 1); erro em versão anterior e fora de `string` (testes)
- [x] Contrato de versão: `suggestions` não pede migração (decisão 7, teste)
- [x] Filtragem e troca da palavra sob o cursor como funções puras (decisão 3, testes)
- [x] `TextField` com sugestões: teclado, clique, ARIA, somente leitura (decisão 3, teste de componente)
- [x] Sugestões nos editores de campo, de célula e do Catálogo (decisão 5, teste de componente)
- [x] Biblioteca Kotlin `version` 2 com a lista fixa, ainda sem `linkedRef` (decisão 6); `validateLibrary` sem erros (`tests/model/kotlinLibrary.test.ts`)
- [x] MCP 0.10.0 e documentação: validação da v8, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, skill `spec-author`, `mcp/docs.ts` (decisão 8)
- [x] `examples/sugestoes-kotlin.zip` e roteiro R14 com os passos da lista fixa (decisão 9)

#### SG2 — `linkedRef`: os alvos mapeados na lista

**Coordenador:** Sonnet. **Esforço:** high; subagentes Sonnet medium; mecânicos Haiku low. Última fase do épico: o PR leva o rótulo `mcp-rc`.

**Toca em:** `src/model/spec.ts`, `docs/spec.schema.json`, `src/model/specVersions.ts`, `src/store/` (a action que grava texto e `ref` numa entrada: a que já grava células, se aceitar várias; senão uma nova), `src/ui/controls/TextField.tsx`, `src/ui/FieldEditors.tsx`, `src/ui/TableField.tsx`, `src/ui/TypedForm.tsx`, `libraries/kotlin/`, `examples/sugestoes-kotlin.zip`, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, `.claude/skills/spec-author/`, testes, `docs/TESTING.md` (R14), `PLAN.md`.

- [x] `linkedRef` no validador e no JSON Schema (decisão 2, testes); contrato de versão (decisão 7)
- [x] Os alvos do `ref` na lista, com o tipo como texto secundário e antes das fixas (decisão 2, teste de componente)
- [x] Escolher um alvo grava texto e `ref` juntos, numa entrada do desfazer; Esc descarta; digitar à mão não mexe no `ref` (decisão 4, testes de store e de componente)
- [x] Biblioteca Kotlin com `linkedRef: "typeRef"` em Propriedades › Tipo e Supertipos › Tipo (decisão 6)
- [x] Documentação: `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, skill `spec-author`
- [x] Roteiro R14 com os passos do alvo mapeado
- [x] Rodada dirigida do Cowork (R0 e R14; [`relato-2026-10-29-sugestoes-campo.md`](docs/history/relato-2026-10-29-sugestoes-campo.md)): 24 ✅ e 2 achados baixos; o 1 era o texto do R14.19 (apagar o texto não abre a lista, por decisão) e o 2, barra horizontal no Detalhes a ~919 px por um invólucro sem classe no `StringEditor`, corrigido em `details.css`
- [x] Fechamento: histórico em `docs/history/PLAN-etapa-sugestoes-campo.md`, `CLAUDE.md` e `docs/ROADMAP.md`

---

## Decisões consolidadas dos PRs

- **SG0 (PR #246, o plano):** o campo de texto livre ganha sugestões sem virar `enum` (que travaria `String?` e `List<Endereco>`); a lista vem da especialização (nada de Kotlin no núcleo); a SG1 entrega o formato e o combobox e a SG2 liga os alvos mapeados pelo `linkedRef`. Coordenadores: SG1 Opus medium e SG2 Sonnet high; o rótulo `mcp-rc` fica no PR da última fase.
- **SG1 (PR #248, `suggestions` e o combobox):**
  - `suggestions` na `formatVersion` 8, em campo e coluna `string`: lista não vazia, até 200 textos únicos, não vazios e sem espaço nas pontas; erro em outro tipo e antes da v8, no caminho exato. Não restringe o valor, não vira pendência nem aviso, e o `default` pode ficar fora da lista. Incluir, mudar ou tirar `suggestions` não é quebra no contrato de versão.
  - O combobox mora no `CommitInput` (`TextField` só repassa a propriedade), com a lista no `Popover` e as funções puras (palavra sob o cursor, filtragem, troca da palavra) em `src/ui/suggestions.ts`. A abertura automática ao digitar não oferece a lista quando a única correspondência é idêntica à palavra; a explícita (↓, Ctrl+Espaço, clique no campo vazio) a mantém. Só as teclas sem modificador navegam a lista (Alt+Shift+↑/↓ e Alt+Enter seguem a tabela). O campo de várias linhas (`StringEditor` em modo `TextArea`) não tem sugestões.
  - Biblioteca Kotlin na `version` 2 com a lista fixa de 24 tipos em Propriedades › Tipo e Funções › Retorno; MCP 0.10.0 (bump na SG1, uma versão só no épico); `examples/sugestoes-kotlin.zip` (`npm run build:suggestions-kotlin`, conferido por `tests/examples/suggestionsKotlin.test.ts`) e roteiro R14.1 a R14.13.
- **SG2 (PR #249, `linkedRef`):**
  - O texto que entra no campo é o **nome da declaração** do alvo (`refTargetText` em `src/model/refs.ts`: o valor do campo, a coluna `rowLabel` da linha ou a `key` da tupla livre), e não o rótulo "Dono.Campo" do editor do `ref`; é o que faz `List<Usu` + escolha virar `List<Usuario`. Alvo sem texto fica fora da lista; o texto secundário é o nome do tipo do alvo (tupla livre: "livre"). Sugestão fixa de rótulo igual ao de um alvo é descartada (o alvo vence).
  - Validação (`checkField` ganhou o mapa de irmãos): `linkedRef` só em campo ou coluna `string`, na `formatVersion` 8, apontando para um campo `ref` do mesmo tipo ou uma coluna `ref` da mesma `table` (a coluna pode vir depois). Compatível no contrato de versão, sem migração.
  - Gravação junta: `setFieldValues` e `setTableCells` no modelo e no store (uma entrada no desfazer, com as mesmas validações de `setFieldValue` e `setTableCell`, que passaram a delegar a elas; se um valor falha, nada é gravado). O `CommitInput` guarda os itens escolhidos (`SuggestionItem.id`), e ao confirmar o último cujo rótulo ainda é palavra do texto (`containsWord`) leva o `ref` junto (`onCommit(texto, escolhido)`); o conjunto zera ao confirmar, no Esc e quando o valor externo muda. O Esc também reverte uma escolha pendente com o texto igual ao valor atual. Se o `id` escolhido não resolve mais para um alvo, grava só o texto. As opções da lista usam o índice como `key`.
  - Onde: Detalhes (campo e célula de tabela, `linkedCell` no `TableEditor` ao lado de `renderRefCell`). O Catálogo e a revisão não têm projeto: só as fixas.
  - Biblioteca Kotlin: `linkedRef: "typeRef"` em Propriedades › Tipo (11 tipos) e Supertipos › Tipo (10 tipos; a `annotation-class` não tem a tabela); Funções › Retorno continua só com a lista fixa. Roteiro R14.14 a R14.19.
- **SG2b (PR #250, achados da rodada do Cowork):**
  - O achado 1 (a lista não reabre ao apagar o texto) era o texto do R14.19: pela decisão 3, a lista abre ao digitar uma palavra com correspondência, com ↓, com Ctrl+Espaço ou com clique no campo vazio, e apagar não abre. Roteiro corrigido, sem mudança na app.
  - O achado 2 (barra horizontal de 6 px no Detalhes a ~919 px) vinha do invólucro sem classe do `StringEditor`, que fazia `.props-value > .input` deixar de valer: o `<input>` ficava com 220 px numa coluna de 137 px. A regra passou a cobrir `.props-value > .string-editor > .input` (teste de CSS em `tests/theme/controls.test.ts`). O defeito já existia antes da etapa; só a passada visual o pegou.
  - Observações levadas ao roteiro R14: `Ctrl+Z` com o foco no campo é o desfazer de texto do navegador (tirar o foco antes); o Tipo mapeado preenchido mostra `Endereco.Nome`; o indicador "Salvando" é passageiro; o R14.10 e o R14.11 desfazem as linhas que adicionam para o **Desfazer** voltar a ficar desabilitado; o Retorno saiu do R14.14.
- **Fechamento:** histórico (este arquivo), `PLAN.md` sem a etapa, `docs/ROADMAP.md` e `CLAUDE.md` atualizados. O MCP 0.10.0 estável (`mcp-v0.10.0`) é tag do dono depois do merge do épico na `main`.

## Rodada do Cowork

Dirigida (R0 e R14.1 a R14.19, passada visual do Detalhes), no preview do PR do épico, build `f034a3a · 2026-10-29`: 26 passos, 24 ✅, 2 ❌, 0 não executados; 2 achados baixos, sem regressão, ambos tratados no PR #250. Relato em [`relato-2026-10-29-sugestoes-campo.md`](relato-2026-10-29-sugestoes-campo.md).

## O que ficou para depois

- Sugestões tiradas dos valores já usados no projeto; sugestões em `number`; campo de vários valores (Modificadores separados por espaço); coluna `ref` nova em Funções › Retorno ou Parâmetros; aceitar a sugestão com Tab; trecho com cursor no meio (`List<|>`).
- Abrir a lista ao apagar o texto de um campo com sugestões (hoje só ao digitar uma palavra com correspondência, ↓, Ctrl+Espaço ou clique no campo vazio).
- Alvo `linkedRef` no Catálogo (sem projeto) e na revisão (somente leitura): hoje só as sugestões fixas.
- Tupla livre como alvo: o texto inserido é a `key` da tupla; se a regra se mostrar fraca no uso, é só ajustar `refTargetText`.
- O `Ctrl+Espaço` num campo de texto sem sugestões insere um espaço (comportamento do navegador).
- A suíte e2e do Playwright não foi rodada localmente nas fases (só no CI); os orçamentos de desempenho do canvas falham às vezes no `npm test` completo em máquinas carregadas e passam isolados (`npm run test:perf`).
