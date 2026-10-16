# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, as do laboratório de componentes, abaixo; a etapa 10 foi a última etapa do produto detalhada). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**. O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passa à biblioteca de componentes. A etapa em andamento é o **laboratório de componentes** (épico `epic/lab`, fases L1 e L2 abaixo, detalhes em [`lab/README.md`](lab/README.md)) e a próxima é a etapa **Biblioteca** (no [`ROADMAP`](docs/ROADMAP.md); entra aqui quando começar). As demais (uso contínuo do marco e evoluções) também estão no [`ROADMAP`](docs/ROADMAP.md). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v9)                                       |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 movida para Evoluções) |
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
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (laboratório de componentes e etapa Biblioteca), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

## Etapa em andamento — Laboratório de componentes (épico `epic/lab`)

O laboratório `lab/components/` (PR [#160](https://github.com/fabianofranca/mapping/pull/160); descrição em [`lab/README.md`](lab/README.md)) provou o formato de componente (`mapping-component`: template de primitivas com expressões sobre os campos), o Material 3 escrito nesse formato, containers (Box, Row, Column), fontes do design system por bytes e várias telas arrastáveis no quadro. A análise de 2026-10-16 concluiu: o **motor** (formato, parser, expressões, instanciação, cena, renderizador Konva, arrumação) vai para o produto; o **editor do laboratório** (`editor.ts` e a página) não vai, porque o canvas da app já faz esse papel. No produto não existe entidade "instância": uma instância é **uma marcação com uma anotação tipada**, e o desenho é derivado (retângulo da marcação, tipo e valores da anotação, molde da especialização) e não é gravado. Uma tela sem imagem é uma **imagem sem arquivo**. O produto só ganha isso na etapa **Biblioteca** ([`docs/ROADMAP.md`](docs/ROADMAP.md)); estas duas fases terminam o laboratório antes de mesclar o épico.

### L1 — Visualizador embutível

**Coordenador:** Sonnet. Especificação fechada: extrair o núcleo de só leitura, build de biblioteca, invólucro React e demonstração; pouca decisão nova.

- [ ] Núcleo de só leitura, sem framework: recebe um contêiner, a biblioteca e a descrição de tela e desenha; `update` redesenha só o que mudou; expõe hover, clique e realce de seleção por callbacks; não edita.
- [ ] O editor do laboratório passa a usar o núcleo para desenhar (separação verdadeira entre motor e editor).
- [ ] Build de biblioteca à parte, gerando um arquivo importável (como o build do MCP); as fontes são fornecidas pelo site hospedeiro.
- [ ] Invólucro React fino sobre o núcleo.
- [ ] Página de demonstração em React de verdade (React como dependência de desenvolvimento só do laboratório, justificada no PR): montar, atualizar o JSON em tempo real, StrictMode e desmontar.
- [ ] Entrada do visualizador: a descrição neutra de tela que o laboratório já tem (tamanho, fundo, instâncias com retângulo, tipo, valores e pai) mais a biblioteca; o hospedeiro ou a app traduzem para isso.
- [ ] Observar o custo de atualizações frequentes.
- [ ] Observar se a API basta para o hospedeiro construir a edição para leigos por cima.

### L2 — Tela a partir de um JSON sem geometria

**Coordenador:** Opus. Define formato (declaração de origem executável, dimensionamento) e a arrumação por tamanhos; decisões que o produto herda.

- [ ] Dimensionamento por componente (largura e altura: `fill`, `hug` ou px) e arrumação que calcula tamanhos além de posições, com a tela como container raiz em coluna; caso de prova: texto de apoio do cartão com altura `hug` dentro de coluna `hug`.
- [ ] Declaração de origem executável no formato experimental do laboratório: chaves do nó (tipo, props, filhos), raízes da tela com âncoras e overlays, tipo externo para tipo de anotação, caminho de cada campo (aninhado, com índice), tradução de valores e slot dos filhos. O núcleo executa a declaração e nunca código vindo da especialização.
- [ ] Visualizador aceitando a biblioteca mais um JSON externo; a página do laboratório deixa colar um JSON do SDUI, com `lab/components/sdui/settings.sdui.json` como exemplo embutido ao lado da tela do Material 3.
- [ ] Avisos para props desconhecidas; chaves ignoradas pelo desenho não geram erro.
- [ ] Cartão com slot de ações (o do laboratório não tem).
- [ ] Teste com o JSON real do backend, quando o dono tiver (até lá, o exemplo). Risco real: se o JSON real tiver estruturas irregulares demais para uma declaração, a saída é o backend ou a ferramenta administrativa normalizarem antes.

### Fechamento

**Coordenador:** Sonnet. README, mesclar o épico e abrir o épico seguinte são mecânicos.

- [ ] README do laboratório com as conclusões, mesclar o épico `epic/lab` na `main` e abrir o épico "Biblioteca" (B1 a B5 em [`docs/ROADMAP.md`](docs/ROADMAP.md); detalhar aqui quando começar).

### Decisões registradas (2026-10-16)

- O motor vai para o produto; o editor do laboratório não.
- Instância no produto = marcação com anotação tipada; o desenho é derivado e não é gravado.
- Tela sem imagem = imagem sem arquivo (tela em branco com tamanho e cor de fundo); o quadro de telas reorganizáveis já existe na app (`placement`, gravado).
- Coexistência com imagens: o desenho é opcional por tipo. Projeto só com fotos e especialização sem desenhos não executa nada novo; projeto misto é possível.
- A especialização define a oferta (tipos e quais têm desenho); o projeto define o uso (especializações aplicadas, telas em branco).
- Opção de visualização por pessoa, não gravada: mostrar ou não o desenho por cima de uma foto (padrão: escondido na foto, sempre visível na tela em branco).
- Hierarquia das marcações = contenção visual (container e conteúdo).
- "Pertencer a um modelo" = anotação em outra camada na mesma marcação, herdada pelos descendentes, mais campos de referência que apontam para campos do modelo. O desenho resolve referências (um nível, com detecção de ciclo); editar o modelo redesenha os componentes que o usam.
- Borda da marcação só em hover e seleção para marcações que desenham componente; marcações sem desenho mantêm a borda sempre visível.
- Arrumação (arrange) só por ação do usuário no editor, nunca na carga, no MCP nem ao aplicar proposta sem decisão explícita (a medição de texto no Node é aproximada e no navegador é real; arrumar na carga geraria gravações e `revision` a cada abertura).
- **A decidir:** regra para conteúdo maior que o slot (a invariante exige filho dentro do pai): recortar ou recusar e avisar.
- Editar um campo no painel redesenha o componente na hora (uma ação do store, uma versão do projeto, um quadro; só a marcação mudada é re-instanciada). Vale para desfazer/refazer, alteração externa (recarga) e revisão de proposta (a visão Proposto desenha com os valores propostos).
- Pacote = pasta da especialização (especialização, componentes um por arquivo, fontes, documentos markdown por componente, exemplos nomeados); tudo o que a especialização referencia fica dentro da pasta. Nomes: **Biblioteca** (o pacote) e **Catálogo** (a tela de documentação). Aplicar a um projeto copia a pasta.
- **A decidir:** peso das fontes por projeto. Começar copiando; se incomodar, referenciar o pacote da pasta central só para as fontes.
- Porta aberta, não agora: um pacote de desenhos servindo a várias especializações, por caminho relativo.
- A app é só leitura da biblioteca: pacotes e pedidos de alteração são escritos por agentes. "Editor de especializações dentro da app" sai do roadmap.
- Validador em três níveis, puro e igual no navegador e no Node: (1) cada arquivo isolado, estrito, com caminho do problema; (2) coerência entre arquivos; (3) prova de desenho (instanciar cada componente com cada exemplo no tamanho inicial e no mínimo, recolhendo os avisos do motor como "aproximado"). Saída com caminho, mensagem e severidade (erro impede usar; aviso deixa usar).
- Três portas de validação: a app (ao abrir e aplicar, no Diagnóstico), o MCP (validar e servir documentos) e a skill `spec-author` (cresce para escrever a biblioteca inteira e validar antes de entregar), mais o JSON Schema do componente publicado ao lado do da especialização.
- Contrato de versão da biblioteca definido já no formato: mudança aditiva (componente novo, propriedade nova opcional) contra mudança que quebra (tipo removido, campo renomeado, obrigatório novo), com regras de migração declaradas no pacote. As ferramentas de atualização vêm numa fase depois (B4).
- Visualizador embutível para um site React (ferramenta administrativa em que o time de negócio pré-visualiza a tela antes de publicar): o motor não depende de framework; entrega = núcleo sem framework mais invólucro React fino. A ferramenta administrativa constrói a edição para leigos por cima.
- JSON do SDUI como entrada do visualizador, sem quebrar o núcleo genérico: a especialização declara uma **origem executável** (como já declara origens do Figma) e o núcleo executa a declaração sem saber o que é SDUI. Nenhum nome de plataforma ou de sistema externo no código do núcleo.
- O JSON do SDUI é uma árvore sem geometria: cada componente declara como se dimensiona sem retângulo e a arrumação calcula tamanhos. Os exemplos nos documentos de cada componente passam a ser o próprio JSON do SDUI, e a validação confere que cada exemplo passa pela declaração sem propriedade desconhecida (a biblioteca vira teste de contrato do backend).
- Mais tarde, sem data: a mesma declaração pode dar a saída tela para sistema externo, de forma determinística, e a importação de telas do SDUI para projetos (começo da migração de telas antigas).
- `lab/components/sdui/settings.sdui.json` (tela de configurações do Material 3 escrita como um backend de SDUI escreveria) e `lab/components/sdui/origem-material3.sketch.json` (esboço da declaração de origem; as chaves ainda não existem no formato) já existem; a L2 define a declaração. O dono não consegue testar com o JSON real do backend por enquanto.
- Cada fase tem um **modelo coordenador** definido (L1 e Fechamento: Sonnet; L2: Opus; B1 a B5 no [`docs/ROADMAP.md`](docs/ROADMAP.md)). Antes de começar, a sessão confere o modelo em que roda: se for superior ao definido, não executa a fase e pede ao dono para trocar de modelo; se for inferior, avisa e só continua com a confirmação do dono. Regra completa na seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md).
