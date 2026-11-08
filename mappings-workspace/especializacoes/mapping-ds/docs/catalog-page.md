# CatalogPage

Página de um componente no catálogo (`src/ui/catalog/CatalogPage.tsx`): à direita da lista na tela do catálogo, ou dentro do Dialog `lg` na janela Catálogo. É um **agrupador**: o `.catalog-page` é só uma coluna com 16 px entre as seções, sem fundo nem borda.

**Filhos esperados**, de cima para baixo: o cabeçalho (nome em Texto `t-title`, "id · camada" em `muted`, a descrição em Texto e, com projeto, o Button "Adicionar à tela"); o documento (título "Documento" em `t-heading` e o markdown: títulos, parágrafos, código em linha, tabelas em Caixas com borda e raio `lg`); Propriedades (a tabela dos campos); Código (por plataforma); Origens; a galeria de exemplos (o desenho de cada um numa Caixa) e o playground (os campos, o tamanho e o palco). Só apresentação: nada aqui altera o projeto.
