# Role and external document adjustments — 2026-11-05 (epic `epic/ajustes-papeis-docs`, PR #584, MCP 0.18.1, schema v14)

## Corrigido

- Type picker: the search field says "Search among 1 type" (singular) when the layer has a single type (in Portuguese, "Buscar entre 1 tipo").
- Proposal review: the title of a repository change agrees in gender in Portuguese ("Repositório de documentos … criado", "atualizado", "removido"; the same goes for the code repository).
- `validate_specialization` and `validate_library`: the extra property in an object `doc` or in an `allowedChildren` clause comes back in Portuguese (`propriedade desconhecida: "x"`) instead of the validator's English message.
- MCP `get_component`: the `hint` for an external document without `urlTemplate` gives the path and the repository, without telling you to "open the link" that does not exist.
- MCP `validate_library`: `summary.docs` counts all documents, those in the package and those in an external repository, and agrees with `spec.docs` (a package with only external documents said `0`).
- Markdown document (Catalog, external document): an absolute `https://` or `http://` link is now a clickable link (opens in another tab, with `rel="noopener noreferrer"`); relative links and nonexistent anchors remain text.
