# CR da app, armazenamento, visualizador, scripts e CI — [Não lançado] (épico `epic/cr-app-infra`, PR #0, MCP sem mudança, schema v18)

## Corrigido

- Soltar uma imagem e outro arquivo (que não é imagem) sobre uma imagem existente não troca mais a imagem: ela entra como imagem nova e o aviso dos arquivos ignorados aparece. A troca só acontece com exatamente um arquivo solto, a mesma regra do destaque ao arrastar.
- Colar uma imagem (Ctrl+V) com uma importação em andamento é ignorado, como o soltar; antes duas importações zeravam o progresso uma da outra.
- Ctrl+E com uma importação ou troca em andamento não exporta mais, como os botões.
- Ctrl+Shift+= (Ctrl++) aproxima o zoom do canvas, como Ctrl+=, em vez de cair no zoom do navegador.
