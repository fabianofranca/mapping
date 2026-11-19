# Released fast tracks run inside the queue — 2026-11-19 (épico `epic/fast-track-in-queue`, PR #2206, MCP unchanged, schema v21)

## Adicionado

- **The queue panel knows the fast track (for whoever drives the flow, #1791):** `painel.py` accepts the `via-rapida` kind and session kind and the final `recusada` status. A `via-rapida` row takes a slot and goes through dependency, file, schema, exclusive and draining like a stage; a `recusada` row never starts, never conflicts and stays out of the graph; `canario usar` always answers `atual` for a fast track.
- **`painel.py end <folder>` (for whoever drives the flow, #1791):** writes `meta.runEnd`, so the panel's total time can stop at the end of the run; `start` clears it.
- **`show` lists the merges asked to the owner (for whoever drives the flow, #1791):** `merge pedido ao dono: #n (PR #p, <hours>)`, or `nenhum`.
- **The queue runs the released fast tracks (for whoever drives the flow, #1791):** an open issue with the `via-rapida` label becomes a `kind=via-rapida` row of the queue (ficha variant with `fases=VR:#<n>:high`, `dep=` from the `Via rápida: espera #N` comments and `toca=` from the `Toca em:`), takes a slot like any stage and starts on its own, in the next cycle, as `/via-rapida #<n> fila=<id>`. In that queue mode the `via-rapida` skill checks no conflict at the start, never merges, and sends the coordinator `Via rápida #<n> pronta: <PR link>` (with the review line) or `Via rápida #<n> recusada: <criterion>` (the row becomes `recusada`, and the issue goes back to detailing). The coordinator merges by the queue rule, and `mesclar=auto` only merges a fast track with no open review finding. In manual mode, an issue that is a live row of the panel is refused (`Via rápida: na fila do painel`), and the wait comment now carries the `Toca em:` line.

## Alterado

- **The queue panel page shows the fast track and the end of the run (for whoever reads the panel, #1791):** the "Total duration" stops at `meta.runEnd`, or, without it, when every row is `concluída`, `falhou` or `recusada` (at the latest valid `ended`), instead of growing forever; a row with a missing or invalid `ended` no longer gives `NaN` (no valid one shows "—"). The `via-rapida` kind has its own tag and the eighth tone (`cor-7`) in the cost bars, and the `recusada` rows show in "Completed" with a `recusada` tag, on the day of `ended`, without merge time (#1789, finding 8).
- **The merge is asked by text, not by a blocking question (for whoever drives the flow, #1791):** a row `esperando dono` whose `wait` starts with `merge pedido ao dono:` takes no slot and the queue goes on. The queue skill's "Merge" now writes one line in the queue chat (`mesclar #<n>` or `ainda não #<n>`) and records the wait on the panel instead of opening the blocking question, and `docs/FLOW.md` says so; a late `mesclar #<n>` after the End is served by the registered coordinator, which runs `painel.py end` again (the "End" step also runs it). The rest of the skill text arrives in the next phases of the epic.

## Corrigido

- **The resume no longer reorders the queue (#1791, decision 1):** step 5 of "1. Start" continues where the previous session left off, without steps 4 to 7 of "2. Queue".
- **The successor message and the lineage-limit command no longer repeat `painel=`, `importar=`, `retomar` or `anterior=` (#1789, finding 3).**
- **The merge no longer blocks the turn, and a late merge after the End is served (#1789, finding 4).**
- **`phase` no longer raises a traceback (#1789, finding 5):** `row … phases=` is validated as `<code>:<todo|open|ok>` and `phase` counts an item without `:` as `open`.
- **`ended` follows the status (#1789, finding 6):** `concluída`, `falhou` and `recusada` write `ended`; `aguardando`, `em andamento` and `esperando dono` clear it.
- **`show` no longer lists a `recusada` stage in `testador acima do teto:` (#1791, finding CL1):** `tester_over_limit_text` drops the rows with status `recusada`, like `concluída` and `meta.merged`.
