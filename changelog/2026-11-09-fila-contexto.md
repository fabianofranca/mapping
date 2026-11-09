# Coordenador da fila enxuto — 2026-11-09 (épico `epic/fila-contexto`, PR #1290, MCP 0.28.12, schema v18)

## Alterado

- `/implementar-fila`: o coordenador gasta bem menos contexto e dura mais horas por sessão. Ele não lê mais o corpo das issues (um subagente devolve uma ficha por etapa, guardada no painel). Também passaram a subagentes a conferência do PR antes do merge, a da Release do MCP e a criação da sub-issue de correção. Há uma conferência de reserva por hora para a sessão inteira, em vez de uma por filha. A mensagem da fase é curta e aponta para o `docs/FLOW.md`, e o painel é publicado uma vez por aviso.
- `/implementar-fila`: na troca de sessão, a sessão antiga avisa ela mesma as filhas do coordenador novo, e a nova começa só com os argumentos e o painel, sem reler issues nem sessões.
- Painel da fila (`painel.py`): a linha guarda a ficha da etapa (`plan`) e as filhas que devem aviso (`child`, `childAt`). O meta guarda a conferência de reserva (`reserve`). O `show` lista as filhas atrasadas e mostra uma linha inteira com `show '#n'`.

## Corrigido

- `/implementar-fila`: os comandos do `painel.py` no skill estavam com a pasta antes do subcomando (`painel.py <pasta> row`), e o script só aceita `painel.py row <pasta>`.
