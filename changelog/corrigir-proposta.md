# Correção na mesma proposta — [Não lançado] (épico `epic/corrigir-proposta`, PR #0, MCP 0.23.0, schema v14)

## Adicionado

- O agente corrige a proposta aberta na própria proposta, sem criar outra, e a revisão marca o que ele trocou. A proposta passa a ter a `formatVersion` 5, gravada só por essa correção (a criação continua na 4). O texto final para quem usa a app vem nas próximas fases.
- **MCP:** a tool `revise_proposal(ref, { operations?, drop?, dryRun? })` troca, retira e acrescenta mudanças na proposta aberta (nada aplicado), com o mesmo vocabulário do `propose_changes`; a mudança que o usuário já aceitou fica congelada (`change-frozen`). A trocada volta a sem decisão e ganha a marca "Revisada"; `dryRun` calcula sem gravar. `get_proposal` mostra `revised` em cada mudança marcada e `revisions` na raiz; `get_proposal_review` traz `revisable`, `awaitingUser` (trocadas e novas sem decisão, que não contam como rejeitadas) e as notas das mudanças retiradas (`fromDroppedChange`); `list_proposals` traz `lastRevisedAt`. Erros novos: `change-frozen`, `change-not-found`, `proposal-applied`, `proposal-not-applicable`, `revise-unsupported`.
