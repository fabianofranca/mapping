# Mensagens do modelo na língua da app — [Não lançado] (épico `epic/mensagens-modelo`, PR #1512, MCP 0.31.1, schema v18)

## Corrigido

- Com a app em English (US), os problemas que o validador da biblioteca monta (janela do pacote em **Especializações**, Diagnóstico e Catálogo) saem em inglês, como "file not referenced by the specialization", "empty document" e "file not found: …". Em Português o texto é o mesmo de antes, e a saída do `validate_library` e do `plan_library_update` não muda. Os avisos de desenho dentro da lista seguem com o texto do motor até a fase do motor de desenho.
- Com a app em English (US), os erros da especialização (campos, sugestões, `code`, exemplos, onde se aplica, filhos permitidos, documentos, papéis, grupos, tipos e camadas) e os textos padrão do zod (tipo inválido, propriedade desconhecida, valor inválido) saem em inglês na lista de problemas da biblioteca; em Português, os textos padrão do zod saem traduzidos. O `message`, os `errors` e a saída do `validate_specialization` não mudam.

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 1.966.080 para 1.982.464 bytes, pela regra do orçamento (as traduções en-US do validador da biblioteca somam ~10 KB ao arquivo).
