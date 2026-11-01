# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje as etapas em andamento são a **Biblioteca Material 3**, épico `epic/material3`, que aguarda a rodada do Cowork e o fechamento, e a **Marcação pai**, épico `epic/marcacao-pai`, que aguarda o fechamento; a **Imagens remotas** foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0) está concluída: o objeto de topo do canvas passou a se chamar container (interface, MCP, propostas e `mapping.json`, com `containers` e `containerId`) e os presets de dispositivo saíram do núcleo para a especialização (histórico em [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md)). A etapa **Marcações espaciais, notas e setas** (épico `epic/marcacoes-espaciais`, fases ME0 a ME5; schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3 e MCP 0.9.0 ao fim) está concluída (PRs #208 a #211, #214 e o da ME5): marcações que pertencem ao canvas e envolvem containers, pertencimento resolvido pela geometria e gravado, seleção múltipla e arrasto conjunto, biblioteca de notas embutida, setas como marcações que apontam e tabelas flutuantes, tudo exposto pelo MCP 0.9.0 (histórico em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md)). A etapa **Proposto com componentes** (épico `epic/proposto-componentes`, fases PC1 e PC2; sem schema, formato de proposta nem MCP novos) está concluída: a visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, e a criação rejeitada vira só o fantasma pontilhado nas duas visões (histórico em [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md)). A etapa **Sugestões no campo de texto** (épico `epic/sugestoes-campo`, fases SG1 e SG2; especialização `formatVersion` 8 e MCP 0.10.0, sem schema novo) está concluída: um campo ou coluna de texto da especialização pode oferecer um vocabulário sugerido ao digitar (`suggestions`, que não restringe o valor) e, com `linkedRef`, as declarações mapeadas que um `ref` irmão aceita, gravando o texto e o `ref` juntos; a biblioteca Kotlin usa os dois no Tipo das propriedades e dos supertipos (histórico em [`docs/history/PLAN-etapa-sugestoes-campo.md`](docs/history/PLAN-etapa-sugestoes-campo.md)). A etapa **Imagens remotas** (épico `epic/imagens-remotas`, fases RI0 a RI4; componente `formatVersion` 3 e MCP 0.11.0, sem schema, especialização nem formato de proposta novos) está concluída: um componente pode mostrar uma imagem de uma URL `https:` no canvas, com política de URL, consentimento por origem, interruptores de Privacidade (qualquer origem, `http`, rede local, servidor sem CORS), CSP com Trusted Types e carregador com limites; o MCP nunca baixa a imagem e o visualizador embutível ganhou a opção `remoteImages` (histórico em [`docs/history/PLAN-etapa-imagens-remotas.md`](docs/history/PLAN-etapa-imagens-remotas.md)). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v13)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 9 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
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
| [`docs/history/PLAN-etapa-sugestoes-campo.md`](docs/history/PLAN-etapa-sugestoes-campo.md) | Histórico: etapa Sugestões no campo de texto, fases SG1 e SG2 concluídas; decisões consolidadas dos PRs, rodada do Cowork e o que ficou para depois |
| [`docs/history/PLAN-etapa-imagens-remotas.md`](docs/history/PLAN-etapa-imagens-remotas.md) | Histórico: etapa Imagens remotas, fases RI0 a RI4 concluídas; modelo de ameaças, 17 decisões, decisões consolidadas dos PRs, rodadas do Cowork e o que ficou para depois |
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
| [`docs/history/relato-2026-10-29-sugestoes-campo.md`](docs/history/relato-2026-10-29-sugestoes-campo.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/sugestoes-campo` (build `f034a3a`): 24 ✅, 2 achados baixos, tratados no PR #250 |
| [`docs/history/relato-2026-11-01-material3.md`](docs/history/relato-2026-11-01-material3.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/material3` (build `11d9b65`, MCP 0.12.0-rc.1): 35 ✅, 1 ❌ baixo (R10.7: o guia estava velho; o componente sem container vai para o canvas desde a etapa Marcações espaciais), textos do guia corrigidos |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapas Container, Marcações espaciais, notas e setas, Proposto com componentes e Sugestões no campo de texto concluídas), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

