# Planejamento nas issues — 2026-11-02 (épico `epic/fluxo-issues`, PR #307, MCP 0.12.0, schema v13)

## Alterado

- O roadmap e o plano das etapas passam a viver em issues do GitHub: os itens futuros têm o rótulo `roadmap`, a etapa em andamento tem o rótulo `etapa`, com uma sub-issue (rótulo `fase`) por fase; a issue fechada é o histórico.
- `PLAN.md` e `docs/ROADMAP.md` saíram do repositório. O histórico da etapa Marcação pai foi arquivado em `docs/history/PLAN-etapa-marcacao-pai.md`, o último no formato antigo.
- O índice da documentação de referência está no `README.md` e o do histórico, em `docs/history/README.md`.
- Limpeza do repositório: saíram `docs/history/` (planos das etapas, prompts antigos, auditoria e relatos de teste), `docs/redesign/` e `docs/sdui/`; o git guarda essa história. As regras que o código ainda citava foram para o `docs/ARCHITECTURE.md` ou para o próprio comentário.
- O visualizador embutível mudou de `lab/viewer/` para `viewer/`, com a demonstração em React em `viewer/demo/` (`npm run dev:viewer`) e as bibliotecas de exemplo em `viewer/samples/`. O pacote `mapping-viewer`, o `npm run build:viewer` e o `dist-viewer/` não mudam.
- O laboratório de componentes saiu, com o `dist/lab/` publicado ao lado da app e os scripts `dev:lab`, `dev:lab:react` e `build:lab`.
- O testador da nuvem (sessão do Claude Code no ambiente "Mapping - testes") é o único agente testador: o prompt do Cowork (`docs/TESTING-COWORK.md`) saiu, o `docs/TESTING-NUVEM.md` passou a valer sozinho, junto com o `docs/TESTING.md`, e a cobertura de Windows/Edge por agente deixou de existir. Os roteiros sob demanda continuam manuais, feitos pelo dono.
- O relato de uma rodada de teste passa a ser um comentário na sub-issue da fase testada (em partes, se passar de 65 mil caracteres), com aviso ao coordenador; não há mais PR de relato.
- Fluxo automatizado com três chats (roadmap, detalhamento e implementação): o chat de implementação orquestra uma sessão por fase, e cada uma mescla o próprio PR no épico com o CI verde; depois chama o testador, corrige uma vez se houver ❌ e só chama o dono para confirmar o merge do épico na `main`. As mensagens prontas estão em `docs/FLOW.md`.
- A tabela de modelos da etapa ganha a linha Orquestrador (padrão Sonnet).
- Nada muda na app nem no servidor MCP.
