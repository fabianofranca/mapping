# Correção na mesma proposta — [Não lançado] (épico `epic/corrigir-proposta`, PR #669, MCP 0.23.0, schema v14)

## Adicionado

- O agente corrige a proposta aberta na própria proposta, sem criar outra, e a revisão marca o que ele trocou. A proposta passa a ter a `formatVersion` 5, gravada só por essa correção (a criação continua na 4).
- **MCP:** a tool `revise_proposal(ref, { operations?, drop?, dryRun? })` troca, retira e acrescenta mudanças na proposta aberta (nada aplicado), com o mesmo vocabulário do `propose_changes`; a mudança que o usuário já aceitou fica congelada (`change-frozen`). A trocada volta a sem decisão e ganha a marca "Revisada"; `dryRun` calcula sem gravar. `get_proposal` mostra `revised` em cada mudança marcada e `revisions` na raiz; `get_proposal_review` traz `revisable`, `awaitingUser` (trocadas e novas sem decisão, que não contam como rejeitadas) e as notas das mudanças retiradas (`fromDroppedChange`); `list_proposals` traz `lastRevisedAt`. Erros novos: `change-frozen`, `change-not-found`, `proposal-applied`, `proposal-not-applicable`, `revise-unsupported`.
- **App:** a revisão mostra o que o agente corrigiu na mesma proposta. A mudança trocada ou acrescentada leva o selo **Revisada** (ou **Nova na revisão**), na linha dela e no item que a contém, até você decidir. O menu **Filtros** ganha **Só revisadas (N)**, o cabeçalho diz "Revisada pelo agente em <data>: N trocada(s), N nova(s), N retirada(s)", e os Detalhes da mudança trocada mostram **Antes da revisão**: o que o agente tinha proposto e se você tinha rejeitado. A janela Propostas diz "Revisada · N para conferir" na linha da proposta, e o aviso de proposta alterada passa a dizer "O agente revisou <título>", com o botão **Revisar**. A nota de uma mudança retirada vai para as notas da proposta, com "Da mudança retirada: …".

## Alterado

- A decisão tomada no instante em que o agente revisa a proposta não vale para o conteúdo novo: aceitar ou rejeitar uma mudança que ele acabou de trocar ou acrescentar é recusado ("O agente revisou esta proposta enquanto você olhava. Confira antes de decidir."), nada é gravado e a revisão passa a mostrar a versão nova.
