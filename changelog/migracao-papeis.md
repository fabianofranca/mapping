# Migração dos papéis do vínculo — [Não lançado] (épico `epic/migracao-papeis`, PR #616, MCP 0.20.0, schema v14)

## Adicionado

- Especialização `formatVersion` 12: três passos novos em `migrations`, `rename-role`, `remove-role` (com `mode` `clear` ou `unlink`) e `set-role` (com `childType` opcional), que renomeiam, removem e dão papéis do vínculo nos filhos de um dono. Só sobe para a 12 quem declara um passo novo.
- O diálogo de atualização da especialização mostra os passos de papel (renomear, remover com limpar ou desvincular, dar papel), a contagem de anotações desvinculadas, as perdas de papel limpo e de vínculo desfeito e, no total, "e N vínculo(s)"; a quebra de papel sem passo recusa a atualização.
- MCP 0.20.0: `plan_library_update` e `update_specialization` devolvem os passos de papel, as perdas (`cleared-role` e `unlinked`, com o `role`), `unlinked` por passo e as pendências `missing-role` e `missing-owner`; `validate_specialization` e `validate_library` aceitam a `formatVersion` 12 e recusam o passo de papel numa versão anterior.
- Exemplo novo `examples/specs/papeis-migracao.json` (`formatVersion` 12) com `rename-role` (que junta dois papéis) e `remove-role` com `clear` e `unlink`; roteiros do R19 para a recusa sem o passo, os três passos e a v11 com passo de papel.

## Alterado

- Renomear ou remover um papel (`childRoles`) e dar papéis a um dono que não tinha passam a ser quebras do contrato de versão: a atualização sem o passo que as cubra é recusada, como as outras quebras.
- O exemplo SDUI (`formatVersion` 12, versão 4) dá os papéis na migração 3→4 com quatro `set-role` (`click`, `hold` e `change`): quem atualiza da v3 recebe os vínculos com papel e sem pendência `missing-role`.
