# Autorização do dono no chat da fase — [Não lançado] (épico `epic/autorizacao-na-fase`, PR #0, MCP 0.34.3 sem mudança, schema v18)

## Alterado

- A mensagem "Para a sessão da fase" do `docs/FLOW.md` passa a mandar a autorização do dono (lista fechada: o "chama o dono" do teto do `dist/index.html`, edição de CI ou de permissão que o modo Auto negou ou que a sub-issue não prevê, e exceção a uma guarda) ao próprio chat da fase: link do chat, `PushNotification`, aviso "Esperando o dono" ao coordenador e só então o `AskUserQuestion`; depois da resposta, a fase avisa "O dono respondeu". Subagente parado, erro e "como seguir" continuam indo ao coordenador (sub-item "Decisão de produto").
- Todo aviso da fase ao coordenador vai pelo `send_message` do `claude-code-remote`, com `session_id` e `status: delivered` conferido, nunca pelo `SendMessage` (item 7, "Canal").
- O "Orquestrador — passo a passo" não repassa a resposta de uma autorização do dono e lê a pergunta da fase parada (`list_events`) antes de chamar o dono.
