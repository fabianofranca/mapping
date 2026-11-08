# Testes de escala — 2026-11-08 (épico `epic/testes-escala`, PR #1072, MCP 0.28.5, schema v18)

## Adicionado

- `npm run test:scale` mede a mesma operação do modelo com 1.250 e 5.000 marcações e exige que o tempo cresça menos de 5× (um crescimento quadrático seria ~16×); roda no CI depois dos orçamentos de desempenho. A fase seguinte acrescentou a sessão (gravar e abrir), o estado derivado do editor, as tools de leitura do MCP em processo (`get_project`, `list_markings`, `get_marking`, `get_annotation`, `find_by_code`, `find_by_source`, `list_threads`) e o visualizador (montar a cena e atualizar uma instância), até 5.000 marcações. Sem mudança no uso da app nem das tools do MCP.

## Alterado

- O CI passa a provar o crescimento linear do projeto grande, até 5.000 marcações: ler, gravar, validar, montar a lista, o estado derivado, as consultas do MCP e o visualizador têm de crescer menos de 5× quando o projeto cresce 4×. A versão do MCP sobe para 0.28.5 porque o épico mexeu em código de `src/model/` que vai na release (abaixo).

## Corrigido

- A lista (`buildListing`) e a janela de pendências (`buildIncompleteList`) percorriam todas as marcações da raiz para cada container (custo proporcional a containers × raízes); agora agrupam as raízes por container numa passada só. Em projetos com muitos containers a lista e as pendências abrem mais rápido; o resultado é o mesmo.
