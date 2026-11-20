# Refused fast track re-enters the queue — [Não lançado] (epic `epic/queue-refused-reentry`, PR #2312, MCP unchanged, schema unchanged)

## Alterado

- A refused fast track comes back to the queue when its label is added again or it becomes `ready`: the queue panel has the `reentra` command, which turns a `recusada` row into a fresh `aguardando` one (new kind and ficha, phases rebuilt, order and session history kept).
- A stage that depends on a refused one is shown (`dep #N recusada` in `vagas:` and the `dependem de recusada:` line of `show`) and the owner can be asked about it with the `soltar` verb (`soltar #<n>` or `esperar #<n>`).

## Corrigido

- The outlier base no longer counts a stage whose "Toca em:" cites only ignored paths (`changelog/`, `docs/design-system/`, `mcp/version.ts`): it counts as "without ficha" and is not a process stage.
- A repeated merge ask restarts its age in `show` (`merge pedido ao dono:`).
