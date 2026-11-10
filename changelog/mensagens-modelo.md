# Mensagens do modelo na língua da app — [Não lançado] (épico `epic/mensagens-modelo`, PR #0, MCP 0.31.1, schema v18)

## Corrigido

- Com a app em English (US), os problemas que o validador da biblioteca monta (janela do pacote em **Especializações**, Diagnóstico e Catálogo) saem em inglês, como "file not referenced by the specialization", "empty document" e "file not found: …". Em Português o texto é o mesmo de antes, e a saída do `validate_library` e do `plan_library_update` não muda. Os avisos de desenho dentro da lista seguem com o texto do motor até a fase do motor de desenho.
