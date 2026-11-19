# LibraryIssueList

Os problemas de uma biblioteca (erros e avisos da validação), em lista compacta (`src/ui/LibraryIssueList.tsx`): na revisão de um pacote do SpecsDialog e no Diagnóstico. A lista rola sozinha (`max-height: 40vh`), então 42 avisos não esticam o diálogo.

## O que o desenho mostra

A caixa `.library-issues`: borda `color-border`, raio 8 (`radius-lg`) e 8 px de margem (slot *Grupos*). Sem fundo próprio.

## Filhos esperados

Um grupo por arquivo, na ordem em que o arquivo aparece:

- o nome do arquivo (Texto `t-code`; *pacote* quando o problema é do pacote) e a contagem entre parênteses (Texto `muted`);
- uma linha por problema: o selo da gravidade, o caminho dentro do arquivo (Texto `t-code`) e a mensagem (Texto, parágrafo, com o lugar do selo e do caminho no começo da primeira linha). O selo de aviso é o Selo `preview` (`.badge-warning`); o de erro (`.library-issue-error`) é uma Caixa `danger-bg` com borda `danger` e raio 4 e o Texto `t-micro` `danger`.

## O que fica de fora

A barra de rolagem não é desenhada; o que passa da altura fica cortado.
