# CodeDefinitions

A linha **Definição** de uma anotação tipada (`src/ui/CodeDefinitions.tsx`, `.code-definitions`): o arquivo que define o símbolo do `code` do tipo, uma entrada por plataforma. Sem fundo nem borda: a marcação agrupa a coluna do valor (o rótulo "Definição" e o HelpTip ficam na PropertyGrid).

Cada entrada é: o texto "<plataforma> · <arquivo>" (Texto `t-body`, "Web (Preact) · Segmented.tsx"; a dica tem o caminho e o símbolo), o IconButton **Abrir no repositório** (`externalLink`, só quando o `repo` da plataforma tem `urlTemplate`) e o IconButton **Copiar caminho** (`copy`). As entradas ficam em coluna, 2 px entre elas; os botões quebram para a linha de baixo quando não cabem.
