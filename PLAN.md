# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje a etapa **Sugestões no campo de texto**, épico `epic/sugestoes-campo`, detalhada e ainda não iniciada; a **Marcação pai**, épico `epic/marcacao-pai`, aguarda o fechamento; a Proposto com componentes foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0) está concluída: o objeto de topo do canvas passou a se chamar container (interface, MCP, propostas e `mapping.json`, com `containers` e `containerId`) e os presets de dispositivo saíram do núcleo para a especialização (histórico em [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md)). A etapa **Marcações espaciais, notas e setas** (épico `epic/marcacoes-espaciais`, fases ME0 a ME5; schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3 e MCP 0.9.0 ao fim) está concluída (PRs #208 a #211, #214 e o da ME5): marcações que pertencem ao canvas e envolvem containers, pertencimento resolvido pela geometria e gravado, seleção múltipla e arrasto conjunto, biblioteca de notas embutida, setas como marcações que apontam e tabelas flutuantes, tudo exposto pelo MCP 0.9.0 (histórico em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md)). A etapa **Proposto com componentes** (épico `epic/proposto-componentes`, fases PC1 e PC2; sem schema, formato de proposta nem MCP novos) está concluída: a visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, e a criação rejeitada vira só o fantasma pontilhado nas duas visões (histórico em [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md)). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v13)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 7 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
| [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md)   | Formato do arquivo de componente (`mapping-component`): nós, dimensionamento, expressões, avisos do motor |
| [`docs/component.schema.json`](docs/component.schema.json) | JSON Schema do arquivo de componente (documentação; o código é a fonte da verdade) |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 retirada do roadmap) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/history/PLAN-etapa-5.md`](docs/history/PLAN-etapa-5.md) | Histórico: etapa 5, pré-voo para uso real (fases 5.1 a 5.9 concluídas; decisões consolidadas dos PRs; prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-6.md`](docs/history/PLAN-etapa-6.md) | Histórico: etapa 6, correções da primeira rodada de testes (fases 6.1 a 6.7 concluídas; decisões consolidadas dos PRs; relato da rodada 1 e prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-7.md`](docs/history/PLAN-etapa-7.md) | Histórico: etapa 7, correções da rodada dirigida (fases 7.1 a 7.4 concluídas; decisões consolidadas dos PRs; relato da rodada 2 e prompt do coordenador ao lado) |
| [`docs/history/PLAN-etapa-8.md`](docs/history/PLAN-etapa-8.md) | Histórico: etapa 8, consolidação por subsistema (fases 8.1 a 8.7 concluídas; decisões consolidadas dos PRs, auditoria e portão; ao lado, as notas de desenho em `docs/history/etapa-8-notas/`, a segunda leitura `auditoria-etapa-8.md` e o prompt do coordenador) |
| [`docs/history/PLAN-etapa-9.md`](docs/history/PLAN-etapa-9.md) | Histórico: etapa 9, ajustes do teste manual avançado (fases 9.1 a 9.7 concluídas; decisões consolidadas dos PRs; schema v9 e MCP 0.4.0) |
| [`docs/history/PLAN-etapa-10.md`](docs/history/PLAN-etapa-10.md) | Histórico: etapa 10, correções da rodada dirigida da etapa 9 (fases 10.1 e 10.2 concluídas; decisões consolidadas dos PRs #154 e #155 e do fechamento) |
| [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md) | Histórico: laboratório de componentes, fases L1 e L2 concluídas; decisões registradas que a etapa Biblioteca herda |
| [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md) | Histórico: etapa Biblioteca, fases B1 a B5 e Fechamento concluídas; decisões consolidadas dos PRs, rodada do Cowork do Fechamento (e reteste) e o que ficou para depois |
| [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md) | Histórico: etapa Código de instanciação, fases C1 a C4 concluídas; decisões consolidadas dos PRs, rodada do Cowork e reteste, e o que ficou para depois |
| [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md) | Histórico: etapa Canvas limpo, fases V1 e V2 concluídas; decisões consolidadas dos PRs |
| [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md) | Histórico: etapa Container, fases CN1 e CN2 concluídas; decisões consolidadas dos PRs e o que ficou para depois |
| [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md) | Histórico: etapa Marcações espaciais, notas e setas, fases ME0 a ME5 concluídas; decisões, regras de contenção, decisões consolidadas dos PRs, a cascata noturna e o que ficou para depois |
| [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md) | Histórico: etapa Proposto com componentes, fases PC1 e PC2 concluídas; decisões consolidadas dos PRs, rodada do Cowork e o que ficou para depois |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/relato-2026-10-20-instanciacao.md`](docs/history/relato-2026-10-20-instanciacao.md) | Relato da rodada dirigida do Cowork sobre o build `dee8666` (etapa Código de instanciação): 54 ✅, 1 ❌ (R3.6a) |
| [`docs/history/relato-2026-10-20-instanciacao-reteste.md`](docs/history/relato-2026-10-20-instanciacao-reteste.md) | Reteste do R3.6a no Claude Code com a `mcp-v0.6.0-rc.2`: passou |
| [`docs/history/relato-2026-10-21-recorte-url.md`](docs/history/relato-2026-10-21-recorte-url.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/recorte-url` (build `564b1e7`, MCP 0.7.0-rc.1): 35 ✅, nenhum achado |
| [`docs/history/relato-2026-10-24-proposto-componentes.md`](docs/history/relato-2026-10-24-proposto-componentes.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/proposto-componentes` (build `70cc7ee`): 29 ✅, 4 ⚠️, achados corrigidos no fechamento |
| [`docs/history/relato-2026-10-26-selecao-pelo-nome.md`](docs/history/relato-2026-10-26-selecao-pelo-nome.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/selecao-pelo-nome` (build `678f941`, R0 e R1.1 a R1.6a): 13 ✅, nenhum achado |
| [`docs/history/relato-2026-10-28-marcacao-pai.md`](docs/history/relato-2026-10-28-marcacao-pai.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/marcacao-pai` (build `5d7ac40`): 19 ✅, 1 achado baixo (texto cortado sem dica), corrigido no MP1b |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapas Container, Marcações espaciais, notas e setas e Proposto com componentes concluídas), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

---

## Etapa — Sugestões no campo de texto (detalhada, épico `epic/sugestoes-campo`)

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

- [ ] `formatVersion` 8 e `suggestions` no validador e no JSON Schema (decisão 1); erro em versão anterior e fora de `string` (testes)
- [ ] Contrato de versão: `suggestions` não pede migração (decisão 7, teste)
- [ ] Filtragem e troca da palavra sob o cursor como funções puras (decisão 3, testes)
- [ ] `TextField` com sugestões: teclado, clique, ARIA, somente leitura (decisão 3, teste de componente)
- [ ] Sugestões nos editores de campo, de célula e do Catálogo (decisão 5, teste de componente)
- [ ] Biblioteca Kotlin `version` 2 com a lista fixa, ainda sem `linkedRef` (decisão 6); `validateLibrary` sem erros (`tests/model/kotlinLibrary.test.ts`)
- [ ] MCP 0.10.0 e documentação: validação da v8, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, skill `spec-author`, `mcp/docs.ts` (decisão 8)
- [ ] `examples/sugestoes-kotlin.zip` e roteiro R14 com os passos da lista fixa (decisão 9)

#### SG2 — `linkedRef`: os alvos mapeados na lista

**Coordenador:** Sonnet. **Esforço:** high; subagentes Sonnet medium; mecânicos Haiku low. Última fase do épico: o PR leva o rótulo `mcp-rc`.

**Toca em:** `src/model/spec.ts`, `docs/spec.schema.json`, `src/model/specVersions.ts`, `src/store/` (a action que grava texto e `ref` numa entrada: a que já grava células, se aceitar várias; senão uma nova), `src/ui/controls/TextField.tsx`, `src/ui/FieldEditors.tsx`, `src/ui/TableField.tsx`, `src/ui/TypedForm.tsx`, `libraries/kotlin/`, `examples/sugestoes-kotlin.zip`, `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, `.claude/skills/spec-author/`, testes, `docs/TESTING.md` (R14), `PLAN.md`.

- [ ] `linkedRef` no validador e no JSON Schema (decisão 2, testes); contrato de versão (decisão 7)
- [ ] Os alvos do `ref` na lista, com o tipo como texto secundário e antes das fixas (decisão 2, teste de componente)
- [ ] Escolher um alvo grava texto e `ref` juntos, numa entrada do desfazer; Esc descarta; digitar à mão não mexe no `ref` (decisão 4, testes de store e de componente)
- [ ] Biblioteca Kotlin com `linkedRef: "typeRef"` em Propriedades › Tipo e Supertipos › Tipo (decisão 6)
- [ ] Documentação: `docs/SPEC-FORMAT.md`, `docs/AGENT-GUIDE.md`, skill `spec-author`
- [ ] Roteiro R14 com os passos do alvo mapeado
- [ ] Rodada dirigida do Cowork (R0 e R14) e correção dos achados
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-sugestoes-campo.md`, `CLAUDE.md` e `docs/ROADMAP.md` (quando o dono decidir mesclar o épico)

---

## Etapa — Marcação pai (em andamento, épico `epic/marcacao-pai`)

- **Objetivo:** o dono pediu (2026-10-27) poder selecionar várias marcações e, com um botão, criar uma marcação **pai** que envolva todas. Hoje é preciso desenhar à mão um retângulo em volta delas.
- **Sem schema, formato de proposta, especialização nem MCP novos.** É uma operação nova do modelo que cria uma marcação comum; o pertencimento continua saindo só da geometria (`settleHierarchy`). O agente pelo MCP já faz o mesmo com `create_marking`.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                         |
| ---- | ----------- | ---------------------- | ---------------------------------- |
| MP1  | Opus        | medium                 | Sonnet medium; mecânicos Haiku low |

### Decisões

1. **Onde aparece:** botão **Envolver** no resumo da seleção múltipla (Detalhes), ao lado de Trancar, Destrancar e Excluir. Desabilitado no somente leitura e quando nada da seleção pode ser envolvido.
2. **O que entra:** marcações não flutuantes e containers. Setas e notas (marcações flutuantes) ficam fora do pertencimento, então são ignoradas; se só houver elas, o botão fica desabilitado, com a dica.
3. **Espaço da nova:** se tudo o que entra são marcações do mesmo container, a nova é desse container (pixels dele). Senão (alguma marcação do canvas, algum container, ou containers diferentes), é do canvas, com o retângulo em unidades do canvas arredondado para fora (inteiros); aí a marcação de um container conta pelo **container inteiro**, porque só o container pode ser filho de uma marcação do canvas.
4. **Retângulo:** o retângulo que envolve tudo, com uma **margem de 8 px** (`MIN_MARKING_SIZE`) de cada lado, limitada ao container (quando é do container) e ao **pai atual** do conjunto (a menor marcação do mesmo espaço, fora da seleção e dos descendentes dela, que contém o retângulo sem margem). Assim a nova nunca tira o conjunto de dentro do pai que ele já tinha.
5. **Pertencimento:** o modelo não escolhe pai; só cria e assenta. A nova entra no array **antes da primeira marcação selecionada**, para ganhar o desempate de área igual (quando uma das selecionadas já envolve as outras ou encosta no limite); se o retângulo final for igual ao do pai atual e o pai vier depois, ela entra logo depois dele. Marcações não selecionadas que caem dentro do retângulo também passam a ser filhas (é a geometria).
6. **Depois:** uma entrada no desfazer; a nova fica selecionada sozinha, sem nome (o rótulo padrão), sem anotações. A trava não impede: nenhuma geometria existente muda, só o `parentId`.

### Fases

#### MP1 — Envolver a seleção numa marcação pai

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:** `src/model/multiSelection.ts` (ou arquivo novo em `src/model/`), `src/model/index.ts`, `src/store/project.ts`, `src/ui/MultiSelectionPanel.tsx`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `tests/model/`, `tests/store/itemsActions.test.ts`, `tests/components/multiSelection.test.tsx`, `docs/TESTING.md` (R12), `PLAN.md`.

- [x] Operação pura `wrapItems` e `canWrapItems` no modelo, com as decisões 2 a 5 (testes: mesmo container, canvas com containers, containers diferentes, margem limitada pelo container e pelo pai atual, empate com uma selecionada que já envolve as outras, só setas e notas, não selecionada que cai dentro)
- [x] Action `wrapItems` no store, uma entrada no desfazer, devolve o id (teste)
- [x] Botão **Envolver** no resumo da seleção múltipla, com a nova selecionada depois e a dica quando desabilitado; textos em pt-BR e en-US (teste de componente)
- [x] Roteiro R12 com o passo novo, feito pelo agente sozinho (seção 8 do `docs/TESTING.md`)
- [x] Rodada dirigida do Cowork (R0 e R12.1 a R12.11a; [`relato-2026-10-28-marcacao-pai.md`](docs/history/relato-2026-10-28-marcacao-pai.md)): 19 ✅ e 1 achado baixo, fora da feature
- [x] MP1b: o achado 1 (texto cortado com reticências sem dica): `title` no resumo da linha da camada nos Detalhes e nos nomes do caminho acima do canvas (teste de componente); no guia, o R0.1 lista o **Guia interativo** na lateral e o R12.10 diz que o `C` fica sem pai quando o `Grupo 2` deixa de cobri-lo
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-marcacao-pai.md`, `CLAUDE.md` e `docs/ROADMAP.md` (quando o dono decidir mesclar o épico)

## Etapa — Marcações espaciais, notas e setas (concluída, épico `epic/marcacoes-espaciais`)

> Fases ME0 a ME5 entregues no épico (schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3, componente `formatVersion` 2 e MCP 0.9.0). O objetivo, os conceitos, as 14 decisões, as regras de contenção, a revisão adversarial, as fases ME0 a ME4, as decisões consolidadas dos PRs e o que ficou para depois estão em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md). O protocolo da cascata noturna e do gerente da manhã está em `docs/history/PLAN-etapa-marcacoes-espaciais.md`, seção "Execução em cascata"; uma nova cascata o copia para o `PLAN.md` ao detalhar a etapa.

