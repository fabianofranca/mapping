# CI preso na fila: fechar e reabrir o PR com o "sim" do dono — 2026-11-11 (épico `epic/ci-preso-na-fila`, PR #1674, MCP sem mudança, schema v18)

## Corrigido

- Fluxo automatizado: a execução do CI de um PR que fica em `queued` sem nenhum job (o `ci-rerun.yml` não a vê, porque só age em execução que terminou) deixa de ser lida como "o CI ainda roda" para sempre. O critério é medido por `node scripts/ci/ciRerun.mjs queued` (execução mais recente do `ci.yml` no commit do PR, em `queued`, sem jobs, há mais de 15 min), e não pela impressão de quem lê o CI.
- A fase avisa o coordenador ("CI preso na fila: <link>") e segue esperando, sem fechar, reabrir nem reexecutar. O coordenador pergunta ao dono, no chat da fila, "Fecho e reabro o PR #<n> para criar uma execução nova do CI?"; com o "sim" ele fecha e reabre o PR uma vez por commit e volta a ler o CI. Se a execução nova também ficar presa, é instabilidade do GitHub: o dono é avisado e nada se repete. O commit vazio continua proibido, e "o coordenador não roda o CI de novo" vale fora desse caso.
- `docs/FLOW.md` ("Para a sessão da fase", item 6, e "CI e preview") e o skill `implementar-fila` ("Por etapa") descrevem o caso; a proibição de "fechar e reabrir PR para rodar o CI" ganha a exceção da execução presa na fila.
