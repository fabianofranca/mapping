# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje a etapa em andamento é a **Exemplos enxutos**, épico `epic/exemplos-enxutos`; a **Biblioteca Material 3** foi a última concluída; a **Marcação pai** foi mesclada na `main` pelo PR #240, com o fechamento do histórico pendente). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0) está concluída: o objeto de topo do canvas passou a se chamar container (interface, MCP, propostas e `mapping.json`, com `containers` e `containerId`) e os presets de dispositivo saíram do núcleo para a especialização (histórico em [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md)). A etapa **Marcações espaciais, notas e setas** (épico `epic/marcacoes-espaciais`, fases ME0 a ME5; schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3 e MCP 0.9.0 ao fim) está concluída (PRs #208 a #211, #214 e o da ME5): marcações que pertencem ao canvas e envolvem containers, pertencimento resolvido pela geometria e gravado, seleção múltipla e arrasto conjunto, biblioteca de notas embutida, setas como marcações que apontam e tabelas flutuantes, tudo exposto pelo MCP 0.9.0 (histórico em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md)). A etapa **Proposto com componentes** (épico `epic/proposto-componentes`, fases PC1 e PC2; sem schema, formato de proposta nem MCP novos) está concluída: a visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, e a criação rejeitada vira só o fantasma pontilhado nas duas visões (histórico em [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md)). A etapa **Sugestões no campo de texto** (épico `epic/sugestoes-campo`, fases SG1 e SG2; especialização `formatVersion` 8 e MCP 0.10.0, sem schema novo) está concluída: um campo ou coluna de texto da especialização pode oferecer um vocabulário sugerido ao digitar (`suggestions`, que não restringe o valor) e, com `linkedRef`, as declarações mapeadas que um `ref` irmão aceita, gravando o texto e o `ref` juntos; a biblioteca Kotlin usa os dois no Tipo das propriedades e dos supertipos (histórico em [`docs/history/PLAN-etapa-sugestoes-campo.md`](docs/history/PLAN-etapa-sugestoes-campo.md)). A etapa **Imagens remotas** (épico `epic/imagens-remotas`, fases RI0 a RI4; componente `formatVersion` 3 e MCP 0.11.0, sem schema, especialização nem formato de proposta novos) está concluída: um componente pode mostrar uma imagem de uma URL `https:` no canvas, com política de URL, consentimento por origem, interruptores de Privacidade (qualquer origem, `http`, rede local, servidor sem CORS), CSP com Trusted Types e carregador com limites; o MCP nunca baixa a imagem e o visualizador embutível ganhou a opção `remoteImages` (histórico em [`docs/history/PLAN-etapa-imagens-remotas.md`](docs/history/PLAN-etapa-imagens-remotas.md)). A etapa **Biblioteca Material 3** (épico `epic/material3`, fases MD1 a MD5; especialização `formatVersion` 9 e MCP 0.12.0, sem schema, formato de proposta nem de componente novos) está concluída: a entrada de `code` de uma plataforma ganhou `variants` (a variante troca o composable, como `Button` e `OutlinedButton`), com `resolveCode` como único lugar que resolve o caso, e a biblioteca pronta para uso `libraries/material3-compose/` (50 tipos do Material 3 para Jetpack Compose, fixada no androidx `compose.material3` 1.4.0, com a fonte Roboto, sem avisos de validação e o zip `examples/material3-compose.zip`) mapeia cada tipo para o composable e a variante (histórico em [`docs/history/PLAN-etapa-material3.md`](docs/history/PLAN-etapa-material3.md)). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

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
| [`docs/history/PLAN-etapa-material3.md`](docs/history/PLAN-etapa-material3.md) | Histórico: etapa Biblioteca Material 3, fases MD1 a MD5 concluídas; decisões, decisões consolidadas dos PRs, rodada do Cowork e o que ficou para depois |
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
| [`docs/sdui/BRIEF-SDUI-KMP.md`](docs/sdui/BRIEF-SDUI-KMP.md) | Briefing de um SDUI de produção com Material 3 em Kotlin Multiplatform (contrato, renderer em Compose Multiplatform, BFF; componentes, gatilhos e ações), para outro repositório, e onde o Mapping entra (biblioteca `sdui-material3`) |

---

## Etapa — Biblioteca Material 3 (concluída, épico `epic/material3`)

> Fases MD1 a MD5 entregues no épico (especialização `formatVersion` 9 com `variants` no `code`, MCP 0.12.0; sem schema, formato de proposta nem de componente novos). O objetivo, as 14 decisões, as fases, as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois estão em [`docs/history/PLAN-etapa-material3.md`](docs/history/PLAN-etapa-material3.md).

## Etapa — Exemplos enxutos (em andamento, épico `epic/exemplos-enxutos`)

