# Impacto nos agentes — [Não lançado] (épico `epic/impacto-nos-agentes`, PR #696, MCP 0.23.1, schema v14)

## Alterado

- O guia do agente (`mapping-docs://AGENT-GUIDE.md`) diz a versão atual do formato da especialização (12), e a skill `spec-author` lista o que cada `formatVersion` de 1 a 12 acrescenta.
- O guia cobre as regras do workspace que lhe faltavam: onde gravar a fonte da especialização (`especializacoes/`, nunca `specs/`), `validate_specialization` só valida o arquivo de uma biblioteca, `canvas-marking` e seta sem imagem, e abrir o agente no repositório do código.

## Corrigido

- A skill `spec-author` dizia que o MCP não aplica pacote de biblioteca (`formatVersion` 4) por proposta; ele aplica e atualiza (`apply_specialization` e `update_specialization` com a pasta em `file`). Também corrigiu as versões dos exemplos e das bibliotecas, as pastas de `material3-compose`, as colunas de `table` (inclui `ref`), `language?` da plataforma, a prova de desenho (só o `size`) e ensina os passos de migração da v4 (`rename-type`, `remove-type`, `rename-field`, `remove-field`, `map-values`, `fill-field`).
- O guia descrevia a montagem de filhas num slot por `parent` e sem `rect`; o servidor ignora `parent` e posiciona sem `rect` no centro, então toda filha leva `rect`. Também corrigiu o retorno de `list_components`, os casos de `invalid-arguments`, o uso de `near`, `annotation.layer`, as referências do exemplo de `get_code_hints`, a letra `p` das referências e os avisos `ignored-argument` e `proposal-field-ignored`.
- O `docs/SPEC-FORMAT.md` dava versões erradas aos exemplos (`sdui.json` é a 12, a Kotlin é a 8) e dizia que a prova de desenho usa o `minSize`.
- As descrições dos recursos `FORMAT.md` e `SPEC-FORMAT.md` do MCP passaram a citar a versão atual do schema e das especializações (antes diziam v9 e 1 a 8), a descrição de `validate_specialization` lista todos os avisos, e a ajuda de Especializações não diz mais que a validação compartilhada ainda vai chegar.
