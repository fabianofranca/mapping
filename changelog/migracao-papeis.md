# Migração dos papéis do vínculo — [Não lançado] (épico `epic/migracao-papeis`, PR #?, MCP 0.20.0, schema v14)

## Adicionado

- Especialização `formatVersion` 12: três passos novos em `migrations`, `rename-role`, `remove-role` (com `mode` `clear` ou `unlink`) e `set-role` (com `childType` opcional), que renomeiam, removem e dão papéis do vínculo nos filhos de um dono. Só sobe para a 12 quem declara um passo novo.

## Alterado

- Renomear ou remover um papel (`childRoles`) e dar papéis a um dono que não tinha passam a ser quebras do contrato de versão: a atualização sem o passo que as cubra é recusada, como as outras quebras.
