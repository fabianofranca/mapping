# Orçamentos do layout medidos no runner — [Não lançado] (épico `epic/orcamentos-layout-runner`, MCP sem mudança, schema v19)

## Alterado

- Os tetos dos dois orçamentos de 4 ms do layout (grade com texto e intrínseco aninhado em 3 níveis, `test:perf`) passam a ser medidos no runner: 6 e 6,5 ms (o maior valor da 1ª tentativa no CI × 1,25, arredondado ao 0,5 ms). Só os testes mudam; nada muda para quem usa a app ou o MCP.
