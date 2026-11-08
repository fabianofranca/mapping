# ThreadsSection

A seção **Conversas** dos Detalhes (`src/ui/comments/ThreadsSection.tsx`). Sem desenho próprio: agrupa o cabeçalho (Ícone `chevronDown` `muted`, Texto `t-heading` "Conversas" e o Button `sm` **Nova**) e as linhas da lista. Cada linha (`.thread-row`, 4 × 8 px de margem, raio 4) é uma Caixa (`selection` quando é a aberta) com Iniciais, o assunto (Texto `t-body`, `t-body-strong` se não lida), o "em …" (Texto `t-small` `muted`) e a contagem (Texto `t-small` `muted`).