---

## Etapa — Biblioteca Material 3 (em andamento, épico `epic/material3`)

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
- [ ] PR da MD5 aberto com o rótulo `mcp-rc` (última fase do épico)
- [x] Rodada dirigida do Cowork e o relato entre os documentos da etapa (`docs/history/relato-2026-11-01-material3.md`: build `11d9b65`, 35 ✅ e 1 ❌ baixo)
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-material3.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md` (quando o dono decidir mesclar o épico, depois do `epic/imagens-remotas`)
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

**Avisos do pacote.** O validador deixou de avisar "campo não usado pelo desenho" quando o `code` do tipo usa o campo (`params`, `values`, `variants` ou palavra das `notes`): a biblioteca passou de 82 para 50 avisos. Depois, o `minSize` dos componentes foi conferido contra o código do androidx no commit fixado: ficou só onde há mínimo oficial nos dois eixos (15 tipos mantidos, 4 deles depois removidos por serem mínimo do controle e não do desenho com rótulo; 35 removidos) e a biblioteca foi para 13 avisos (11 de tamanho mínimo oficial, que o texto de exemplo não resolve, e 2 da fonte Roboto). A tabela de fontes está em `libraries/README.md`.

**Rodada do Cowork da etapa (2026-11-01).** R0, R16, R17, R3.6 e R10 no build `11d9b65`: 35 ✅ e 1 ❌ baixo (R10.7). O ❌ foi texto velho do guia, não defeito: desde a etapa Marcações espaciais, o "Adicionar" do Catálogo sem seleção e sem container sob o centro da vista põe o componente no canvas (`componentTarget`, regra 4), e o botão só fica desabilitado em projeto somente leitura. Guia corrigido (R10.7; R16.3 com `background`; R16.9 com a dica `.tooltip`; R16.10 pela **Abrir biblioteca** com uma pasta de pacote; R17.1 com os 82 avisos; R17.9 com "Variantes (Estilo)"). Fica para decidir: o botão do diálogo do Catálogo diz "Adicionar à tela" mesmo quando o destino é o canvas (o rótulo da Paleta já muda).

**Registro da MD5.** Zip em `examples/material3-compose.zip` (conteúdo da pasta na raiz, gerado por `scripts/material3ComposeZip.mjs`, sem fonte própria além de `libraries/material3-compose/`; `tests/examples/material3ComposeZip.test.ts` prova que o zip tem exatamente o conteúdo da pasta e que é um pacote válido). Roteiro R17 (9 passos, quadro "Comece aqui" na linha 19) e `tests/mcp/material3Compose.test.ts`, que mapeia a mesma tela com o MCP real e confere a árvore de `get_code_hints` e o `find_by_code` pela variante. No `get_code_hints`, só as anotações de tipos com `variants` trazem `code` na `tree`; as demais têm o composable em `types`.

## Etapa — Imagens remotas (concluída, épico `epic/imagens-remotas`)

> Fases RI0 a RI4 entregues no épico (componente `formatVersion` 3 com o nó `image` e MCP 0.11.0; especialização, schema v13 e formato da proposta v3 sem mudança). O objetivo, o modelo de ameaças, as 17 decisões, as fases, as decisões consolidadas dos PRs, as rodadas do Cowork e o que ficou para depois estão em [`docs/history/PLAN-etapa-imagens-remotas.md`](docs/history/PLAN-etapa-imagens-remotas.md).

## Etapa — Sugestões no campo de texto (concluída, épico `epic/sugestoes-campo`)

> Fases SG1 e SG2 entregues no épico (especialização `formatVersion` 8 com `suggestions` e `linkedRef`, MCP 0.10.0; sem schema, formato de proposta nem de componente novos). O objetivo, as 10 decisões, as fases, as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois estão em [`docs/history/PLAN-etapa-sugestoes-campo.md`](docs/history/PLAN-etapa-sugestoes-campo.md).

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

