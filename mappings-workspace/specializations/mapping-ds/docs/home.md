# Home

Tela inicial da app (`src/app/Home.tsx`, `.home-desktop` em `src/theme/layout.css`), antes de abrir um projeto. Desenha **só a moldura** da tela:

- o fundo `color-bg` (o do `body`);
- a coluna lateral de 240 px (`size-home-side`), em `color-surface`, com a divisória `color-border` de 1 px à direita, na altura toda.

Dê à marcação o tamanho da janela (a tela medida tem 1440 × 900). **Filhos esperados:**

- na coluna, com 16 × 12 px de margem e 16 px entre os blocos: a marca (Ícone do logo em `accent` e o Texto "Mapping" `t-title`) e a navegação (cada item tem 28 px; o atual é uma Caixa `fundo` `selection` com raio `sm`, mais o Ícone e o Texto `t-body-strong`; os outros, só Ícone e Texto `t-body`);
- na área principal, centrada com no máximo 960 px (`size-home-main`) e 24 px de margem: o título "Começar" (Texto `t-title`), os Buttons (Novo projeto é `primary`; Abrir pasta, Abrir zip e Abrir biblioteca), a dica (Texto `t-small` `muted`), o aviso de arquivo (Caixa `warning-bg` com Texto `warning`), "Projetos recentes", a busca (TextField) e a tabela de projetos (Caixas da tabela e das linhas, Textos, Selo da origem e os Buttons `sm` Abrir e Excluir).

Não desenha o estado de carregamento ("Carregando…") nem os diálogos iniciais (Novo projeto, pasta), que são Dialogs à parte.
