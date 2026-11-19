# CatalogScreen

Tela cheia do catálogo de uma biblioteca aberta pela tela inicial (**Abrir biblioteca**, pasta ou zip do pacote), sem projeto (`src/app/CatalogScreen.tsx`; `.catalog-screen` em `src/theme/layout.css`). Desenha a moldura: o fundo `color-bg` e a divisória `color-border` de 1 px sob a barra, que tem 44 px (8 px de margem em cima e embaixo de um Button de 28 px).

Dê à marcação o tamanho da janela (a tela medida tem 1440 × 900). **Filhos esperados:**

- na barra, com 16 px de margem lateral e 12 px entre eles: o Button "Voltar à tela inicial" (com o ícone `arrowLeft`), o nome da biblioteca (Texto `t-title`) e a versão ("versão 4", Texto `t-body` `muted`);
- o catálogo, com 16 px de margem: a validação ("Pacote válido, sem erros nem avisos.", Texto `muted`), a lista (360 px, `size-tw-right`: a busca TextField, o nome da camada em Texto `t-small` `muted` e uma linha por componente, a atual numa Caixa `fundo` `selection` raio `sm`) e, ao lado, a página do componente (CatalogPage).

Sem projeto não há "Adicionar à tela" nem links para o repositório.
