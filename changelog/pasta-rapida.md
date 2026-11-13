# Pasta rápida — [Não lançado] (épico `epic/pasta-rapida`, PR #0, MCP sem mudança, schema v19)

## Adicionado

- O texto copiado do Diagnóstico, com projeto em pasta, traz a linha `folder:` com as chamadas à pasta e o tempo da última operação de cada tipo (abrir, gravar, gravar com pacote de biblioteca, decidir, aplicar proposta e conferir alterações externas); sem projeto em pasta, a linha não existe.

## Alterado

- Abrir um projeto em pasta, gravar, aceitar uma proposta e aplicar ou atualizar uma especialização acessam bem menos a pasta (mais rápido em pastas lentas, como a do Android e as sincronizadas com a nuvem): cada pasta é resolvida uma vez e reaproveitada, o `mapping.json` é conferido com uma leitura só, os arquivos independentes são lidos e gravados quatro de cada vez, e atualizar uma especialização só confere de novo a biblioteca dela.
