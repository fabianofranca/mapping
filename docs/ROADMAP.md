# Roadmap

Ordem das etapas do Mapeador de Imagens. Este documento só dá a direção: o detalhamento das fases fica no [`PLAN.md`](../PLAN.md) quando a etapa começar.

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
- **Entregue:** schema v5 (`locked`, migração e backup), regras em `src/model/locks.ts`, cadeado na Árvore, em Detalhes e no canvas, atalho `Alt+L`, "Trancar todas as marcações desta imagem" e os ajustes listados acima. Referência: [`FORMAT.md`](FORMAT.md) (campos da v5) e [`ARCHITECTURE.md`](ARCHITECTURE.md); o plano da etapa fica em [`PLAN.md`](../PLAN.md) até ser movido para o histórico.

## Etapa 3 — Servidor MCP

- **Objetivo:** um agente criar e consultar projetos direto na pasta, reutilizando o modelo da app.
- **Decisões técnicas em discussão:** onde roda (local por stdio, remoto ou WebMCP); linguagem (TypeScript reaproveitando `src/model/` ou outra); concorrência entre a app e o MCP no mesmo projeto; formato das tools (leitura granular e escrita em lote com prévia); imagens no servidor; distribuição.
- **Entra:**
  - **3a, Base:** criar e abrir projetos, aplicar especializações, adicionar imagens, camadas, marcações e anotações, leitura com recorte por marcação, especializações expostas para orientar o agente.
  - **3b, Referências de código:** especialização v2 com plataformas e mapeamento de código por tipo, campo `codeRef` nas instâncias, repositório por plataforma no projeto.
  - Telas novas desenhadas no Claude Design com o design system 2.0.
- **Depende de:** etapa 2.3 (design system 2.0 para as telas novas). O `src/model/` já é independente de navegador.

## Etapa 4 — Sincronização com o Figma

- **Objetivo:** trazer para o projeto os dados do Figma e mantê-los em sincronia, sem perder o que foi anotado.
- **Entra:**
  - identidade e dono dos dados vindos do Figma (`source`);
  - dados do Figma somente leitura ou editáveis com controle de divergência (opção por projeto);
  - mapeamento Figma → tipos na especialização, só com a hierarquia significativa;
  - pendência "fora do design system";
  - tools `preview_sync` e `apply_sync`, por página ou nó;
  - pendência "removida no Figma";
  - relatório na app e skill de exportação para o agente;
  - telas no Claude Design.
- **Depende de:** etapa 3 (servidor MCP e referências de código nas especializações).

## Marco — Uso real

- **Objetivo:** usar a ferramenta em trabalho de verdade antes de qualquer evolução.
- **Antes de começar:** decidir onde os projetos moram (recomendado: repositório git).
- **Registrar:** telas mapeadas, devs que consultam, telas implementadas por agentes a partir da ferramenta e uma lista do que atrapalhou.
- **Depende de:** o que já estiver pronto das etapas anteriores; as evoluções só começam depois dele.

## Evoluções

Só depois do marco, se a ferramenta se provar útil.

- Biblioteca de componentes do DS importada do Figma e telas compostas (núcleo agnóstico; saídas como SDUI ou código definidas por especializações).
- Agentes gerando telas a partir da biblioteca e migração de Figmas antigos para o DS novo por inferência sobre as imagens.
- Editor de especializações dentro da app.
- Paleta de comandos e busca global (antiga R10).
