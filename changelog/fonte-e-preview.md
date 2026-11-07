# Fonte e preview — [Não lançado] (épico `epic/fonte-e-preview`, PR #755, MCP 0.25.1, schema v15)

## Adicionado

- A validação da biblioteca (`validate_library` e a janela da biblioteca na app) avisa quando um `font.family` literal não é uma família que o CSS aceita (item vazio, aspas sem fechar, aspas no meio de um nome), com o caminho do nó e o valor. É aviso, não erro: o desenho cai em `sans-serif` com o tamanho e o peso do componente.

## Corrigido

- Componente com `font.family` em pilha CSS (ex.: a do tema) ou num nome genérico (`system-ui`) desenha o texto com a família, o tamanho e o peso pedidos; antes caía em 10px sans-serif sem aviso (na app e no visualizador embutível).
