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
  | 'issue-markers'
  // Names of artifacts, boards and external things that skills look up by name.
  | 'names'
  // Choices and phrases of the chats with the owner, which stay in Portuguese by the
  // language rule of CLAUDE.md (the owner reads and types them).
  | 'owner-chat'
  // Error messages thrown by `painel.py` and the `scripts/ci` and `scripts/release` scripts;
  // their text is part of the frozen output that tests and skills match.
  | 'error-messages';

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
  {
    term: 'AGRUPAMENTO',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'PERGUNTAS #<n>',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'RESPOSTAS #<n>',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'PRONTA #<n>',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'BLOQUEADA #<n>',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'FALHOU #<n>',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'SOZINHAS:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'BLOQUEADAS:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'ESFORÇO HIGH:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'ORDEM:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Por quê:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Principal:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Pergunta:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Cabeçalho:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Épico:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Modelos:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Absorvidas:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Decisões do dono aplicadas:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Sobreposição:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Conferência:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Issues novas:',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'MCP: sem mudança',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Conferência do orquestrador:',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  { term: 'É autorização do dono', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'parou em:', source: 'docs/FLOW.md', group: 'session-notices' },
  {
    term: 'passou de 300 mil na quinta sessão',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Dono: aplicar este prompt no CR por épico',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  { term: 'CR por épico', source: 'docs/FLOW.md', group: 'session-notices' },
  { term: 'CR épico', source: 'docs/FLOW.md', group: 'session-notices' },
  {
    term: 'CR — coordenador (não arquivar)',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Execução iniciada',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Fila concluída',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Pausada pelo dono',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Drenando a fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Fila drenada',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'parada pelo dono',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'espera #N',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'CI preso',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'diagnóstico de ciclo',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'ciclo de CI',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'regra do supervisor',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'ainda trabalhando',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'medida de contexto divergente',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'troca por contexto',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'coordenador anterior não arquivou:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'coordenador anterior arquivado',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'relido inteiro',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'não publicado',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'o que espera o dono',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'acima do teto do testador (300 mil)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Duplicadas: nenhuma (busca:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Relacionada: #',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Via rápida:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Via rápida recusada:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Via rápida: espera #',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Origem: via rápida #',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Teto na última revisão do dono',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Orçamento do dist/index.html',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Teto de contexto do testador',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Nada.',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'nenhuma (só processo)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Exceção ao Button:',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Versão <n>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  { term: 'Versão do MCP', source: '.github/workflows/ci.yml', group: 'script-output' },
  {
    term: 'Tamanho do dist/index.html',
    source: '.github/workflows/ci.yml',
    group: 'script-output',
  },
  {
    term: 'acima do orçamento',
    source: '.github/workflows/ci.yml',
    group: 'script-output',
  },
  { term: 'abaixo de 2 KiB', source: '.github/workflows/ci.yml', group: 'script-output' },
  {
    term: 'reexecuta: abandonados',
    source: '.github/workflows/ci.yml',
    group: 'script-output',
  },
  { term: 'não reexecuta:', source: '.github/workflows/ci.yml', group: 'script-output' },
  { term: 'não tem a CSP', source: 'pwa/csp.ts', group: 'script-output' },
  { term: 'atributo style', source: 'pwa/csp.ts', group: 'script-output' },
  { term: 'handler inline', source: 'pwa/csp.ts', group: 'script-output' },
  {
    term: 'o perfil static não pode ter a diretiva',
    source: 'pwa/csp.ts',
    group: 'script-output',
  },
  {
    term: 'Estado da execução',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Mapping Fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Fila de issues',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Registro de passos',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Fila de desenvolvimento',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Supervisão da fila',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Mapping - Backlog',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Mapping - testes',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'main protegida',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'evidencias',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Uso real',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'observador-da-fila',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Madrugadão',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  { term: 'Janela Comentários', source: 'docs/DESIGN-SYSTEM.md', group: 'names' },
  {
    term: 'Mesclar (Recomendado)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Ainda não',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Segurar',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Fechar e reabrir',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Esperar',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Começar nesta ordem (Recomendado)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Mudar a ordem',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Usar um painel novo (Recomendado)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Usar este mesmo',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: "horário inválido '{value}' (use ISO UTC como 2026-11-08T16:00:11Z)",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{p} não existe (rode `init` antes)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'meta.json está vazio',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "issue '{num}' inválida (use '#123')",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "{k} precisa ser inteiro, veio '{v}'",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "{k} inválido '{v}'; válidos: ",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'já existem: ',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '--paralelo precisa ser um inteiro a partir de 1',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válidos: ",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'não é possível trocar o campo issue',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{issue} não está na fila',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{i} não está aguardando (ou não está na fila)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{a.issue} não está na fila',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válidos: kind, label",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'label= só com kind=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "{k} precisa ser numérico, veio '{v}'",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válidos: usd, ctx, model, effort, served, issue, kind",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'falta {k}=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{a.session} é uma sessão nova: falta kind=<tipo>',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "não achei scripts/ci/contextUsage.mjs (procurei em {script or 'nenhuma raiz de repositório'})",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'não consegui rodar {script}: {e}',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "sem medida ({values.get('motivo', 'sem motivo')}): ",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'a medida falhou (código {out.returncode}): {(out.stderr or out.stdout).strip()}',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '--max só vale com --medir',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "--fonte só aceita get_session, veio '{a.fonte}'",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '--fonte não vale com --medir (a fonte vem do script)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '--medir precisa de --max <max_tokens> (o do get_session sem session_id)',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "--max precisa ser um inteiro positivo, veio '{a.max}'",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "pct precisa ser inteiro de 0 a 100, veio '{raw}'",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "papel inválido '{a.role}'; válidos: {', '.join(ROLES)}",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'o id da sessão não pode ser vazio',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válido: link",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "pedido '{v}' inválido (use SUP-<n>, como SUP-3)",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válidos: tipo, pedido, estado, evidencia",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'falta estado=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{rid} é um pedido novo: falta {k}=',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{rid} já existe com {k}={req.get(k)!r}: o {k} não muda',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válidos: origem, saida",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'falta origem=<dono|SUP-n>',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "campo desconhecido '{k}'; válido: motivo",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{a.args[0]} não existe em meta.rules',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '{a.args[0]} já foi encerrada',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "ação inválida '{a.action}'; válidas: add, end",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: "{a.dir} já tem fila ({len(new.get('queue'))} linhas): o import precisa de uma pasta nova (`init`)",
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'não consegui ler {src}: {e.strerror}',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'linha {n}: `{words[0]}` não entra no lote',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'o lote não tem nenhum comando',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'linha {n}: ajuda (-h) não entra no lote',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: '--com \'{item}\' inválido (use "#N=<toca>")',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'ci.yml sem a chave jobs:.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: 'A execução ${run.id} tem created_at ilegível.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: 'O now (--now) "${now}" não é uma data ISO.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: 'O arquivo de jobs não tem a lista jobs.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: 'O arquivo de execuções não tem a lista workflow_runs.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: 'O arquivo de jobs não tem total_count nem a lista jobs.',
    source: 'scripts/ci/ciRerun.mjs',
    group: 'error-messages',
  },
  {
    term: '${flag} repetida: use uma vez só. ${USAGE}',
    source: 'scripts/ci/contextUsage.mjs',
    group: 'error-messages',
  },
  {
    term: '${file}: history precisa ser uma lista de frases (strings).',
    source: 'scripts/ci/distBudget.mjs',
    group: 'error-messages',
  },
  {
    term: 'O arquivo tem teto ${data.indexHtmlMaxBytes}, não ${d.ceiling}.',
    source: 'scripts/ci/distBudget.mjs',
    group: 'error-messages',
  },
  {
    term: '${a} precisa de um valor.',
    source: 'scripts/ci/distBudget.mjs',
    group: 'error-messages',
  },
  {
    term: '--${name} precisa de um número inteiro de bytes.',
    source: 'scripts/ci/distBudget.mjs',
    group: 'error-messages',
  },
  {
    term: '--write precisa de --epic <nome>.',
    source: 'scripts/ci/distBudget.mjs',
    group: 'error-messages',
  },
  {
    term: '--base precisa de um valor.',
    source: 'scripts/ci/riskTriggers.mjs',
    group: 'error-messages',
  },
  {
    term: 'SERVER_VERSION não encontrada em mcp/version.ts.',
    source: 'scripts/release/stableRelease.mjs',
    group: 'error-messages',
  },
  {
    term: 'Versão inválida: "${version}" (esperado x.y.z).',
    source: 'scripts/release/stableRelease.mjs',
    group: 'error-messages',
  },
];
