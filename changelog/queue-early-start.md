# Queue early start — [Não lançado] (épico `epic/queue-early-start`, MCP unchanged, schema v21 unchanged)

## Alterado

- `painel.py` starts a stage early when its only blockers are file conflicts with stages already in their tester, correction or closing: the reason in `vagas:` is `começa cedo (espera #S para testar)`, `começar agora:` prints `#E (cedo: #S)`, and `row` writes the holders in the new `cedo` field. A stage in implementation, a failed or stopped one, one with `cedo` pending, an exclusive one and a fast track never open it; the schema rule, a shared format family or an unknown `formato=` still hold the pair, and a fast-track candidate never starts early.
- The new status `esperando entrega` marks an early stage that finished its phases and waits for its holders' merge before its own tester: it takes no slot, its step reads `espera merge de #S para testar`, and `show` prints `esperando merge para testar:` and `pode sincronizar:` (the holders merged, failed, refused or gone). The queue graph gets the `entrega` state, the `cedo` of each node and an `entrega` arrow from each open holder.
- The ficha gains the field `formato=` (the format families a stage raises); a waiting row without it goes into `fichas a refazer:` without being held. The session kind `sincronização` joins the cost and usage tables, with no signals.
