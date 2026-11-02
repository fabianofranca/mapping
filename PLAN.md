# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje a etapa em andamento é a **Marcação pai**, épico `epic/marcacao-pai`, que aguarda o fechamento; a **Biblioteca Material 3** foi a última concluída e já está na `main`, pelo PR #260; estão planejadas a **Sincronia do design system**, épico `epic/sincronia-ds`, e a **Exemplos enxutos**, épico `epic/exemplos-enxutos`, esta última já liberada pela entrada do `epic/material3` na `main`). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

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
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)         | Design system (artefato do Claude Design): mapa componente → origem no código, gatilhos, pendências e histórico de sincronização |
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

---

## Etapa — Biblioteca Material 3 (concluída, épico `epic/material3`)

> Fases MD1 a MD5 entregues no épico (especialização `formatVersion` 9 com `variants` no `code`, MCP 0.12.0; sem schema, formato de proposta nem de componente novos). O objetivo, as 14 decisões, as fases, as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois estão em [`docs/history/PLAN-etapa-material3.md`](docs/history/PLAN-etapa-material3.md).

## Etapa — Sincronia do design system (planejada, épico `epic/sincronia-ds`)

- **Objetivo:** o dono pediu (2026-11-02) um processo em que os planos verifiquem, fase a fase, se o design system precisa de atualização. O DS do projeto é o artefato **Mapping** do Claude Design (<https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9>), curado à mão: 63 componentes com guia e preview (mais a capa), 6 seções (Canvas, Layouts, Atalhos, Contraste, Conceitos, Revisão), os tokens e 85 ícones. Hoje ele não tem dono no repositório — a URL só aparece em três documentos históricos do `docs/redesign/` — e sua última alteração é de 2026-10-24, quatro etapas atrás. A etapa dá ao DS um registro vivo no repositório, uma verificação por fase, uma atualização por épico, e o põe em dia.
- **Depende de:** nada. O branch do épico nasce da `main` atualizada, que já tem as etapas Proposto com componentes, Sugestões no campo, Imagens remotas e Biblioteca Material 3 (PR #260), além do `wrapItems` da Marcação pai.
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e **sem MCP novo** (a versão do servidor não muda). É processo, documentação e a atualização do artefato do DS, que vive fora do repositório.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                               |
| ---- | ----------- | ---------------------- | ------------------------------------------------------------------------ |
| DS1  | Opus        | medium                 | Sonnet medium (mapa, um subsistema por subagente); Haiku low (mecânicos) |
| DS2  | Opus        | high                   | Sonnet medium (um grupo de componentes do DS por subagente)              |

### Decisões

1. **O DS é curado à mão, não é gerado do código.** A skill `/design-sync` do Claude Code **não se aplica**: ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build. Fica registrado para nenhuma sessão futura tentar.
2. **Dono no repositório:** `docs/DESIGN-SYSTEM.md`, documento vivo, com a URL e o nome do artefato, a natureza dele (decisão 1), o **mapa** (componente, seção, token e ícone do DS → origem no código), os **gatilhos** (decisão 6), as **pendências** abertas e o **histórico de sincronização**. Os quatro documentos do `docs/redesign/` continuam como referência histórica e passam a apontar para ele.
3. **Verificação por fase:** a descrição de todo PR ganha um quarto item, **Impacto no DS**: "nenhum", ou o que muda (componentes, seções, tokens, ícones). O que não for "nenhum" vira bullet na seção de pendências do `docs/DESIGN-SYSTEM.md`, no mesmo PR. A fase decide isso cruzando o "Toca em:" dela com os gatilhos; é leitura, não exige abrir o artefato.
4. **Atualização por épico, no fechamento:** a fase de Fechamento que toda etapa já tem ganha o checkbox do DS, ao lado do `CHANGELOG.md`: aplicar as pendências no artefato, esvaziar a lista e registrar a sincronização (data, épico, o que mudou). **Não há gravação no artefato no meio do épico** — o DS é editado ao vivo por pessoas e o índice precisa ser lido imediatamente antes de cada gravação, então uma gravação por épico evita conflito e idas e vindas.
5. **Trava no CI:** o job `epic` do `ci.yml` ganha o passo "Design system registrado", irmão do "Changelog atualizado": o PR de `epic/*` para a `main` precisa tocar o `docs/DESIGN-SYSTEM.md`. O artefato o CI não alcança; o registro no repositório, sim.
6. **Gatilhos** (o que obriga a verificação): `src/ui/**`, `src/theme/tokens.ts`, `src/ui/icons.tsx`, `src/canvas/**`, e `src/i18n/**` só quando muda um rótulo que aparece num preview ou num guia do DS. Mudança só em `src/model/`, `src/storage/`, `mcp/`, testes, exemplos, `libraries/`, `lab/` ou documentação **não** mexe no DS.
7. **O código é a fonte da verdade; o DS descreve.** Nenhuma divergência entre os dois se resolve mudando a app para casar com o DS: o DS é que se corrige. Divergência que pareça defeito da app vira achado registrado na pendência, para o dono decidir.
8. **Recuperação (DS2):** entram numa única sincronização as quatro etapas depois de 2026-10-24 — Proposto com componentes, Sugestões no campo de texto, Imagens remotas e Biblioteca Material 3 — e o **Envolver** da Marcação pai, com uma entrada de histórico por etapa.

### Fora (de propósito)

- Usar a `/design-sync` ou gerar qualquer parte do DS a partir do código (decisão 1).
- Reescrever o conteúdo autoral das seções do DS além do que as entregas exigem: as seções e os guias têm autores, e a etapa ajusta só o que mudou.
- Criar componente no DS para o que não existe na app, ou apagar o que a app ainda tem.
- Mexer no `index.html`, nos tokens ou nos controles da app para casar com o DS (decisão 7).
- Script que compare o DS com o código automaticamente; o mapa é lido por pessoas e agentes. Fica para depois, se a verificação por fase se mostrar cara.

### Fases

#### DS1 — Dono no repositório, verificação por fase e trava no CI

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium (mapa, um subsistema por subagente) e Haiku low. Decisões 1 a 7.

**Toca em:** `docs/DESIGN-SYSTEM.md` (novo), `CLAUDE.md`, `.github/workflows/ci.yml`, `PLAN.md`, `CHANGELOG.md`, `docs/redesign/HANDOFF.md`, `docs/redesign/HANDOFF-PROPOSALS.md`, `docs/redesign/BRIEF-REVIEW-DETAILS.md`, `docs/redesign/HANDOFF-REVIEW-DETAILS.md`.

- [x] `docs/DESIGN-SYSTEM.md` com a URL e o nome do artefato, a natureza dele (decisão 1), os gatilhos (decisão 6), a regra da fonte da verdade (decisão 7), a seção de pendências e o histórico de sincronização
- [x] Mapa no mesmo documento: cada um dos 63 componentes, das 6 seções, dos tokens e dos 85 ícones do DS aponta para a origem na `main`; o que o DS não acompanha fica numa lista à parte, com o motivo
- [x] Mapa conferido nos dois sentidos: todo componente do DS aponta para arquivo que existe, e todo arquivo de `src/ui/` com forma visível aparece no mapa ou na lista do que o DS não acompanha
- [x] Registrar que o índice do artefato se chama **Mapping** e que os documentos do `docs/redesign/` o chamam de "Mapeador de Imagens 2.0" (sem renomear nada nesta fase)
- [x] `CLAUDE.md`: item **Impacto no DS** na descrição do PR (decisão 3), o checkbox do DS no Fechamento de todo épico (decisão 4) e a linha do `docs/DESIGN-SYSTEM.md` na tabela de documentação; a mesma linha na tabela do `PLAN.md`
- [x] Passo "Design system registrado" no job `epic` do `ci.yml` (decisão 5), no molde do passo "Changelog atualizado"
- [x] Os quatro documentos do `docs/redesign/` apontam para o `docs/DESIGN-SYSTEM.md` como o registro vivo (decisão 2)
- [x] Pendências preenchidas com as cinco entregas da decisão 8, cada uma com os componentes e seções candidatos
- [x] `CHANGELOG.md`: a seção `[Não lançado]` do épico conferida contra o que a fase entregou
- [x] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### DS2 — Pôr o DS em dia

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (um grupo de componentes do DS por subagente). Decisões 4, 7 e 8.

A fase grava no artefato do DS, fora do repositório: o índice (`project/design-system.json`) é lido imediatamente antes e gravado **por último**, numa chamada só, com `lastChange`. Nenhum arquivo do DS é apagado.

- [x] Triagem: comparar o DS com a `main` pelo mapa da DS1 e fechar, por pendência, o que muda em cada componente, seção, token e ícone
- [x] Proposto com componentes: a visão Proposto desenha os componentes criados com a marca de criada e a criação rejeitada vira fantasma pontilhado (guias de `ComponentDrawing`, `ChangeMark`, `ChangePopover`, `ReviewBar`, `ReviewHeader` e `OtherChanges`, mais as seções `Revisao.md` e `Canvas.md`)
- [x] Sugestões no campo de texto: `suggestions` e `linkedRef` (`TextField` com preview, `PropertyGrid`, `DataGrid`, `ReferenceField`; o `KeyValueGrid` ganhou o esclarecimento de que a anotação livre não tem lista)
- [x] Imagens remotas: nó `image` no componente e aba Privacidade (`ComponentDrawing` com preview, `Canvas.md`, `SettingsDialog` com preview)
- [x] Biblioteca Material 3: `variants` no `code`, com a definição da anotação e a tabela de variantes no Catálogo (`CodeDefinitions` e `CatalogPage`, com preview)
- [x] Marcação pai: botão **Envolver** no resumo da seleção múltipla e a dica nos nomes cortados (`MultiSelectionPanel` com preview, `LayerGroup` e `Breadcrumbs`; o `TreeRow` já estava correto)
- [x] Tokens e ícones conferidos contra `src/theme/tokens.ts` e `src/ui/icons.tsx`: os ícones já estavam 1:1; entraram no `tokens.json` o `size-grid-col-min` e seis papéis de controle, e os cinco alias `t-text*` ficaram fora por limite do formato (registrado)
- [x] Contraste: o texto novo usa só tokens existentes e nenhuma regra de contraste mudou, então a seção `Contraste.md` ficou como estava; a conferência visual dos previews nos dois temas não foi feita e está registrada nas pendências do `docs/DESIGN-SYSTEM.md`
- [x] `docs/DESIGN-SYSTEM.md`: pendências esvaziadas e uma entrada de histórico de sincronização por etapa (decisão 8)
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-sincronia-ds.md`, `CHANGELOG.md`, `CLAUDE.md` e `docs/ROADMAP.md`

## Etapa — Exemplos enxutos (planejada, épico `epic/exemplos-enxutos`)

- **Objetivo:** o dono decidiu (2026-11-01) que `examples/libraries/` guarde só o que as bibliotecas prontas de `libraries/` (`notas`, `kotlin` e `material3-compose`) **não cobrem**. Hoje há três pacotes de exemplo: `material3` (15 tipos), `analytics` (2) e `pessoas` (1). O `material3` e o `pessoas` repetem o que a `material3-compose` já mostra (containers, fontes, slot, `$switch`, nó `image`); o `analytics` mostra `appliesTo` (tipo só de seta ou só de marcação), que nenhuma biblioteca de `libraries/` mostra; o `material3` mostra `origins` e `sources` (ligar o tipo a um sistema externo, com telas de exemplo), que também ficam descobertos.
- **Depende de:** o épico `epic/material3` ter entrado na `main` (a `material3-compose` e as mudanças do validador só existem lá). O branch do épico nasce da `main` atualizada.
- **Versões:** sem schema, formato de especialização, de proposta ou de componente novos, e sem MCP novo (a versão do servidor não muda). É uma limpeza de exemplos, fixtures e roteiros.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                                    |
| ---- | ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| EX1  | Opus        | high                   | Sonnet medium (migração dos testes, por grupo de arquivos); Haiku low         |
| EX2  | Sonnet      | medium                 | Sonnet medium (pacote, documentos, roteiros); Haiku low                       |
| EX3  | Sonnet      | medium                 | Sonnet medium; Haiku low                                                      |

### Decisões

1. **Ficam em `examples/libraries/`:** `analytics` (cobre `appliesTo`) e uma biblioteca **SDUI enxuta**, de 2 a 3 tipos, que cobre `origins` e `sources` com uma tela de exemplo do sistema externo. Saem a `material3` de 15 tipos e a `pessoas`.
2. **A SDUI enxuta nasce da `material3` antiga, cortada:** só os tipos e componentes necessários para mostrar a origem (por exemplo Button e Text), com `sources`, `origins` e um exemplo de tela. `examples/specs/sdui.json` (especialização isolada, `formatVersion` 5) continua como exemplo de arquivo único. O `id` e o nome do pacote novo saem na EX2, sem colidir com o `id` `sdui` desse arquivo.
3. **Os testes deixam de depender de uma biblioteca de exemplo.** A base fixa dos testes (hoje a `material3` de 15 tipos: ids `m3-button`, `m3-chip`, `m3-row`…) vira uma **biblioteca mínima só de teste**, em `tests/fixtures/`, com os tipos que os testes usam (contêineres com slot, botão, chip, campos, barra de navegação, cartão). Não vira a `material3-compose`, que cresce a cada versão do androidx. O gerador (`scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts`) e a dependência do laboratório (`lab/`) saem junto com a pasta antiga.
4. **Roteiros:** o R15 (imagens remotas) passa a usar um tipo com imagem da `material3-compose` (`image`, `card` ou `list-item`); o R12.19 continua com a `analytics`; o R3.10, o R3.12, o R9, o R10 e o R12.12 passam a usar a `material3-compose` (pasta ou `material3-compose.zip`). Todo passo continua feito pelo agente sozinho.
5. **Projeto de exemplo e guia:** `examples/exemplo-completo/` (e o zip) e o guia interativo (`public/guia/`) trocam o `specs/material3/` pela SDUI enxuta ou ficam só com as notas; a escolha sai na EX3, junto da conferência do tamanho do zip.
6. **Sem perda de cobertura:** cada recurso que a `material3` antiga ensinava continua com um exemplo (`origins` e `sources` na SDUI enxuta; `appliesTo` na `analytics`; o resto na `material3-compose`), e um teste da etapa confere isso.

### Fora (de propósito)

- Alterar a `material3-compose`, as notas ou a Kotlin.
- Aceitar `minSize` de um eixo só ou qualquer outra mudança de formato.
- Dar a Roboto às bibliotecas de exemplo restantes (a `analytics` e a SDUI enxuta não usam fontes).

### Fases

#### EX1 — Fixture mínima de teste e migração dos testes

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (um grupo de testes cada) e Haiku low. Decisão 3.

**Toca em:** `tests/fixtures/` (novo), `tests/storage/packageFixture.ts`, `tests/components/libraryHarness.ts`, `tests/model/` (`catalog`, `componentArrange`, `componentCatalog`, `libraryPackage`, `libraryExamples`), `tests/store/` (`componentLibrary`, `libraryPreview`, `proposalPackage`, `sessionComponents`, `sessionPackage`, `sessionPackageDisk`), `tests/mcp/` (`library`, `libraryUpdate`, `containerComponents`), `tests/canvas/renderPerformance.test.ts`, `tests/components/catalog/CatalogView.test.tsx`, `tests/app/` (`controller`, `library`), `tests/e2e/` (`catalog`, `container`, `proposedComponentsFixture`).

- [ ] Biblioteca mínima de teste em `tests/fixtures/` (os tipos que os testes usam, com componente, documento e exemplos) e um carregador único, no lugar de `examples/libraries/material3/`
- [ ] Todos os testes que citavam `examples/libraries/material3/` apontam para a fixture (ids novos; contagens de avisos e de tipos ajustadas), sem mudar o que cada teste prova
- [ ] O orçamento de desempenho do canvas continua medindo a mesma carga (mesma quantidade de componentes)
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX2 — Biblioteca SDUI enxuta e o roteiro de `origins`

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Decisões 1, 2 e 6.

- [ ] `examples/libraries/<id>/` com a SDUI enxuta (2 a 3 tipos, `sources`, `origins`, uma tela de exemplo do sistema externo, componentes e documentos), validada por teste próprio no molde de `tests/model/libraryExamples.test.ts`
- [ ] `docs/SPEC-FORMAT.md` e `libraries/README.md` apontam para ela como o exemplo de `origins` e `sources`
- [ ] Teste de cobertura (decisão 6): cada recurso (`origins`, `sources`, `appliesTo`) tem um exemplo em `examples/libraries/` ou `libraries/`
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### EX3 — Remoção, roteiros e fechamento

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Decisões 3 a 5.

- [ ] Remover `examples/libraries/material3/`, `examples/libraries/pessoas/`, `scripts/buildLibraryExamples.mjs`, `scripts/libraryExamples.ts` e o script do `package.json`, e tirar a menção em `lab/README.md`
- [ ] Projeto de exemplo (`examples/exemplo-completo/` e o zip) e guia interativo regenerados sem o `specs/material3/` antigo (`npm run build:example` e `npm run build:guia`)
- [ ] Roteiros R3.10, R3.12, R9, R10, R12.12 e R15 reescritos (decisão 4), `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `docs/GUIDE.md`, `docs/COMPONENT-FORMAT.md`, `docs/SPEC-FORMAT.md`, a skill `spec-author` e `src/i18n/specHelp.ts` sem citar os pacotes removidos (teste do guia)
- [ ] Rodada dirigida do Cowork (R3, R9, R10, R12 e R15) e o relato entre os documentos da etapa
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-exemplos-enxutos.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/ROADMAP.md` e as pendências do DS aplicadas no artefato (`docs/DESIGN-SYSTEM.md`)
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

