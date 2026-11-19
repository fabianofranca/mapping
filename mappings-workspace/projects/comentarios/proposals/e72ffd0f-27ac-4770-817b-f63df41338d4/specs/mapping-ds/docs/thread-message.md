# ThreadMessage

Uma mensagem da conversa (`src/ui/comments/ThreadMessage.tsx`). No app ela não tem fundo nem borda: a marcação só agrupa os filhos, numa linha com 8 px entre o avatar e o corpo.

- **Iniciais** (`conversa`, 24 px).
- Cabeçalho: o nome (Texto `t-body-strong`), o Selo `agente` (só na mensagem de agente) e a hora (Texto `t-small` `muted`, "há 5 min").
- **ProposalCard**, quando a mensagem liga uma proposta.
- O texto (Texto `t-body`), com as citações como **CitationChip**.
