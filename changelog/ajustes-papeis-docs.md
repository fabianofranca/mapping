# Ajustes de papéis e documentos externos — [Não lançado] (épico `epic/ajustes-papeis-docs`, PR #584, MCP 0.18.1, schema v14)

## Corrigido

- Escolha de tipo: o campo de busca diz "Buscar entre 1 tipo" (singular) quando a camada tem um tipo só (em inglês, "Search among 1 type").
- Revisão da proposta: o título da mudança de repositório concorda em gênero ("Repositório de documentos … criado", "atualizado", "removido"; o mesmo vale para o repositório de código).
- `validate_specialization` e `validate_library`: a propriedade a mais num `doc` objeto ou numa cláusula de `allowedChildren` volta em português (`propriedade desconhecida: "x"`), em vez da mensagem em inglês do validador.
- MCP `get_component`: a `hint` de documento externo sem `urlTemplate` diz o caminho e o repositório, sem mandar "abrir o link" que não existe.
- MCP `validate_library`: `summary.docs` conta todos os documentos, os do pacote e os de repositório externo, e concorda com `spec.docs` (um pacote só com documentos externos dizia `0`).
- Documento em markdown (Catálogo, documento externo): link `https://` ou `http://` absoluto agora é um link clicável (abre em outra aba, com `rel="noopener noreferrer"`); links relativos e âncoras inexistentes continuam texto.
