# Migração dos papéis do vínculo — [Não lançado] (épico `epic/migracao-papeis`, PR #616, MCP 0.20.0, schema v14)

## Adicionado

- Especialização `formatVersion` 12: três passos novos em `migrations`, `rename-role`, `remove-role` (com `mode` `clear` ou `unlink`) e `set-role` (com `childType` opcional), que renomeiam, removem e dão papéis do vínculo nos filhos de um dono. Só sobe para a 12 quem declara um passo novo.
- O diálogo de atualização da especialização mostra os passos de papel (renomear, remover com limpar ou desvincular, dar papel), a contagem de anotações desvinculadas, as perdas de papel limpo e de vínculo desfeito e, no total, "e N vínculo(s)"; a quebra de papel sem passo recusa a atualização.
- MCP 0.20.0: `plan_library_update` e `update_specialization` devolvem os passos de papel, as perdas (`cleared-role` e `unlinked`, com o `role`), `unlinked` por passo e as pendências `missing-role` e `missing-owner`; `validate_specialization` e `validate_library` aceitam a `formatVersion` 12 e recusam o passo de papel numa versão anterior.

## Alterado

- Renomear ou remover um papel (`childRoles`) e dar papéis a um dono que não tinha passam a ser quebras do contrato de versão: a atualização sem o passo que as cubra é recusada, como as outras quebras.
