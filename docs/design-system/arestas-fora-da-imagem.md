# Arestas do conteúdo fora da imagem — [Não lançado] (épico `epic/arestas-fora-da-imagem`)

## Pendências

- `.ref-control` (Detalhes, `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx`): o controle passa a vir dentro do `Tooltip` (no lugar do `title` nativo), com o alvo, a camada e a dica de atalho por inteiro; a âncora do `Tooltip` ocupa a largura do campo. O rótulo do alvo já tem prioridade sobre o nome da camada (`.ref-control-layer` cede primeiro). Sem token novo; nada muda a 1280×720.
- Célula `ref` da tabela (`.ref-cell`, CL1): sem largura mínima própria, o ✕ desce para a linha de baixo quando a coluna é estreita e o ícone some na tabela (CL2 removeu o token `size-grid-ref-col-min`, que fazia a tabela rolar na horizontal a 1280 e 900 px): a coluna divide a tabela como as outras. O ✕ não estica mais (só a âncora do controle), o controle encolhe dentro da célula e a referência quebrada quebra entre as palavras, sem corte. `.ref-control-layer` passa a encolher com fator `1000000`. Nos temas claro e escuro só usam tokens de cor já existentes.
