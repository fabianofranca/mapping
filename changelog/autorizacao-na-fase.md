# Autorização do dono no chat da fase — [Não lançado] (épico `epic/autorizacao-na-fase`, PR #0, MCP 0.34.3 sem mudança, schema v18)

## Alterado

- A mensagem "Para a sessão da fase" do `docs/FLOW.md` passa a mandar a autorização do dono (lista fechada: o "chama o dono" do teto do `dist/index.html`, edição de CI ou de permissão que o modo Auto negou ou que a sub-issue não prevê, e exceção a uma guarda) ao próprio chat da fase: link do chat, `PushNotification`, aviso "Esperando o dono" ao coordenador e só então o `AskUserQuestion`; depois da resposta, a fase avisa "O dono respondeu". Subagente parado, erro e "como seguir" continuam indo ao coordenador (sub-item "Decisão de produto").
- Todo aviso da fase ao coordenador vai pelo `send_message` do `claude-code-remote`, com `session_id` e `status: delivered` conferido, nunca pelo `SendMessage` (item 7, "Canal").
- O "Orquestrador — passo a passo" não repassa a resposta de uma autorização do dono e lê a pergunta da fase parada (`list_events`) antes de chamar o dono.
- O skill `implementar-fila` não repassa autorização do dono: marca a etapa `esperando dono` só depois de conferir que o motivo da mensagem "Esperando o dono" é da lista fechada, responde pela regra 1 (`send_message` com `priority: "now"`) o que não for, volta a `em andamento` com "O dono respondeu" ou o aviso final, e a conferência de hora em hora lê o `AskUserQuestion` pendente da fase parada (`blocked`) antes de marcar. O "Fim" e o "Drenar" contam a etapa `esperando dono` com filha como etapa que ainda trabalha, e a regra do painel com saída "#N mesclada" cai no mesmo ciclo em que o #N é mesclado.
- O `painel.py show` ganha a linha `esperando o dono no chat da fase:`, separada de `esperando o coordenador:` e de `atrasadas:`.
