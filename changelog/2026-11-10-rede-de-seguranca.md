# Rede de segurança da fila — 2026-11-10 (épico `epic/rede-de-seguranca`, PR #1434, MCP 0.30.0 sem mudança, schema v18)

## Adicionado

- `scripts/ci/riskTriggers.mjs --base <ref>`: decide os gatilhos da `/code-review high` no Fechamento do épico. Imprime `gatilho: <id>: <arquivos>` por gatilho atingido, ou `nenhum gatilho`; erro de uso sai com 2. Cobre os caminhos de risco (skills `implementar-fila` e `detalhar-backlog`, `painel.py`, `docs/FLOW.md` e `docs/PROCESS.md` por qualquer mudança, workflows, release, `mcp/version.ts`, `src/store/session.ts`, `pwa/csp.ts`) e a mudança de uma constante de versão do schema ou de formato em `src/model/` (`git diff -G`, com sufixo como `COMPONENT_FORMAT_VERSION_REPEAT`); o `formatVersion` dos JSON de `libraries/` e os arrays de versões aceitas não contam. Arquivo de gatilho renomeado ainda conta (`--no-renames`).
- `painel.py`: campo `wait` na linha da fila para a filha que espera o coordenador. `show` não a lista como atrasada e imprime `esperando o coordenador: …` (ou `nenhuma`). Trocar ou limpar `child` também limpa o `wait`.
- `tests/support/textSlice.ts` (`section` e `between`): recortes de texto que lançam erro quando falta uma âncora.

## Alterado

- `implementar-fila`, "Fechamento": o item "rede de segurança" roda o `riskTriggers.mjs` e decide pela linha `gatilho:`, sem lista de caminhos própria. `detalhar-backlog` ganha a frase de que o script e a lista de "Esforço do detalhamento" mudam juntos.
- `implementar-fila`, "Conferências de reserva": a filha `review_ready` ou `idle` com um `send_later` ainda por disparar (ou disparado há menos de 5 min) só recebe `childAt=now`, sem mensagem; o pior caso de detecção (~60 min, ~90 min logo depois de criada ou cutucada) está escrito. "Por etapa" › 2 diz quando o `wait` é gravado e limpo.
- `implementar-fila`, "Troca de sessão": a releitura do skill pequeno é com `Read` sem `offset` nem `limit`, com a prova "skill <commit>: relido inteiro, <n> linhas", e não se delega nem se resume (novo item em "Economia de contexto").
- Teto do `dist/index.html`: a subida automática (de 16 KiB) só vale com excesso de até 14 KiB (14.336 bytes), para sobrar ao menos 2 KiB de margem; acima disso o `distBudget.mjs` chama o dono.
- `tests/tooling/queuePanel.test.ts` e `queueNoWait.test.ts`: sem recorte por `indexOf`, sem contagens frágeis e sem `const process` sombreando o global.

## Corrigido

- `docs/FLOW.md`: o parágrafo "Para implementar em sequência" ainda dizia "mais de 30 linhas ou seções de regra" para o skill novo grande; passa a "mais de 60 linhas alteradas ou mudança em "Regras desta fila"", com a releitura por `Read` e prova no `log`.
