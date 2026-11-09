# Testes de crescimento estáveis — [Não lançado] (épico `epic/escala-estavel`, PR #1212, MCP 0.28.11, schema v18)

## Alterado

- Testes de crescimento (`npm run test:scale` e os casos de crescimento do `npm run test:perf`): medição n/4n intercalada (gc por par, ordem alternada, aquecimento igual nos dois tamanhos) e teto de 6× calibrado pela medição; só os testes mudam, nada muda para quem usa a app ou o MCP.

## Corrigido

- Visualizador e editor de componentes: atualizar uma tela com milhares de instâncias deixa de custar tempo quadrático (a ordem de desenho, `renderOrder`, passa a ser calculada em um passo só; a ordem não muda). O MCP sobe para 0.28.11 só porque `src/model/components/screen.ts` vai na release; o resto da etapa muda apenas testes.
