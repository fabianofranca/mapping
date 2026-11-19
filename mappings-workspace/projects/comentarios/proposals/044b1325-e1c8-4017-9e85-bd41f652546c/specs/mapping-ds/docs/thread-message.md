# ThreadMessage

Uma mensagem da conversa (`src/ui/comments/ThreadMessage.tsx`): iniciais, nome, selo de agente, hora relativa e o texto em markdown.

`agente` `sim` mostra o selo *agente* e é o que separa a mensagem de agente da de pessoa. O texto aparece sem a formatação do markdown; uma citação dentro dele é o CitationChip, que você desenha como marcação sobre o texto. Quando a mensagem liga uma proposta (`proposta`, `propostaEstado`, `propostaAcao`), o cartão da proposta aparece entre o cabeçalho e o texto, como no app (veja ProposalCard).
