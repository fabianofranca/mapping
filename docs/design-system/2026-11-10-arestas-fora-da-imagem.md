# Arestas do conteúdo fora da imagem — 2026-11-10 (épico `epic/arestas-fora-da-imagem`)

## Pendências

- `.ref-control` (Detalhes, `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx`): o controle passa a vir dentro do `Tooltip` (no lugar do `title` nativo), com o alvo, a camada e a dica de atalho por inteiro; a âncora do `Tooltip` ocupa a largura do campo. O rótulo do alvo já tem prioridade sobre o nome da camada (`.ref-control-layer` cede primeiro). Sem token novo; nada muda a 1280×720.
- Célula `ref` da tabela (`.ref-cell`, CL1): sem largura mínima própria, o ✕ desce para a linha de baixo quando a coluna é estreita e o ícone some na tabela (CL2 removeu o token `size-grid-ref-col-min`, que fazia a tabela rolar na horizontal a 1280 e 900 px): a coluna divide a tabela como as outras. O ✕ não estica mais (só a âncora do controle), o controle encolhe dentro da célula e a referência quebrada quebra entre as palavras, sem corte. `.ref-control-layer` passa a encolher com fator `1000000`. Nos temas claro e escuro só usam tokens de cor já existentes.
- Revisão do épico: no campo `ref` dos Detalhes só a âncora do controle estica (`.ref-field > .tooltip-anchor:first-child`); as dos botões ↗ e ✕ mantêm o tamanho do botão (antes do ajuste, o `Tooltip` esticava cada uma a uma linha inteira). Sem token novo.

## Sincronização

Não gravado: a ferramenta Artifact foi negada pelo classificador de permissões neste fechamento (ver abaixo). Nenhuma versão do artefato mudou; o índice não foi tocado.

## Ficou sem gravar

Motivo: `Artifact` (publish) em https://claude.ai/artifact/HEoYNh91CqK1YDDpjXBxi9 negado pelo classificador de permissões (External System Writes); a leitura funcionou. A troca exata, a gravar num próximo passo (guias curados à mão, sem `/design-sync`; o índice por último, lido imediatamente antes):

1. `project/components/ReferenceField/README.md`:
   - em "O que o consumidor fornece", trocar "O `title` traz o alvo inteiro e a camada." por "O controle vem dentro do `Tooltip` (no lugar do `title` nativo), que traz o alvo inteiro, a camada e a dica de atalho; a âncora dele ocupa a largura do campo e as dos botões ↗ e ✕ mantêm o tamanho do botão.";
   - em "Largura estreita", trocar `flex: 0 100 auto` por `flex: 0 1000000 auto` e acrescentar "O rótulo do alvo tem prioridade: a camada cede primeiro e o nome aparece inteiro a 900×720, com o texto completo no tooltip."; trocar "na célula de tabela (RefCell) nada muda" por "na célula de tabela (RefCell) veja o guia dela".
2. `project/components/RefCell/README.md`, em "Medidas e tokens", acrescentar: o botão vem dentro do `Tooltip` (alvo e dica de atalho inteiros); a coluna `ref` não tem largura mínima própria e divide a tabela como as outras, sem rolagem horizontal; o ícone do botão some, o ✕ desce para a linha de baixo quando a coluna é estreita e "(referência quebrada)" quebra entre as palavras, sem corte.
3. `project/design-system.json`: só `lastChange` (`by` "Claude", `at` 2026-11-10, `via` "claude", `note` "Fechamento do epic/arestas-fora-da-imagem: guias de ReferenceField e RefCell").

Sem token, ícone nem controle novo; os previews de `ReferenceField` e `RefCell` não foram alterados (conferir se o `title` nativo que eles imitam precisa virar o tooltip).
