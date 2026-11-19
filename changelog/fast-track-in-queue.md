# Released fast tracks run inside the queue — [Não lançado] (MCP unchanged, schema v20)

## Adicionado

- **The queue panel knows the fast track (for whoever drives the flow, #1791):** `painel.py` accepts the `via-rapida` kind and session kind and the final `recusada` status. A `via-rapida` row takes a slot and goes through dependency, file, schema, exclusive and draining like a stage; a `recusada` row never starts, never conflicts and stays out of the graph; `canario usar` always answers `atual` for a fast track.
- **`painel.py end <folder>` (for whoever drives the flow, #1791):** writes `meta.runEnd`, so the panel's total time can stop at the end of the run; `start` clears it.
- **`show` lists the merges asked to the owner (for whoever drives the flow, #1791):** `merge pedido ao dono: #n (PR #p, <hours>)`, or `nenhum`.

## Alterado

- **The merge is asked by text, not by a blocking question (for whoever drives the flow, #1791):** a row `esperando dono` whose `wait` starts with `merge pedido ao dono:` takes no slot and the queue goes on. (Skill and page text arrive in the next phases of the epic.)

## Corrigido

- **`phase` no longer raises a traceback (#1789, finding 5):** `row … phases=` is validated as `<code>:<todo|open|ok>` and `phase` counts an item without `:` as `open`.
- **`ended` follows the status (#1789, finding 6):** `concluída`, `falhou` and `recusada` write `ended`; `aguardando`, `em andamento` and `esperando dono` clear it.