- **Objetivo:** o dono decidiu (2026-11-01) que **todo recurso** dos formatos de especialização e de componente tenha um exemplo, usando **ao máximo as bibliotecas prontas** de `libraries/` (`notas`, `kotlin` e `material3-compose`). `examples/` guarda só o que elas não cobrem e não devem cobrir, os testes deixam de ler exemplos e passam a usar fixtures próprias, e um teste garante que nenhuma limpeza tire o último exemplo de um recurso. Replanejada na EX0 (2026-11-01) a partir da análise da primeira versão do plano.
- **Estado de partida:** `examples/libraries/` tem três pacotes: `material3` (15 tipos, gerado do laboratório por `scripts/buildLibraryExamples.mjs`), `analytics` (1 tipo) e `pessoas` (1 tipo). Varredura das chaves (EX0): o `material3` antigo é o único com a origem executável completa (`origins` com `booleans`, `background.values`, raízes com `anchor`, `margin` e `scrim`; `sources` com `slot`, `values` e `ignore`) e a tela de exemplo do sistema externo (`examples/settings.sdui.json` dentro do pacote); o resto dele a `material3-compose` já mostra. A `analytics` é a única com `appliesTo`. A `pessoas` não tem nada que a `material3-compose` não tenha (o tipo `image` tem o campo `url`). `examples/specs/biblioteca.json` é só o arquivo de um pacote (os arquivos que ele cita não vêm junto) e é o único exemplo de `migrations`. Os testes leem `examples/libraries/material3/` (ids `m3-*`, usados em mais de 30 arquivos), `examples/libraries/pessoas/` e `examples/specs/biblioteca.json`, e o projeto de exemplo (`examples/exemplo-completo/`, 21 anotações `m3-*`), o guia e o `proposta-componentes.zip` (R13) levam uma cópia do `material3` antigo.
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e sem MCP novo (a versão do servidor não muda). É uma reorganização de exemplos, fixtures, roteiros e documentação.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

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

8. **SDUI de produção fica fora desta etapa.** O dono decidiu (2026-11-01) fazer um SDUI de produção com Material 3 em Kotlin Multiplatform (contrato único, renderer em Compose Multiplatform para Android e iOS, BFF em Kotlin) num **repositório separado**; o que foi decidido está em [`docs/sdui/BRIEF-SDUI-KMP.md`](docs/sdui/BRIEF-SDUI-KMP.md). A biblioteca do Mapping que o descreve (`sdui-material3`, em `libraries/`) nasce depois que o contrato existir lá, porque o `code` e as `sources` precisam apontar para símbolos e chaves reais; quando nascer, ela pode substituir a `sdui-backend` como exemplo de origem. Até lá, a EX1 segue com a `sdui-backend` enxuta.

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
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX3 — Fixtures de teste, remoção e roteiros

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium (por grupo de testes), Haiku low (troca de caminhos). Decisões 4 e 6.

**Toca em:** os testes que leem os pacotes que saem: `tests/storage/packageFixture.ts`, `tests/components/libraryHarness.ts` (e quem o usa), `tests/components/SpecsDialog.test.tsx`, `tests/model/` (`catalog`, `componentArrange`, `componentCatalog`, `libraryPackage`, `libraryExamples`, `spec`, `specV4`), `tests/store/` (`componentLibrary`, `libraryPreview`, `sessionComponents`, `sessionPackage`), `tests/mcp/` (`library`, `libraryUpdate`, `containerComponents`), `tests/canvas/renderPerformance.test.ts`, `tests/app/` (`controller`, `library`), `tests/examples/pessoasLibrary.test.ts`, `tests/lab/viewer/remoteImages.test.ts`, `tests/e2e/` (`catalog`, `container`, `remoteImages`). Conferir com `grep -rn "examples/libraries/\(material3\|pessoas\)\|specs/biblioteca.json" tests scripts`.

- [x] `git mv` dos três para `tests/fixtures/` (decisão 4) e os testes apontando para lá, com os mesmos ids e contagens; `LEAVING` vazia no teste de cobertura; as seções dos três saem do guia dos exemplos e a tabela "Onde ver cada recurso" não os cita mais
- [x] Remover `scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts`, o script `build:examples` do `package.json` e do `CLAUDE.md`, e a menção em `lab/README.md`
- [x] Roteiros da decisão 6 reescritos (R3.10, R3.12, R3.14 a R3.17, R9, R10, R12.12, R15) e o preparo da seção 2; `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `docs/GUIDE.md`, `docs/COMPONENT-FORMAT.md`, `docs/SPEC-FORMAT.md`, `libraries/README.md` e a skill `spec-author` sem citar os pacotes removidos (`grep -rn "examples/libraries/\(material3\|pessoas\)\|specs/biblioteca.json"` fora de `docs/history/` volta vazio)
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

#### EX4 — Rodada do Cowork e fechamento

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low.

- [ ] Rodada dirigida do Cowork (R3, R9, R10, R12, R13 e R15) e o relato entre os documentos da etapa; achados corrigidos ou levados ao dono
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-exemplos-enxutos.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md`
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

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

