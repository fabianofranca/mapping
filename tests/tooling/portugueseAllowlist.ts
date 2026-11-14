// Frozen machine vocabulary (decision 16 of #741): Portuguese terms that stay as they are
// because a script, a skill or a scheduled prompt reads or writes them. Changing one of them
// means changing its producer and every reader in the same PR, so the list is closed: a term
// is added only after checking that something really matches on it. `source` is the
// repo-relative file that produces or reads the term. A later guard test accepts these terms
// inside backticks or quotes only; no test uses the list yet.

export type ProtocolGroup =
  // Values the queue panel (`painel.py`) writes or reads: statuses, stages, session kinds,
  // request states, roles, holds, the owner-wait mark, graph states and ficha keys.
  | 'panel-values'
  // Lines and keys that skills and scheduled prompts read from script output (`show`,
  // `conflito`, the `scripts/ci` scripts, the context hook).
  | 'script-output'
  // Fixed phrases of the notices that sessions send each other (phase, coordinator, tester).
  | 'session-notices'
  // Section and title markers of the changelog and design-system records.
  | 'record-titles'
  // Fixed markers parsed in issue and PR bodies.
  | 'issue-markers';

export interface ProtocolTerm {
  readonly term: string;
  readonly source: string;
  readonly group: ProtocolGroup;
}

