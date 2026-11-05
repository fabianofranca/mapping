# Papéis e documentos externos — [Não lançado] (épico `epic/papeis-e-docs-externos`, PR #TBD, MCP 0.18.0, schema v14)

## Adicionado

- A `formatVersion` 11 da especialização, com três recursos opcionais (a 11 é aditiva: as versões 1 a 10 continuam aceitas, e cada chave nova numa versão anterior é o erro `só é permitido com formatVersion 11`, no caminho exato):
  - **Filhos por camada e grupo:** um item de `allowedChildren` pode ser uma cláusula `{ layer, groups? }` que cobre uma camada inteira ou só os grupos dela, em vez de listar os filhos um a um; a camada declara os grupos (`layers[].groups`) e o tipo diz a quais pertence (`annotationTypes[].groups`). `requiresOwner` passa a ser conferido no conjunto resolvido de filhos, e a validação avisa quando um dono lista 20 ids ou mais um a um e quando um grupo declarado não tem tipo.
  - **Papéis no vínculo:** `childRoles` (e `childRolesLabel`, o nome do seletor) no tipo dono declara os pontos em que um filho se liga a ele, sem criar um tipo por gatilho nem um campo no filho.
  - **Documento em repositório externo:** `docRepos` na raiz declara os repositórios de documentos e o `doc` do tipo pode ser `{ repo, path }`, um arquivo `.md` de um deles, em vez de um arquivo do pacote. O documento externo não conta como arquivo do pacote.
- O JSON Schema (`docs/spec.schema.json`), a página Ajuda → Especializações (pt-BR e en-US), o `docs/SPEC-FORMAT.md` e a skill `spec-author` descrevem a `formatVersion` 11, com as três seções novas, as regras de validação e os anti-padrões (gatilho no id do tipo, campo `trigger` em cada evento e `allowedChildren` par a par).
