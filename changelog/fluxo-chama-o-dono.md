# "Chamar o dono" no fluxo de entrega — [Não lançado] (épico `epic/fluxo-chama-o-dono`, PR #0, MCP sem mudança, schema v19)

## Alterado

- Para quem conduz o fluxo: o `docs/FLOW.md` define "Chamar o dono" uma vez, no "Orquestrador — passo a passo" (`PushNotification` com o motivo e o link, e a pergunta no chat do orquestrador pelo `AskUserQuestion`; a autorização do item 8 continua da fase, e na fila valem as regras 1 e 2 do `implementar-fila`). Todo outro "chama o dono" do arquivo cita esse parágrafo, e a fase ou o testador que não avisa segue antes a escada do `implementar-fila` (`send_message` de retomada, recriar a sessão uma vez), em vez de chamar o dono na hora.
- As "Limitações conhecidas" do revisor de código deixam de repetir os comandos do item 6 da mensagem, e a regra das issues `code-review` sai da lista de passos de "## 1. Candidatas" do skill `detalhar-backlog`. O teste `tests/tooling/flowOwnerCall.test.ts` confere o texto.
