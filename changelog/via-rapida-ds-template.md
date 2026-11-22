# The fast-track DS record template passes the Portuguese guard — [Não lançado] (épico `epic/via-rapida-ds-template`, MCP unchanged, schema v23)

## Corrigido

- Step 1 of the `via-rapida` skill now tells the session to write `## Pendências` as `None (process only).` in the DS record. The old Portuguese wording (`nenhuma (só processo)`) passed before the commit but made the Portuguese guard fail once the record was versioned. The frozen term is gone from the guard's allowlist and a text test checks the new wording.
