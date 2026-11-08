# Build resistente à ordem dos plugins — [Não lançado] (épico `epic/ordem-plugins-build`, PR #1065, MCP 0.28.4, schema v18)

## Corrigido

- O `npm run build` não quebra mais com o `vite-plugin-singlefile` 2.3.4 ou mais novo: a CSP e o service worker passam a rodar sempre depois de o JS e o CSS serem embutidos no `index.html`, qualquer que seja a versão do plugin.
