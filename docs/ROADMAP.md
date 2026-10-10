# Roadmap

Ordem das etapas do Mapping. Este documento só dá a direção: o detalhamento das fases fica no [`PLAN.md`](../PLAN.md) quando a etapa começar.

## Princípio

O núcleo da ferramenta é **genérico**: imagens, marcações, camadas, anotações, componentes e telas. Todo conceito de domínio (SDUI, plataformas, Figma, contratos) entra por **especializações**, para a mesma ferramenta servir a N aplicações.

## Etapa 2.3 — Redesign da interface (concluída)

- **Objetivo:** renovar a interface com os tokens e o design system 2.0, sem quebrar o uso no desktop nem no celular.
- **Entra:** fases R1 a R9 (histórico em [`docs/history/PLAN-etapa-2-3.md`](history/PLAN-etapa-2-3.md)). A R10 (paleta de comandos e busca global) sai do caminho crítico e vai para [Evoluções](#evoluções).
- **Depende de:** nada (etapas 1 a 2.2 concluídas).

## Etapa 2.4 — Privacidade garantida por CSP (concluída)

- **Objetivo:** a app já não faz nenhuma requisição de rede com dados do usuário; esta etapa transforma isso em regra imposta pelo navegador.
- **Entra:**
  - Content Security Policy em `<meta>` no `index.html`, gerada no build: `default-src 'none'`; scripts e estilos permitidos só pelos hashes dos blocos embutidos (sem `'unsafe-inline'`); `img-src` com `'self' data: blob:`; `connect-src 'none'`; `worker-src 'self'`; `manifest-src 'self'`; `object-src`, `frame-src`, `form-action` e `base-uri` como `'none'`.
  - Precisa continuar funcionando em `file://`, no GitHub Pages, no preview e com o service worker.
  - Testes: o build falha se a CSP faltar ou se os hashes não baterem com os blocos embutidos; um teste Playwright confirma que uma requisição para um host externo é bloqueada.
- **Depende de:** nada. Pode rodar em paralelo com as fases do redesign.
- **Resultado:** `pwa/csp.ts` + plugin `contentSecurityPolicy` (`vite.config.ts`); o build falha sem CSP ou com hash divergente; testes em `tests/app/cspBuild.test.ts`, `tests/e2e/csp.spec.ts` e `tests/e2e/cspServiceWorker.spec.ts`. Documentação em [`ARCHITECTURE.md`](ARCHITECTURE.md#content-security-policy-etapa-24) e no README. O zod passou a rodar em `jitless` (sem `eval`).

## Etapa 2.5 — Trava de marcações e imagens (concluída)

- **Objetivo:** proteger marcações e imagens já revisadas contra alterações acidentais, sem impedir a navegação nem a seleção.
- **Entra:**
  - cadeado por marcação e por imagem, na Árvore e nos Detalhes, com atalho de teclado e a ação "Trancar todas as marcações desta imagem";
  - a trava bloqueia mover, redimensionar e excluir; a seleção continua livre;
  - trancar um pai trava a geometria dos descendentes; já um descendente trancado nunca impede o pai: mover o pai leva os descendentes trancados junto (mantendo a posição relativa) e excluir o pai com descendentes trancados é permitido, com a confirmação informando quantos itens trancados serão excluídos;
  - cadeado visível no canvas, na seleção e sob o cursor;
  - gravado no `mapping.json` (`locked`), com nova versão de schema e migração, e com desfazer;
  - itens vindos do Figma (etapa 4) já são somente leitura; a trava é para os itens manuais;
  - ao criar um projeto numa pasta, gravar também um `.gitignore` com `backups/`;
  - na tela inicial, um texto curto recomendando o formato pasta para quem versiona com git;
  - no campo "Pertence a", uma linha de ajuda explicando que só aparecem anotações da mesma marcação em outras camadas, e uma mensagem quando não houver nenhuma opção;
  - testes para os atalhos de teclado (`useEditorShortcuts`).
- **Depende de:** etapa 2.3 (Árvore e Detalhes do redesign).
- **Entregue:** schema v5 (`locked`, migração e backup), regras em `src/model/locks.ts`, cadeado na Árvore, em Detalhes e no canvas, atalho `Alt+L`, "Trancar todas as marcações desta imagem" e os ajustes listados acima. Referência: [`FORMAT.md`](FORMAT.md) (campos da v5) e [`ARCHITECTURE.md`](ARCHITECTURE.md); histórico em [`history/PLAN-etapa-2-5.md`](history/PLAN-etapa-2-5.md).

## Etapa 3 — Servidor MCP (concluída)

- **Estado:** a **etapa 3 está concluída**: a **3a (base)** (fases 3a.1 a 3a.6; uso em [`MCP.md`](MCP.md); histórico em [`history/PLAN-etapa-3a.md`](history/PLAN-etapa-3a.md)) e a **3b (referências de código)** (fases 3b.1 a 3b.5; histórico em [`history/PLAN-etapa-3b.md`](history/PLAN-etapa-3b.md)).
- **Objetivo:** um agente criar e consultar projetos direto na pasta, reutilizando o modelo da app.
- **Decisões técnicas (tomadas):**
  - **Servidor:** MCP local em TypeScript, rodando por linha de comando (stdio) com o Node, lendo e gravando direto na pasta do projeto, sempre pelo `src/model/`.
  - **Onde ficam os mapeamentos:** dentro do repositório do app (ex: `design/mapeamentos/`), com um `.mcp.json` versionado que registra o servidor e a pasta raiz relativa (`--root`, com apelidos se houver mais de uma raiz).
  - **Distribuição:** um arquivo único `mapping-mcp.js` publicado nas Releases do GitHub; cada repositório de app guarda uma cópia em `tools/`.
  - **Alcance:** só projetos em pasta ficam ao alcance do MCP.
  - **Referência copiável:** `mapping://<projeto>/<m|i|a>/<código curto> (<caminho legível>)` para marcações, imagens e anotações. O código curto tem 8 caracteres derivados do id (mais caracteres se houver colisão) e é aceito por todas as tools. Na app, a ação "Copiar referência" fica na Árvore, nos Detalhes e no menu de contexto do canvas.
  - **Recorte:** tool `get_marking_image` (margem, destaque na imagem inteira, contorno das filhas, tamanho máximo), com biblioteca de imagem em WebAssembly. Na app, a ação "Copiar recorte" põe a imagem na área de transferência.
  - **Formato das tools:** leitura granular e escrita em lote com prévia e confirmação.
  - **Concorrência:** número de revisão no `mapping.json` para evitar sobrescrita entre a app e o MCP; a app percebe mudanças externas e recarrega.
- **Entra:**
  - **3a, Base:** criar e abrir projetos, aplicar especializações, adicionar imagens, camadas, marcações e anotações, leitura com recorte por marcação, especializações expostas para orientar o agente.
  - **3b, Referências de código:** especialização v2 com plataformas e mapeamento de código por tipo, campo `codeRef` nas instâncias, repositório por plataforma no projeto.
  - Telas novas desenhadas no Claude Design com o design system 2.0.
- **Depende de:** etapa 2.3 (design system 2.0 para as telas novas). O `src/model/` já é independente de navegador.
- **Entregue (3a):** servidor `mapping-mcp.js` (stdio, arquivo único), referências `mapping://`, leitura granular, recorte (`get_marking_image`), escrita em lote com prévia (`plan_changes` + `apply_changes`; este saiu na etapa 4, que o trocou pelas propostas) e número de revisão para convivência com a app.
- **Entregue (3b):** especialização `formatVersion` 2 (`platforms`, `code` por tipo e campo `codeRef`; a v1 continua aceita), schema v7 (`platformRepos` e o valor do `codeRef` com `_id` por entrada), funções puras `codeLink`, `codeBlueprint` e `findByCode`, pendências de `codeRef` (incompleta) e aviso de plataforma sem repositório, editor e exibição do `codeRef` na app com "Abrir no repositório" e "Copiar caminho", repositórios por plataforma nas Configurações, e no MCP `get_code_hints`, `find_by_code`, `codeRefs` resolvidos em `get_marking` (com `localFile`/`exists`, sem nunca ler código) e `set_platform_repo`/`remove_platform_repo` no lote. O princípio se manteve: nenhum nome de plataforma no código do núcleo (`src/` e `mcp/`). Referência: [`SPEC-FORMAT.md`](SPEC-FORMAT.md), [`FORMAT.md`](FORMAT.md), [`MCP.md`](MCP.md) e [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

## Etapa 4 — Propostas de alteração com revisão (concluída)

- **Objetivo:** toda alteração feita por um agente chega como uma proposta (um "pull request" dentro da ferramenta). O usuário vê o projeto como ficaria, aceita ou rejeita em qualquer nível (proposta, imagem, item ou mudança), deixa notas no que rejeitou, e o agente manda uma nova proposta corrigida. Vale para a primeira importação e para as atualizações.
- **Genérica:** não sabe de onde vêm os dados. Importar do Figma, migrar telas antigas ou corrigir anotações são usos conduzidos por skills dos agentes (ver Evoluções).
- **Entregue:**
  - **Formato e modelo** (fases 4.1 e 4.0): proposta em `proposals/<id>/proposal.json` (`formatVersion` 1), com as mudanças calculadas pelo servidor (valor antes e depois), decisões em quatro níveis (proposta, imagem, item, mudança) com "parcial" e dependências, conflitos, aviso de item trancado, validação do conjunto aceito e aplicação parcial (uma entrada de desfazer). Schema v8 com `source` (identidade externa genérica) em imagens e marcações, e especialização `formatVersion` 3 com `sources` nos tipos e nos campos (`findBySource`, `findTypesBySource`). Referência: [`PROPOSAL-FORMAT.md`](PROPOSAL-FORMAT.md), [`FORMAT.md`](FORMAT.md) e [`SPEC-FORMAT.md`](SPEC-FORMAT.md).
  - **MCP 0.3.0** (fase 4.2): `propose_changes`, `list_proposals`, `get_proposal`, `get_proposal_review`, `withdraw_proposal`, `find_by_source`, `find_types_by_source` e `validate_specialization`; operações aceitam `source`; **sai o `apply_changes`**: o agente nunca grava o `mapping.json`. Uso em [`MCP.md`](MCP.md) e [`AGENT-GUIDE.md`](AGENT-GUIDE.md).
  - **App** (fases 4.3 e 4.4): janela Propostas, modo revisão (projeto somente leitura, canvas com Atual / Proposto, Árvore e Detalhes com selos, antes e depois, decisões de três estados, notas, filtros e atalhos), retomada da revisão (inclusive depois de fechar a app), propostas também em projetos locais e no zip, e o exemplo `examples/proposta-exemplo.zip`. Desktop e celular, temas claro e escuro.
  - **Fechamento** (fase 4.5): documentação, roteiro de teste manual executado e a tag `mcp-v0.3.0` (criada pelo dono). Histórico em [`history/PLAN-etapa-4.md`](history/PLAN-etapa-4.md).
- **Depende de:** etapa 3 (concluída).

## Etapa 5 — Pré-voo para uso real (em andamento)

- **Objetivo:** fechar, antes dos testes com pessoas, os achados da avaliação de arquitetura de 2026-10-10 que causam perda de dados silenciosa ou impedem o testador de relatar o que viu. Só correções, sem funcionalidade nova nem mudança de formato.
- **Entra:** autosave gravando só o projeto confirmado; aplicar aceitas só conclui se o `mapping.json` gravou; projeto inconsistente abre reparado com backup (ou lista exatamente o que está errado); Diagnóstico com erros globais e identificação do build; gravação ao sair da página e sem atraso nas operações caras; deploy rodando tudo que o CI roda, Node fixado, Dependabot; MCP com stdout limpo e limites de memória (0.3.1); guia do testador (`docs/TESTING.md`) com os roteiros consolidados e o template de registro do marco.
- **Detalhamento:** [`PLAN.md`](../PLAN.md). Desenhada para execução por um coordenador de agentes, em três ondas.
- **Depende de:** etapa 4 (concluída).

## Marco — Uso real

- **Objetivo:** usar a ferramenta em trabalho de verdade antes de qualquer evolução.
- **Antes de começar:** decidir onde os projetos moram (recomendado: repositório git).
- **Registrar:** telas mapeadas, devs que consultam, telas implementadas por agentes a partir da ferramenta e uma lista do que atrapalhou (template em `docs/TESTING.md`, fase 5.8).
- **Depende de:** etapa 5; as evoluções só começam depois dele.

## Evoluções

Só depois do marco, se a ferramenta se provar útil.

- Biblioteca de componentes do DS importada do Figma e telas compostas (núcleo agnóstico; saídas como SDUI ou código definidas por especializações).
- Agentes gerando telas a partir da biblioteca e migração de Figmas antigos para o DS novo por inferência sobre as imagens.
- Skills para agentes que usam as propostas: importação e reexportação a partir do Figma (com `source` para reconhecer os elementos e o mapeamento componente → tipo vindo da especialização), migração de telas antigas por inferência sobre as imagens.
- Reverter, depois de aplicada, uma mudança específica de uma proposta.
- Editor de especializações dentro da app.
- Paleta de comandos e busca global (antiga R10).
