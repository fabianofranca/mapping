# Mensagens do modelo na língua da app — [Não lançado] (épico `epic/mensagens-modelo`, PR #1512, MCP 0.31.1, schema v18)

## Corrigido

- Com a app em English (US), os problemas que o validador da biblioteca monta (janela do pacote em **Especializações**, Diagnóstico e Catálogo) saem em inglês, como "file not referenced by the specialization", "empty document" e "file not found: …". Em Português o texto é o mesmo de antes, e a saída do `validate_library` e do `plan_library_update` não muda. Os avisos de desenho dentro da lista seguem com o texto do motor até a fase do motor de desenho.
- Com a app em English (US), parte dos erros da especialização (campos, sugestões, `code`, exemplos, onde se aplica, filhos permitidos, documentos, papéis, grupos, tipos e camadas; o resto vem nas fases seguintes) e os textos padrão do zod (tipo inválido, propriedade desconhecida, valor inválido) saem em inglês na lista de problemas da biblioteca; em Português, os textos padrão do zod saem traduzidos. O `message`, os `errors` e a saída do `validate_specialization` não mudam.
- Com a app em English (US), o resto dos erros da especialização (repositórios, plataformas, containers, fontes, migrações, fontes externas, `allowedChildren`, `accepts`, `docRepos`, tokens e `icons`), os avisos dela e as quebras sem migração da atualização recusada saem em inglês, na lista da biblioteca, na especialização solta recusada e no diálogo de atualização. Em Português o texto é o mesmo de antes, e a saída do `validate_specialization`, do `validate_library` e do `plan_library_update` não muda.
- Com a app em English (US), os erros e avisos do componente (arquivo `.json` de cada tipo), do conjunto de ícones e da declaração das origens saem em inglês na lista de problemas da biblioteca, na especialização solta recusada e no aviso do componente que não carregou (Catálogo e Diagnóstico). Em Português o texto é o mesmo de antes, e a saída do `validate_library`, do `validate_specialization` e do `plan_library_update` não muda.

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 1.966.080 para 1.982.464 bytes, pela regra do orçamento (as traduções en-US do validador da biblioteca somam ~10 KB ao arquivo).
- Teto do `dist/index.html` subiu 16 KiB, de 1.982.464 para 1.998.848 bytes, pela regra do orçamento (as traduções en-US da especialização e dos textos padrão do zod).
- Teto do `dist/index.html` subiu 16 KiB, de 1.998.848 para 2.015.232, pela regra do orçamento (as traduções en-US do resto da especialização, dos avisos e das quebras sem migração).
- Teto do `dist/index.html` subiu 16 KiB, de 2.015.232 para 2.031.616, pela regra do orçamento (as traduções en-US do componente, dos ícones e da declaração das origens).