export const PROTOCOL_TERMS: readonly ProtocolTerm[] = [
  // panel-values
  {
    term: 'epico=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'mcp=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'nivel=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'schema=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'testador=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'visual=',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: '--com',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--desde',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--fonte',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--medir',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--paralelo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--pasta',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: '--sessao',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'Correção',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'Fases',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'Fechamento',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'Mesclada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'Testador',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'aguardando',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'aplicado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'aprovado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'arquivo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'atrasado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'concluída',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'conflito',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'contextFonte',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'coordenador',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'correção',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'dep',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'dep=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'dono no chat da fase:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'em andamento',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'enviado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'esperando dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'estado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'estado=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'etapa',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'evidencia',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'evidencia=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'exclusiva',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'exclusive=sim',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'falhou',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'fase',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'fases=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'fechamento',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'feitas',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'ficha',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'grafoNos',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'grafoSetas',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'inicio',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'livre',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'motivo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'motivo=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'negado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'nenhuma',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'onda',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'ordem do dono (só com a fila vazia)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'origem',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'origem=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'pausada pelo dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'pedido',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'pedido=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'perguntado ao dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'recente',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'recusado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'reteste',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'rodando',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'saida',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'saida=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'segurada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'sessao',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'supervisor',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'testador',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'texto',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'tipo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'tipo=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'titulo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'toca=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'vagas',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'vagasItens',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  // script-output
  {
    term: 'CI esperando o coordenador:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'Vagas',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'a ficha não diz',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'acima do teto do testador',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'alterados:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'antiga (atual:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'atrasadas:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'atual:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'atualizado:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'começa agora',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'começar agora:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'conflito:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'contexto:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'coordenador (não supervisiona)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'custo total:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'custo:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'documento inteiro',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'drenando para a exclusiva:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esperando o coordenador:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esperando o dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esperando o dono há mais de',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esperando o dono no chat da fase:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esta sessão:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'exclusiva #N',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'exclusiva (espera a fila esvaziar)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'ficha incompleta',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'fichas a refazer:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'fila:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'fora da lista',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'fora do painel',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'inválida:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'início:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'mediana',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'medida velha',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'medido à mão',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'medido:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'meça com context --medir',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'nada em voo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'nenhum',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'nenhum desde',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'nenhuma ready elegível',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'nova (nenhum supervisor registrado)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'não publicado desde',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'não publicado:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'padrão',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'parada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'pasta',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'pedidos do supervisor:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'por etapa:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'por tipo:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'prazo vencido',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'raiz do repositório não achada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'registrada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'regras em vigor:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'reserva:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'schema com',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'segurada para a exclusiva',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'sucessora (antecessor:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'testador acima do teto:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'troque de sessão agora',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'vagas cheias',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'vagas:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'âncora',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'últimas do log:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  { term: 'grupo k de n', source: 'docs/FLOW.md', group: 'script-output' },
  { term: 'script ausente', source: 'docs/FLOW.md', group: 'script-output' },
  { term: 'uma sessão', source: 'docs/FLOW.md', group: 'script-output' },
  { term: 'abandonados', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  { term: 'execucoes=', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  { term: 'falha legítima', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  { term: 'minutos=', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  { term: 'na fila sem jobs', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  {
    term: 'nenhum job abandonado',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'script-output',
  },
  { term: 'preso=', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  { term: 'reaberto=', source: 'scripts/ci/ciRerun.mjs', group: 'script-output' },
  {
    term: 'sem execução do CI no commit',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'script-output',
  },
  {
    term: 'Gancho de contexto:',
    source: 'scripts/ci/contextGuard.mjs',
    group: 'script-output',
  },
  { term: '--arquivo', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: '--teto', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'acima=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'arquivo', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'arquivo=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'contexto=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'contexto=?', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'fonte=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'mil=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'motivo=', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'recente', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  { term: 'sessao', source: 'scripts/ci/contextUsage.mjs', group: 'script-output' },
  {
    term: 'transcript ilegível',
    source: 'scripts/ci/contextUsage.mjs',
    group: 'script-output',
  },
  {
    term: 'Acima dos limites:',
    source: 'scripts/ci/distBudget.mjs',
    group: 'script-output',
  },
  { term: 'bug:', source: 'scripts/ci/distBudget.mjs', group: 'script-output' },
  { term: 'nada a subir:', source: 'scripts/ci/distBudget.mjs', group: 'script-output' },
  { term: 'sobe:', source: 'scripts/ci/distBudget.mjs', group: 'script-output' },
  { term: 'gatilho:', source: 'scripts/ci/riskTriggers.mjs', group: 'script-output' },
  {
    term: 'nenhum gatilho',
    source: 'scripts/ci/riskTriggers.mjs',
    group: 'script-output',
  },
  { term: '--grupos', source: 'scripts/testing/round-guide.mjs', group: 'script-output' },
  {
    term: 'uma sessão',
    source: 'scripts/testing/round-guide.mjs',
    group: 'script-output',
  },
  // session-notices
  {
    term: 'Conferência da fila:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Fila — coordenador',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'O coordenador mudou:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Pare: o dono interrompeu a etapa',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Sem resposta do dono em 240 min:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Supervisor:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Troca de sessão',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  { term: 'Aviso não entregue:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'CI preso na fila:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'CI travado', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Contexto:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Contexto: sem medida', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Coordenador:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Defeitos pendentes', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Esperando o dono:', source: 'docs/FLOW.md', group: 'session-notices' },
  {
    term: 'O coordenador vai fechar e reabrir o PR',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  { term: 'O dono respondeu', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Passada visual:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Passagem da fase', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Relato na sub-issue #', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Retomada por contexto', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Tag da release:', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Troca de sessão da fase', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'passagem por contexto', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'pode mesclar', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'sem R21', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'Bloco k de 5', source: 'docs/TESTING-NUVEM.md', group: 'session-notices' },
  {
    term: 'Modo: completo, bloco',
    source: 'docs/TESTING-NUVEM.md',
    group: 'session-notices',
  },
  {
    term: 'Modo: dirigido, grupo',
    source: 'docs/TESTING-NUVEM.md',
    group: 'session-notices',
  },
  {
    term: 'modo completo, bloco',
    source: 'docs/TESTING-NUVEM.md',
    group: 'session-notices',
  },
  { term: 'modo dirigido', source: 'docs/TESTING-NUVEM.md', group: 'session-notices' },
  {
    term: 'Fase <código> — <título> da etapa #<n> (sub-issue #<n>)',
    source: 'scripts/ci/contextGuard.mjs',
    group: 'session-notices',
  },
  {
    term: 'Você é o agente da fase',
    source: 'scripts/ci/contextGuard.mjs',
    group: 'session-notices',
  },
  // record-titles
  { term: '## Adicionado', source: 'changelog/README.md', group: 'record-titles' },
  { term: '## Alterado', source: 'changelog/README.md', group: 'record-titles' },
  { term: '## Corrigido', source: 'changelog/README.md', group: 'record-titles' },
  {
    term: '[Não lançado]',
    source: 'tests/tooling/changelog.test.ts',
    group: 'record-titles',
  },
  {
    term: '## Ficou sem gravar',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: '## Pendências',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: '## Sincronização',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: '(épico',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Gravado no artefato',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Motivo:',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Passou para o registro do épico',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Sem impacto',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  // issue-markers
  {
    term: '**Depende de:**',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: '**Fases:**',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: '**Toca em:**',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Closes #',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Origem: etapa #',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Reteste: não',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'reteste: sim|não',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Impacto:',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'issue-markers',
  },
  { term: 'Parte de #', source: 'docs/FLOW.md', group: 'issue-markers' },
  // Markers of the workspace `AGENTS.md` that `setup.sh` and `scripts/release/workspaceAssets.mjs`
  // match literally; workspaces already installed carry them, so they cannot be translated.
  {
    term: '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
  {
    term: '## Para que servem estes mapeamentos',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
  {
    term: '# Mapeamentos',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
  { term: '## Estrutura', source: 'examples/workspace/setup.sh', group: 'script-output' },
  {
    term: '## Servidor MCP `mapping`',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
  { term: '## Regras', source: 'examples/workspace/setup.sh', group: 'script-output' },
  {
    term: '## Skill `spec-author`',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
  {
    term: '## Fluxo típico',
    source: 'examples/workspace/setup.sh',
    group: 'script-output',
  },
];
