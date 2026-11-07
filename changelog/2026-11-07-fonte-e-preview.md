# Fonte e preview — 2026-11-07 (épico `epic/fonte-e-preview`, PR #755, MCP 0.25.1, schema v15)

## Adicionado

- `create_marking` com `annotation` avisa (`ignored-argument`) quando o tipo declara componente e o lote não o acha (arquivo ausente, ilegível ou com problema): "o tipo … declara componente, mas …: a anotação foi criada sem o preview e sem o tamanho mínimo".
- A validação da biblioteca (`validate_library` e a janela da biblioteca na app) avisa quando um `font.family` literal não é uma família que o CSS aceita (item vazio, aspas sem fechar, aspas no meio de um nome), com o caminho do nó e o valor. É aviso, não erro: o desenho cai em `sans-serif` com o tamanho e o peso do componente.

## Corrigido

- `create_marking` com `values` parciais completa os outros campos com o `preview` do componente também depois de `apply_specialization` ou `update_specialization` no mesmo lote (o catálogo do lote acompanha as especializações do lote; `rect` opcional e `minSize` valem na versão nova), e `addComponentMarking` com `values` passa a aplicar o `preview` nos campos ausentes.
- Componente com `font.family` em pilha CSS (ex.: a do tema) ou num nome genérico (`system-ui`) desenha o texto com a família, o tamanho e o peso pedidos; antes caía em 10px sans-serif sem aviso (na app e no visualizador embutível).
