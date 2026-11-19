// Frozen machine vocabulary (decision 16 of #741): Portuguese terms that stay as they are
// because a script, a skill or a scheduled prompt reads or writes them. Changing one of them
// means changing its producer and every reader in the same PR, so the list is closed: a term
// is added only after checking that something really matches on it. `source` is the
// repo-relative file that produces or reads the term. The guard
// (`tests/tooling/portugueseGuard.test.ts`, decision 10 of #741) accepts these terms inside
// backticks or quotes only; the `record-titles` terms are also accepted without quotes on the
// heading lines and at the start of a line of the records in `changelog/` and
// `docs/design-system/`, where they are the fixed titles (decision 3).
//
// The rest of this file is the guard's exception list (decision 2 of #741): whole files and
// folders (`PORTUGUESE_PATHS`), a managed block of a file (`PORTUGUESE_BLOCK_ONLY`) and single
// lines (`PORTUGUESE_LINES`). Every entry has a reason; an entry without one is a test failure.

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
    term: 'recusada',
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
    term: 'merge pedido ao dono:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
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
    term: 'histórico:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'conferidos há',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'linhas sem sessão',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'intervenções',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'sequência',
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
  {
    term: 'Via rápida #<n> pronta',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Via rápida #<n> recusada',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Via rápida: na fila do painel',
    source: '.claude/skills/via-rapida/SKILL.md',
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
  {
    term: 'Canário B (#1889): esta sessão roda em `medium`; o item 10 continua no nível da tabela.',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Canário <id> revertido',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
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
  { term: 'não tem a CSP', source: 'pwa/csp.ts', group: 'script-output' },
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
    term: 'observador-da-fila',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  { term: 'Janela Comentários', source: 'docs/DESIGN-SYSTEM.md', group: 'names' },
  {
    term: 'mesclar #<n>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'ainda não #<n>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'pronta para mesclar',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Mesclar (Recomendado)',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Ainda não',
    source: '.claude/skills/via-rapida/SKILL.md',
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
    term: '${flag} repetida: use uma vez só. ${USAGE}',
    source: 'scripts/ci/contextUsage.mjs',
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
  // ID10 sweep: terms added by area A1 (skills, docs/FLOW.md)
  {
    term: 'Teto do dist/index.html acima dos limites',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'acima dos limites',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'para o dono revisar',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'subiu <K> KiB, de X para Y, pela regra do orçamento',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'ESFORÇO HIGH',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Sobreposição',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'item 8 da "Para a sessão da fase"): pergunte no seu chat',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: '#<número>: <N> achados (<código>:<severidade>, …); reteste: sim|não',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Revisão: <N> achados, <X> corrigidos',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Revisão: não se aplica',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Subagentes: <n> <modelo> <esforço>, …',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: '; subagentes <n> <modelo> <esforço>, …',
    source: 'docs/TESTING-NUVEM.md',
    group: 'session-notices',
  },
  {
    term: 'falso: <rótulo do reteste>:<sev>, …',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'candidatos a teste: <papel> <modelo> <esforço> → <degrau> (<k> seguidas)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'script-output',
  },
  {
    term: 'sem ligação',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'ativo',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'em avaliação',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'encerrado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'revertido',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'terminado pelo dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'pode promover',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'não promover',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'canário',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'retrabalhos',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'canários:',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: '<rótulo>: ainda trabalhando',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: '<rótulo>: custo lido com a sessão ainda trabalhando',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: '<rótulo>: medida de contexto divergente (aviso <n> mil, get_session <ctx> mil)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: '(é ciclo|não é ciclo)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'Pedido de permissão',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'pedido de permissão',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'registre o que pedia a autorização em Defeitos pendentes, não contorne a guarda e termine o que não depende dela',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'a sessão anterior (<id>) parou esperando o dono em: <motivo do wait>; pergunte de novo',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'a sessão anterior (<id>) parou em: <o que os eventos mostram>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'CI do PR #<n> preso na fila sem jobs há <m> min: <link>. Fecho e reabro o PR?',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: '#<etapa> — Fecho e reabro o PR #<n> para criar uma execução nova do CI?',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'cria uma execução nova no mesmo commit; a presa fica como está',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'nada muda; a conferência de hora em hora segue lendo o CI',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: ' #<n> para criar uma execução nova do CI (execução presa na fila). Não é recusa: o PR volta aberto; recomece a Espera do CI como depois de um push.',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'tem uma ready nova',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'entraram mais ready',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Nova ready #n incluída depois da #m (porquê)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'faça a #X primeiro',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'a #Y por último',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'tira a #Z',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'a #741 sempre por último',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'ordem do dono (<restrição>)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'panel-values',
  },
  {
    term: 'só com a fila vazia',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'entra no próximo detalhamento',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'essa ainda não está pronta',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'não comece mais nada',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'drene a fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'termine o que está rodando e pare',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Etapa #<n> pronta: <resumo>. PR do épico: <link>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'mande seus avisos para',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: '<id desta sessão>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Fila passou para uma sessão nova',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'esperando você',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'este chat é o coordenador; abra uma sessão nova para a supervisão',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Supervisão acima de 50% e sem vaga na linhagem: abra uma sessão nova e mande',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Supervisão',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'Via rápida #<n>',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Via rápida #<n> pronta: <resumo>. PR do épico: <link>',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: '#<n> — mesclar o épico na main?',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Margem de $margin bytes até o orçamento de $INDEX_HTML_MAX_BYTES bytes',
    source: '.github/workflows/ci.yml',
    group: 'script-output',
  },
  {
    term: 'em AAAA-MM-DD: versão <n>',
    source: 'docs/DESIGN-SYSTEM.md',
    group: 'record-titles',
  },
  {
    term: 'Versões <n> e <m>',
    source: 'docs/DESIGN-SYSTEM.md',
    group: 'record-titles',
  },
  {
    term: 'A versão atual do formato é a N',
    source: 'docs/PROCESS.md',
    group: 'script-output',
  },
  {
    term: '13. Versão',
    source: 'docs/PROCESS.md',
    group: 'script-output',
  },
  // ID10 sweep: terms added by area A2 (queue tests)
  { term: '<link do comentário>', source: 'docs/FLOW.md', group: 'session-notices' },
  {
    term: '<link da execução>',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'passagem em <link do comentário>',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'passou a vez com <n> mil; a passagem está em <link>',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Sobreposição',
    source: '.claude/skills/detalhar-backlog/SKILL.md',
    group: 'script-output',
  },
  {
    term: 'troque de sessão',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'reteste: não',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'script-output',
  },
  {
    term: 'Fecho e reabro o PR #<n> para criar uma execução nova do CI?',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'para o dono revisar',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'sessão <k> de 5',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'começa',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'panel-values',
  },
  {
    term: 'liberada pelo dono',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'drenando para a exclusiva',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'horário inválido',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'já é o registrado',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'sem medida',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'medida velha (há',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'meça com',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'esperando o coordenador',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'sessões',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'não entra no lote',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'error-messages',
  },
  {
    term: 'não achado',
    source: 'scripts/ci/contextUsage.mjs',
    group: 'script-output',
  },
  {
    term: 'pedido de permissão',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'aguardando o dono abrir a sessão nova da fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'arquivada',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Conferência da fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'a fase não avisou',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'CI preso na fila',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Fecho e reabro o PR',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'owner-chat',
  },
  {
    term: 'Fase <código> da',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'passou de 300 mil',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'aviso ao dono',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'direção enviada',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: '<regra> → <o que faço agora>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: '<código>',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'bloqueia',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'script-output',
  },
  {
    term: 'média',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'script-output',
  },
  {
    term: 'Teto do dist/index.html acima dos limites',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'acima dos limites',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'tentativas 1 a 3',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  // ID10 sweep: terms added by area A3 (other tooling tests, scripts/ci, scripts/release, pwa)
  {
    term: 'épico `epic/',
    source: 'tests/tooling/changelog.test.ts',
    group: 'record-titles',
  },
  {
    term: '<rótulo>: medida de contexto divergente (aviso <n> mil, get_session <ctx> mil)',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'custo lido com a sessão ainda trabalhando',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'Troca de sessão da fase <código>: contexto <n> mil; passagem em',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Fase <código> —',
    source: 'scripts/ci/contextGuard.mjs',
    group: 'session-notices',
  },
  {
    term: 'Conferência do orquestrador: a fase não avisou. Retome do ponto em que parou (CI do PR, merge, aviso) e avise o coordenador.',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'a sessão anterior (<id>) parou em: <o que os eventos mostram>',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Supervisão acima de 50% e sem vaga na linhagem',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'este chat é o coordenador; abra uma sessão nova para a supervisão',
    source: '.claude/skills/supervisionar-fila/SKILL.md',
    group: 'session-notices',
  },
  {
    term: 'sem custo (fora das contas)',
    source: '.claude/skills/supervisionar-fila/custo.py',
    group: 'script-output',
  },
  {
    term: 'Crie uma issue roadmap (ou bug, se for defeito):',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'Coordenador: `<id da sessão do orquestrador>`',
    source: 'docs/FLOW.md',
    group: 'session-notices',
  },
  {
    term: 'parâmetro fora da ficha',
    source: 'src/i18n/modelMessagesTemplatesPtBR.ts',
    group: 'script-output',
  },
  // ID10 sweep: terms added by area B (docs, changelog, libraries, examples, scripts/testing)
  {
    term: 'Selecione onde este site pode salvar mudanças',
    source: 'scripts/testing/cloud.mjs',
    group: 'names',
  },
  {
    term: 'Selecione uma pasta que este site pode ver',
    source: 'scripts/testing/cloud.mjs',
    group: 'names',
  },
  { term: 'Onde o projeto é salvo', source: 'scripts/testing/cloud.mjs', group: 'names' },
  { term: 'título', source: 'scripts/testing/round-guide.mjs', group: 'script-output' },
  {
    term: 'já é o registrado; nada mudou',
    source: '.claude/skills/implementar-fila/painel/painel.py',
    group: 'script-output',
  },
  {
    term: 'Versões',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Versão',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Versão N não foi gravada',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  {
    term: 'Nada gravado ainda:',
    source: 'tests/tooling/designSystemLog.test.ts',
    group: 'record-titles',
  },
  { term: 'CR por épico', source: 'docs/FLOW.md', group: 'names' },
  // ID10 sweep: terms added by area C (src, viewer, other tests)
  {
    term: 'Acima dos limites:',
    source: 'changelog/2026-11-13-teto-sempre-sobe.md',
    group: 'script-output',
  },
  {
    term: 'Via rápida:',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Via rápida recusada:',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'Origem: via rápida #',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'issue-markers',
  },
  {
    term: 'nenhuma (só processo)',
    source: '.claude/skills/via-rapida/SKILL.md',
    group: 'issue-markers',
  },
  { term: 'Exceção ao Button:', source: 'docs/DESIGN-SYSTEM.md', group: 'issue-markers' },
  {
    term: 'Madrugadão',
    source: '.claude/skills/implementar-fila/SKILL.md',
    group: 'names',
  },
  {
    term: 'novo método',
    source: 'tests/tooling/queueSlots.test.ts',
    group: 'script-output',
  },
  {
    term: 'group="Comentários"',
    source: 'docs/design-system/2026-11-10-sincronia-ds-2.md',
    group: 'names',
  },
  {
    term: 'group="Diálogos"',
    source: 'docs/design-system/2026-11-10-sincronia-ds-2.md',
    group: 'names',
  },
];

// ---------------------------------------------------------------------------------------------
// Exception list of the Portuguese guard (decision 2 of #741). Nothing outside it may carry
// Portuguese; a new entry needs a reason and fits one of the cases that decision 2 allows.
// ---------------------------------------------------------------------------------------------

/** A file (`path`) or a folder (`path` ending in `/`) that may carry Portuguese as a whole. */
export interface PathException {
  readonly path: string;
  /** Files inside a folder entry that are NOT exempt (they are scanned as any other file). */
  readonly except?: readonly string[];
  /** The file carries a `pt-BR kept:` comment with the reason (the test checks it is still there). */
  readonly annotated?: boolean;
  readonly reason: string;
}

/**
 * Test files that keep Portuguese on purpose and say why in a `pt-BR kept:` comment (phase ID6):
 * shared fixture data (names of `sampleProject` and the like), the object of a test that is the
 * Portuguese text itself, or a value the engine matches. The reason below is the one in the file.
 */
export const ANNOTATED_FILES: readonly PathException[] = [
  {
    path: 'tests/app/shortcuts.test.ts',
    annotated: true,
    reason:
      'ç is the character macOS Option+C produces (a key value, not Portuguese text)',
  },
  {
    path: 'tests/canvas/harness.ts',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/canvas/renderers, tests/canvas/input and tests/app (layer 'Lataria', markings 'Porta' and 'Maçaneta', annotation 'Amassado' and its pairs)",
  },
  {
    path: 'tests/canvas/renderPerformance.test.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model (tests/fixtures/material3 node names and values)',
  },
  {
    path: 'tests/canvas/renderers/markings.test.ts',
    annotated: true,
    reason:
      'shared fixture data (sampleProject) asserted by tests/model, tests/components',
  },
  {
    path: 'tests/canvas/renderers/overlay.test.ts',
    annotated: true,
    reason:
      'shared fixture data (sampleProject) asserted by tests/model, tests/components',
  },
  {
    path: 'tests/components/CitationEditor.test.tsx',
    annotated: true,
    reason: 'shared fixture data asserted by tests/model (sampleProject)',
  },
  {
    path: 'tests/components/CommentsWindow.test.tsx',
    annotated: true,
    reason: 'shared fixture data asserted by tests/model (threadFixtures HUMAN email)',
  },
  {
    path: 'tests/components/Composer.test.tsx',
    annotated: true,
    reason: 'shared fixture data asserted by tests/model (sampleProject)',
  },
  {
    path: 'tests/components/Details.test.tsx',
    annotated: true,
    reason: 'shared fixture data asserted by tests/model (specFixtures)',
  },
  {
    path: 'tests/components/DiagnosticsComponents.test.tsx',
    annotated: true,
    reason: 'asserts that the Portuguese strings are absent in en-US',
  },
  {
    path: 'tests/components/DiagnosticsView.test.tsx',
    annotated: true,
    reason: 'raw pt-BR fallback message of the model issue, only input data',
  },
  {
    path: 'tests/components/Home.test.tsx',
    annotated: true,
    reason:
      'the object of the test is accent- and case-insensitive search of Portuguese text',
  },
  {
    path: 'tests/components/LinkDialog.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model, tests/mcp (group names of specV11Fixtures)',
  },
  {
    path: 'tests/components/ReadingDirection.test.tsx',
    annotated: true,
    reason: 'the object of this half of the test is the Portuguese dictionary',
  },
  {
    path: 'tests/components/SameLayerLink.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model (role name "Falha" of sameLayerFixtures)',
  },
  {
    path: 'tests/components/SpecsDialog.test.tsx',
    annotated: true,
    reason: 'the pt-BR rendering of the model message is the object of the test',
  },
  {
    path: 'tests/components/TableRefCell.test.tsx',
    annotated: true,
    reason:
      'shared fixture data (names such as Alvo, alvos, Cliente.cpf, Glossário.termo) asserted by tests/model and tests/store',
  },
  {
    path: 'tests/components/arrowLinks.test.tsx',
    annotated: true,
    reason:
      'shared fixture data (Porta, Maçaneta, Lataria, Vidros) asserted by tests/model',
  },
  {
    path: 'tests/components/arrows.test.tsx',
    annotated: true,
    reason: 'shared fixture data (Porta, Maçaneta) asserted by tests/model',
  },
  {
    path: 'tests/components/bottomWindows.test.tsx',
    annotated: true,
    reason:
      'shared fixture data (Porta, Maçaneta, Vidros, amassado, trinca, Título, Clique) asserted by tests/model',
  },
  {
    path: 'tests/components/canvasMarkings.test.tsx',
    annotated: true,
    reason:
      'shared fixture data (Porta, Maçaneta, images/frente) asserted by tests/model',
  },
  {
    path: 'tests/components/catalog/CatalogView.test.tsx',
    annotated: true,
    reason: 'asserts that no Portuguese text leaks into en-US',
  },
  {
    path: 'tests/components/citeMenus.test.tsx',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/model (cadastroProject field key 'texto'; sampleProject names 'Maçaneta', 'Amassado', 'images/frente.jpg'; harness folder 'projeto')",
  },
  {
    path: 'tests/components/copyActions.test.tsx',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/model (sampleProject names 'Maçaneta', 'images/frente.jpg' and the harness folder 'projeto')",
  },
  {
    path: 'tests/components/crumbsPath.test.tsx',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta' and the review fixture 'Formulário')",
  },
  {
    path: 'tests/components/editorWindows.test.tsx',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta')",
  },
  {
    path: 'tests/components/locks.test.tsx',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/model (sampleProject names 'Porta', 'Maçaneta', 'Fechadura', 'images/lateral.jpg')",
  },
  {
    path: 'tests/components/noticeFixtures.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/components and tests/model (spec id, names and notice messages)',
  },
  {
    path: 'tests/components/review/details.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model and tests/store (names from sampleProject, richScenario and firstImport: Porta, Fechadura, Lataria, Vidros, Amassado, gravidade, Formulário, Importação, Eventos)',
  },
  {
    path: 'tests/components/review/itemHeader.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/store and tests/model (names Porta, Maçaneta, Vidros, Formulário from richScenario, sampleProject and firstImport)',
  },
  {
    path: 'tests/components/review/navigation.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model (names from sampleProject, e.g. Vidros, tipo)',
  },
  {
    path: 'tests/components/review/programmaticFocusPaths.test.tsx',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model (annotation name Título from cadastroProject)',
  },
  {
    path: 'tests/components/review/reviewHarness.tsx',
    annotated: true,
    reason: 'shared fixture data asserted by tests/components and tests/canvas',
  },
  {
    path: 'tests/components/review/reviewMode.test.tsx',
    annotated: true,
    reason:
      "shared fixture data (item 'Botão') asserted by tests/store and tests/components",
  },
  {
    path: 'tests/components/review/revisedFixture.ts',
    annotated: true,
    reason: 'shared fixture data asserted by tests/store (revisedGuard)',
  },
  {
    path: 'tests/components/review/shownProject.test.tsx',
    annotated: true,
    reason:
      "shared fixture data (marking 'Formulário' from firstImport) asserted by tests/components Read at each use: the language is only set in `beforeEach`.",
  },
  {
    path: 'tests/components/treeWindow.test.tsx',
    annotated: true,
    reason:
      'shared fixture data (names Porta, Maçaneta, Fechadura, Lataria, Vidros, image files lateral/frente of sampleProject) asserted by tests/',
  },
  {
    path: 'tests/components/viewModePanel.test.tsx',
    annotated: true,
    reason:
      "shared fixture data (layers 'Camada A', 'Camada B', 'Só dados' of viewModeFixtures) asserted by tests/canvas and tests/store",
  },
  {
    path: 'tests/components/wrapMenus.test.tsx',
    annotated: true,
    reason:
      "shared fixture data (names Porta, Maçaneta, Fechadura, image 'frente.jpg' of sampleProject) asserted by tests/",
  },
  {
    path: 'tests/e2e/helpShortcutsLine.spec.ts',
    annotated: true,
    reason: 'the object of the test is the width of the pt-BR text of the shortcuts row',
  },
  {
    path: 'tests/model/annotations.test.ts',
    annotated: true,
    reason:
      "the keys and values 'tipo', 'gravidade' and 'média' come from the sampleProject fixture",
  },
  {
    path: 'tests/model/citations.test.ts',
    annotated: true,
    reason:
      'the names titulo, campos, alvos, cpf, nome, termo, Cliente, Lista, Alvos and Glossário come from refColumnFixtures (data of the fixture) Project: I1 (a.png) with M1, M2, M3 (unnamed); AM (model "Cliente", table campos with the row',
  },
  {
    path: 'tests/model/citeTargets.test.ts',
    annotated: true,
    reason:
      'the names titulo, campos, alvos, cpf, nome, termo, solto, principal, Modelo, Cliente, Alvos and Glossário come from refColumnFixtures (data of the fixture)',
  },
  {
    path: 'tests/model/codeBlueprint.test.ts',
    annotated: true,
    reason:
      'the names, keys, values and notes asserted here (Formulário, Cadastrar, Componentes, Eventos, texto, estilo, ...) come from specFixtures / variantsFixtures (data of the fixtures)',
  },
  {
    path: 'tests/model/codeLocations.test.ts',
    annotated: true,
    reason: 'platform name of the sdui example, which is Portuguese data.',
  },
  {
    path: 'tests/model/components/expressions.test.ts',
    annotated: true,
    reason:
      "'não' is in the engine's falsy set (FALSY_TEXT in src/model/components/expressions.ts)",
  },
  {
    path: 'tests/model/components/instantiate.test.ts',
    annotated: true,
    reason:
      'boolean enum values "sim"/"não" of the engine (FALSY_TEXT in expressions.ts)',
  },
  {
    path: 'tests/model/components/origin.test.ts',
    annotated: true,
    reason: 'default screen id of the engine (src/model/components/origin.ts)',
  },
  {
    path: 'tests/model/invalidFixtures.ts',
    annotated: true,
    reason:
      'the generated JSON in tests/fixtures/invalid/ must stay byte-identical (outside this batch)',
  },
  {
    path: 'tests/model/invariants.test.ts',
    annotated: true,
    reason: 'name comes from sampleProject in fixtures.ts (outside this batch)',
  },
  {
    path: 'tests/model/itemRef.test.ts',
    annotated: true,
    reason: 'the non-ASCII character is the object of the encoding test',
  },
  {
    path: 'tests/model/markdown.test.ts',
    annotated: true,
    reason: 'the accents stripped from the slug are the object of the test',
  },
  {
    path: 'tests/model/material3ComposeM2.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM3.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM4.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM4GrupoA.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM4GrupoC.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM5.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM5DatePicker.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ComposeM5GrupoA.test.ts',
    annotated: true,
    reason: "'não cabe' is the pt-BR text of the warning emitted by src/model",
  },
  {
    path: 'tests/model/material3ExpressoesEx4.test.ts',
    annotated: true,
    reason:
      'node names of libraries/material3-compose and of tests/fixtures/material3-ex4-v1.json are Portuguese data',
  },
  {
    path: 'tests/model/material3ExpressoesEx6Carousel.test.ts',
    annotated: true,
    reason:
      'node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data',
  },
  {
    path: 'tests/model/material3ExpressoesEx6Slider.test.ts',
    annotated: true,
    reason:
      'node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data',
  },
  {
    path: 'tests/model/material3Mc5GrupoA.test.ts',
    annotated: true,
    reason:
      'the warning texts may come in pt-BR (`não cabe`, `$lines instável`) as well as in English',
  },
  {
    path: 'tests/model/material3Mf4Regression.test.ts',
    annotated: true,
    reason:
      'the frozen fixture tests/fixtures/material3-mf4-before.json holds the Portuguese node and example names (EXCEPTIONS, L2_EXAMPLES): they are mapped to the English ones the library draws now (tests/support/material3OldNames.ts)',
  },
  {
    path: 'tests/model/proposalChanges.test.ts',
    annotated: true,
    reason: 'shared fixture data (sampleProject entries) asserted by other tests',
  },
  {
    path: 'tests/model/refAnnotation.test.ts',
    annotated: true,
    reason:
      'shared fixture data (refAnnotationFixtures) asserted by tests/components and tests/ui',
  },
  {
    path: 'tests/model/refAnnotationFixtures.ts',
    annotated: true,
    reason:
      'shared fixture data (ids, names and keys of the spec) asserted by tests/components, tests/ui and tests/model',
  },
  {
    path: 'tests/model/refColumn.test.ts',
    annotated: true,
    reason:
      'shared fixture data (refColumnFixtures) asserted by tests/components and tests/store',
  },
  {
    path: 'tests/model/refColumnFixtures.ts',
    annotated: true,
    reason:
      'shared fixture data (spec ids, names and keys; project names and values) asserted by tests/components, tests/store and tests/model',
  },
  {
    path: 'tests/model/refGrammar.test.ts',
    annotated: true,
    reason: 'accented characters are the object of the round-trip test',
  },
  {
    path: 'tests/model/repair.test.ts',
    annotated: true,
    reason: 'shared fixture data (sampleProject names) asserted by other tests',
  },
  {
    path: 'tests/model/scaleProject.ts',
    annotated: true,
    reason:
      "shared fixture data asserted by tests/scale/mcp (mcpGrowth expects 'Dúvida')",
  },
  {
    path: 'tests/model/schemaV4.test.ts',
    annotated: true,
    reason:
      'shared fixture data (cadastroProject, specProject, sampleProject: Portuguese field keys, names and values) asserted by tests/mcp, tests/components and others',
  },
  {
    path: 'tests/model/serialization.test.ts',
    annotated: true,
    reason:
      'unicode (accents) is the object of the test, in the shared sampleProject entries',
  },
  {
    path: 'tests/model/specFixtures.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/mcp, tests/components, tests/store, tests/storage, tests/app and tests/model (Portuguese marking names, field keys and values, layer ids)',
  },
  {
    path: 'tests/model/specV11.test.ts',
    annotated: true,
    reason:
      'shared fixture data (specV11Fixtures: layers `componentes`/`eventos`, groups `navegacao`/`dados`, names `Navegação`/`Dados`), asserted by tests/mcp',
  },
  {
    path: 'tests/model/specV11Fixtures.ts',
    annotated: true,
    reason:
      'shared fixture data (ids and names asserted by tests/mcp, tests/components and tests/model) /',
  },
  {
    path: 'tests/model/specV4.test.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model/spec.test.ts (tests/fixtures/specs/biblioteca.json)',
  },
  {
    path: 'tests/model/threadFilters.test.ts',
    annotated: true,
    reason: 'accent-insensitive search is the object of the text filter tests below',
  },
  {
    path: 'tests/model/threadUsers.test.ts',
    annotated: true,
    reason: 'the object is the sorting of accented Portuguese names',
  },
  {
    path: 'tests/model/typeChoice.test.ts',
    annotated: true,
    reason: 'accent-insensitive search is the object (Botão, ação, Cartão below)',
  },
  {
    path: 'tests/model/typedDisplay.test.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/mcp, tests/components, tests/examples (cadastroProject/codeProject)',
  },
  {
    path: 'tests/scale/mcp/mcpGrowth.scale.ts',
    annotated: true,
    reason:
      'shared fixture data (thread text `Dúvida` of buildScaleThreads in tests/model/scaleProject.ts)',
  },
  {
    path: 'tests/store/proposalHarness.ts',
    annotated: true,
    reason:
      "shared fixture data (names 'Porta dianteira', 'Botão' and the path 'nova.webp') asserted by tests/components and tests/store",
  },
  {
    path: 'tests/store/viewModeFixtures.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/components, tests/canvas (spec id, layer and type names)',
  },
  {
    path: 'tests/support/material3Library.ts',
    annotated: true,
    reason:
      'the names of the examples of the FROZEN v1 fixture (tests/fixtures/material3-*-v1.json), which stay in Portuguese',
  },
  {
    path: 'tests/support/material3OldNames.ts',
    annotated: true,
    reason: 'the keys are Portuguese data of the frozen fixtures.',
  },
  {
    path: 'tests/ui/changeText.test.ts',
    annotated: true,
    reason:
      'shared fixture data asserted by tests/model, tests/components (marking names of sampleProject)',
  },
  {
    path: 'tests/ui/labels.test.ts',
    annotated: true,
    reason: 'the test checks the default name in both locales',
  },
  {
    path: 'tests/ui/relativeTime.test.ts',
    annotated: true,
    reason:
      'the object of most tests is the pt-BR relative-time text (and the en-US one in one test)',
  },
  {
    path: 'tests/ui/specHelp.test.ts',
    annotated: true,
    reason: 'matches the pt-BR help text',
  },
  {
    path: 'tests/ui/specPackageImport.test.ts',
    annotated: true,
    reason: 'a multi-byte accented character is the test data (UTF-8 byte count)',
  },
  {
    path: 'tests/ui/suggestions.test.ts',
    annotated: true,
    reason: 'accented Portuguese letters are the object (Unicode word characters)',
  },
  {
    path: 'tests/utils/search.test.ts',
    annotated: true,
    reason: 'accent normalization of Portuguese text is the object',
  },
];

export const PORTUGUESE_PATHS: readonly PathException[] = [
  ...ANNOTATED_FILES,
  // ID10 sweep: file entries added by area A1
  // ID10 sweep: file entries added by area A2
  // ID10 sweep: file entries added by area A3
  // ID10 sweep: file entries added by area B
  // ID10 sweep: file entries added by area C
  {
    path: 'tests/tooling/portugueseAllowlist.ts',
    reason:
      'this list: it holds the Portuguese protocol terms of decision 16 and quotes the exempted text in the reasons',
  },
  {
    path: 'tests/tooling/portugueseGuard.test.ts',
    reason: 'the tests of the guard itself feed it Portuguese sample lines and terms',
  },
  {
    path: 'tests/fixtures/material3-mf4-before.json',
    reason:
      'frozen render snapshot taken before the Material 3 names were translated, input of the MF4 regression test',
  },
  {
    path: 'tests/fixtures/material3/',
    reason:
      'fixture copy of a Material 3 package whose node names, keys and values are Portuguese data asserted by tests/model (annotated there)',
  },
  {
    path: 'tests/fixtures/specs/biblioteca.json',
    reason:
      'shared fixture specification whose names are asserted by tests/model/spec.test.ts and specV4.test.ts',
  },
  {
    path: 'tests/fixtures/sdui-v2.json',
    reason:
      'frozen old SDUI example specification (Portuguese platform and field names), input of the migration tests',
  },
  {
    path: 'tests/fixtures/sdui-v3.json',
    reason:
      'frozen old SDUI example specification (Portuguese platform and field names), input of the migration tests',
  },
  {
    path: 'tests/fixtures/invalid/',
    reason:
      'invalid-project fixtures: stored project data (field keys and option values such as "obrigatorio": "não") in Portuguese, like projects saved before the translation',
  },
  {
    path: 'tests/fixtures/workspace/AGENTS.old.md',
    reason:
      'frozen copy of the old Portuguese AGENTS.md, input of the test that updates the managed block of an existing file',
  },
  {
    path: 'src/i18n/pt-BR.ts',
    reason:
      'the pt-BR dictionary of the app (decision 2 of #741): the app stays bilingual',
  },
  {
    path: 'src/i18n/modelMessagesTemplatesPtBR.ts',
    reason:
      'the pt-BR templates of the model messages, part of the bilingual app (decision 2 of #741)',
  },
  {
    path: 'tests/i18n/',
    reason:
      'locale tests: they check the pt-BR text of the dictionaries and messages, and feed the model with the Portuguese strings it must translate (decision 2 of #741)',
  },
  {
    path: 'tests/fixtures/material3-ex4-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text: input of the migration tests; tests/support/material3V1Text.ts adopts the current text',
  },
  {
    path: 'tests/fixtures/material3-ex6-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text, input of the migration tests',
  },
  {
    path: 'tests/fixtures/material3-m2-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text, input of the migration tests',
  },
  {
    path: 'tests/fixtures/material3-m3-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text, input of the migration tests',
  },
  {
    path: 'tests/fixtures/material3-m4-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text, input of the migration tests',
  },
  {
    path: 'tests/fixtures/material3-m5-v1.json',
    reason:
      'frozen snapshot (v1) of the Material 3 package with the old Portuguese text, input of the migration tests',
  },
  {
    path: 'mappings-workspace/',
    // setup.sh and watch-comments.mjs are copies of examples/workspace/ that
    // mappingsWorkspaceSync.test.ts requires equal; AGENTS.md is scanned in its managed block.
    except: [
      'mappings-workspace/setup.sh',
      'mappings-workspace/watch-comments.mjs',
      'mappings-workspace/AGENTS.md',
    ],
    reason:
      "the owner's mapping data, isolated from the code (CLAUDE.md, decision 18 of #741): projects, specializations, design-system tools and notes in Portuguese",
  },
];

/**
 * Files whose Portuguese lives in a block marked in the file itself, between a line with
 * the begin marker (`PORTUGUESE_BLOCK_MARKERS.begin`, followed by the reason) and a line with the
 * end marker (`PORTUGUESE_BLOCK_MARKERS.end`), in any comment syntax.
 * Everything outside the blocks is scanned. The marker needs a reason.
 */
export const PORTUGUESE_BLOCK_MARKERS = {
  begin: 'portuguese-guard:' + 'begin',
  end: 'portuguese-guard:' + 'end',
} as const;

/**
 * Files scanned only inside the block between two marker lines (the rest of the file is
 * exempt): `mappings-workspace/AGENTS.md` keeps the managed block in English (the sync test
 * requires it equal to `examples/workspace/AGENTS.md`) and the rest is the owner's data.
 */
export interface BlockOnlyException {
  readonly path: string;
  readonly begin: string;
  readonly end: string;
  readonly reason: string;
}

export const PORTUGUESE_BLOCK_ONLY: readonly BlockOnlyException[] = [
  {
    path: 'mappings-workspace/AGENTS.md',
    begin: 'mapping:begin',
    end: 'mapping:end',
    reason:
      "only the managed block is scanned (it is English and equal to examples/workspace/AGENTS.md); the rest of the file is the owner's data (decision 18 of #741)",
  },
];

/** One line (or the lines that match `pattern`) of a file (or folder) that may keep Portuguese. */
export interface LineException {
  readonly path: string;
  readonly pattern: RegExp;
  readonly reason: string;
}

export const PORTUGUESE_LINES: readonly LineException[] = [
  {
    path: 'src/i18n/en-US.ts',
    pattern: /'language\.pt-BR': 'Português \(Brasil\)'/,
    reason:
      'the name of the pt-BR language in its own language, as the language selector shows it',
  },
  {
    path: 'examples/workspace/AGENTS.md',
    pattern:
      /^<!-- mapping:begin \(gerenciado pelo setup\.sh; não edite entre estas linhas\) -->$/,
    reason:
      'the begin marker of the managed block: setup.sh finds it in workspaces already installed, so its text cannot change',
  },
  {
    path: 'mappings-workspace/AGENTS.md',
    pattern:
      /^<!-- mapping:begin \(gerenciado pelo setup\.sh; não edite entre estas linhas\) -->$/,
    reason:
      'copy of the begin marker of the managed block (see examples/workspace/AGENTS.md)',
  },
  {
    path: 'examples/workspace/setup.sh',
    pattern: /^## Fluxo típico'$/,
    reason:
      'the last heading of OLD_HEADINGS, which recognizes the Portuguese AGENTS.md of older installs',
  },
  {
    path: 'mappings-workspace/setup.sh',
    pattern: /^## Fluxo típico'$/,
    reason: 'copy of examples/workspace/setup.sh (the sync test requires it equal)',
  },
  {
    path: 'tests/tooling/queueBatch.test.ts',
    pattern: /\/\^?não publicado/,
    reason:
      'expected panel output, frozen vocabulary of decision 16 (the `não publicado` line of `show`, in a regex literal)',
  },
  {
    path: 'tests/tooling/queuePlanPhases.test.ts',
    pattern: /\/não publicado desde/,
    reason:
      'expected panel output, frozen vocabulary of decision 16 (the `não publicado` line of `show`, in a regex literal)',
  },
  {
    path: 'tests/tooling/queueCiWait.test.ts',
    pattern: /\/horário inválido\//,
    reason:
      'expected panel output, frozen vocabulary of decision 16 (error text of painel.py, in a regex literal)',
  },
  {
    path: 'tests/tooling/queueCost.test.ts',
    pattern: /kind inválido|em \d sessões|\d sessões,|\/correção:\//,
    reason:
      'expected panel output, frozen vocabulary of decision 16 (cost lines and error text of painel.py, in regex literals)',
  },
  {
    path: 'tests/tooling/queueExclusive.test.ts',
    pattern: /Mudanças na fila|Quê\? \(já\)/,
    reason: 'fixtures of the accent-insensitive slug test',
  },
  {
    path: 'tests/tooling/queueOwnerAuthorization.test.ts',
    pattern: /Ninguém está olhando/,
    reason:
      'negative assertion: the Portuguese phrase that the phase prompt no longer carries',
  },
  {
    path: 'tests/tooling/queuePanel.test.ts',
    pattern: /\/aguardando o dono abrir|\/<código> arquivada\//,
    reason:
      'expected panel output, frozen vocabulary of decision 16 (phrases of the skill, in regex literals)',
  },
  {
    path: 'tests/tooling/queuePhaseContext.test.ts',
    pattern:
      /^ {2}'Retomada por contexto \(<k> de 5\)|\/Troca de sessão da fase <código>/,
    reason: 'frozen resume notice (session-notices, decision 16), a whole sentence',
  },
  {
    path: 'tests/tooling/queueConflict.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueFastTrackPanel.test.ts',
    pattern: /dep=\$\{dep\}|nenhuma|, há \d h|há \$\{/,
    reason:
      'fixture ficha of the panel (`nenhuma`, `mcp=não`) and the `há <h> h` of the `merge pedido ao dono:` line, frozen script output (decision 16 of #741)',
  },
  {
    path: 'tests/tooling/queueExclusive.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueGraph.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueImport.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueSlots.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueToca.test.ts',
    pattern: /dep=nenhuma|mcp=não|schema=não|schema = 'não'|ficha\('nenhuma'/,
    reason:
      'fixture ficha of the panel: `nenhuma` and the `não` value that the engine matches (decision 2 of #741)',
  },
  {
    path: 'tests/tooling/queueGraph.test.ts',
    pattern: /\bde: '[^']*'(, para: |\s*\})|\bpara: |para: string/,
    reason:
      '`para` is a key of the graph arrows that painel.py emits (`de`, `para`, `tipo`), frozen vocabulary of decision 16',
  },
  {
    path: 'tests/tooling/queuePanelPage.test.ts',
    pattern: /\bde: '[^']*'(, para: |\s*\})|\bpara: |para: string/,
    reason:
      '`para` is a key of the graph arrows that painel.py emits (`de`, `para`, `tipo`), frozen vocabulary of decision 16',
  },
  {
    path: '.claude/skills/implementar-fila/painel/painel.py',
    pattern: /\{de, para, tipo\}|"para": k/,
    reason:
      'the keys de/para/tipo of the arrows of meta.grafoSetas, written by painel.py and read by the panel page and the graph tests',
  },
  {
    path: '.claude/skills/implementar-fila/painel/painel.py',
    pattern: /v\.strip\(\) != "não"/,
    reason:
      'the ficha value "não" of mcp= and schema= (no MCP or schema change), the frozen panel value the queue tests write',
  },
  {
    path: '.claude/skills/implementar-fila/painel/painel.py',
    pattern: /troque de sessão agora \(\\"Troca de sessão\\"\)/,
    reason:
      'the context note of the show output, matched verbatim by tests/tooling/queueContext.test.ts and queueSlots.test.ts',
  },
  {
    path: '.claude/skills/implementar-fila/painel/index.html',
    pattern: /\.para\b|'para'|\bpara: /,
    reason:
      'the key para of the arrows of meta.grafoSetas ({de, para, tipo}), which painel.py writes and the page reads',
  },
  {
    path: '.claude/skills/supervisionar-fila/passagem/index.html',
    pattern: /<title>Supervisão da fila<\/title>/,
    reason:
      'the artifact name "Supervisão da fila", which the skill looks up by name and tests/tooling/supervisorSkill.test.ts matches',
  },
  {
    path: '.claude/skills/implementar-fila/painel/painel.py',
    pattern: /f", há \{minutes_since\(since\)/,
    reason:
      'the `há <h> h` of the `merge pedido ao dono:` line of `show`, frozen script output that the queue text and tests/tooling/queueFastTrackPanel.test.ts match',
  },
  {
    path: '.claude/skills/implementar-fila/SKILL.md',
    pattern: /kind: fase, correção, testador, reteste/,
    reason:
      'the session kinds painel.py accepts in kind= (frozen panel values), listed in the usage reference',
  },
  // ID10 sweep: line entries added by area A3
  {
    path: 'tests/tooling/cloudHelpers.test.ts',
    pattern: /'ãé✅'|'ç'/,
    reason:
      'accented characters are the object of the test: the body and the output cross a socket chunk whole',
  },
  {
    path: 'tests/tooling/scriptsCli.test.ts',
    pattern: /cópia-|répository|accént|ação ✓|Buffer\.from\('ç'\)/,
    reason:
      'accented paths and output are the object of the tests (the CLIs must handle non-ASCII text)',
  },
  {
    path: 'tests/tooling/roundGuide.test.ts',
    pattern: /\bquando\b/,
    reason:
      '`quando` is the field name of the exported SECOES_SOB_DEMANDA records of scripts/testing/round-guide.mjs',
  },
  // ID10 sweep: line entries added by area B
  {
    path: 'docs/TESTING.md',
    pattern: /Português \(Brasil\)/,
    reason:
      'the name of the pt-BR language in its own language, as the language selector shows it, in the pt-BR steps R8.x and R11.15 and their quoted pt-BR checks',
  },
  {
    path: 'docs/TESTING.md',
    pattern: /conteúdo maior que a caixa: switch|Ir para Árvore de marcações/,
    reason:
      'the pt-BR texts of the app that the pt-BR checks of R8.5c and R11.10 assert (quoted UI text)',
  },
  {
    path: 'docs/TESTING.md',
    pattern: /Fluxo típico/,
    reason:
      'the headings of the Portuguese AGENTS.md of older installs, which the awk of the step matches',
  },
  {
    path: 'docs/TESTING.md',
    pattern: /Quando o cartão abraça|O contrato aceita avatar; o SDK ainda não/,
    reason:
      'sample text whose wrapping R25.9 measures (scripts/testing/fiel.mjs) and the copy of the avisos-demo e2e fixture that testingGuide.test.ts compares',
  },
  {
    path: 'docs/TESTING.md',
    pattern:
      /Sair da página\?|Sair do site\?|Selecione onde|Selecione uma pasta|Não permitir|contém\s.*arquivos do sistema|Permitir que este site|Aviso: este site pode conferir/,
    reason:
      "titles and buttons of Chrome's own dialogs in pt-BR, which the cloud recipes look for (runtime data of the browser)",
  },
  {
    path: 'docs/COMPONENT-FORMAT.md',
    pattern: /"não", "nao"|\["sim", "não"\]/,
    reason:
      'the false values the engine recognizes and the stored options of a boolean enum field (decision 7 of #741)',
  },
  {
    path: 'libraries/kotlin/',
    pattern: /"não"/,
    reason:
      'the Kotlin options `sim`/`não` stay as stored data (decision 7 of #741): option, default and example values',
  },
  {
    path: 'examples/specs/sdui.json',
    pattern: /"não": "no"/,
    reason: 'option value `não` of the boolean mapping, stored data (decision 7 of #741)',
  },
  {
    path: 'examples/libraries/sdui-backend/sdui-backend.spec.json',
    pattern: /"não": "no"/,
    reason: 'option value `não` of the boolean mapping, stored data (decision 7 of #741)',
  },
  {
    path: 'scripts/testing/fiel.mjs',
    pattern: /Quando o cartão abraça/,
    reason:
      'sample text whose wrapping the R25.9 measurements of docs/TESTING.md depend on (W 150 to 202, H 56)',
  },
  {
    path: 'scripts/testing/round-guide.mjs',
    pattern: /\bquando\b/,
    reason:
      'field `quando` of SECOES_SOB_DEMANDA (Portuguese-named API: chave, titulo, fonte), read by tests/tooling/roundGuide.test.ts',
  },
  {
    path: 'scripts/testing/round-guide.d.mts',
    pattern: /\bquando\b/,
    reason: 'type of the `quando` field of SECOES_SOB_DEMANDA (see round-guide.mjs)',
  },
  {
    path: 'changelog/2026-11-14-english.md',
    pattern: /Português \(Brasil\)|`sim`\/`não`/,
    reason:
      'the pt-BR language name in its own language, and the Kotlin option values that stay as stored data (decision 7 of #741)',
  },
  // ID10 sweep: line entries added by area C
  {
    path: 'src/model/components/componentFormat.ts',
    pattern: /"não"/,
    reason:
      'the boolean text `"não"` that the components engine treats as false (FALSY_TEXT in expressions.ts; stored data, decision 7 of #741)',
  },
  {
    path: 'src/model/components/expressions.ts',
    pattern: /não/,
    reason:
      'FALSY_TEXT: the engine treats the Portuguese boolean words `não`/`nao` as false because stored projects use them (decision 7 of #741)',
  },
  {
    path: 'tests/e2e/guide.spec.ts',
    pattern: /'Próximo'|'Containers e marcações'|'Trancada e posição a revisar'/,
    reason:
      'the pt-BR half of the bilingual interactive guide: the test checks the pt-BR strings of the guide',
  },
  {
    path: 'tests/examples/guide.test.ts',
    pattern:
      /Container com marcações|Containers e marcações|você\|clique\|camada\|marcação/,
    reason:
      'the pt-BR half of the bilingual interactive guide, and the Portuguese words the test forbids in the English texts',
  },
  {
    path: 'tests/mcp/code.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/imageFixtures.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/images.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/read.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/threads.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/threadsRefs.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/workspace.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/write.test.ts',
    pattern: /Formulário|Título/,
    reason:
      'shared fixture data: the marking `Formulário` and the annotation `Título` of the `cadastro` workspace project (tests/mcp/workspace.ts, specFixtures), asserted across tests/mcp',
  },
  {
    path: 'tests/mcp/previewInBatch.test.ts',
    pattern: /disabled: 'não'/,
    reason:
      'the default value of the boolean field `disabled` of the frozen fixture material3-m3-v1.json (stored data)',
  },
  {
    path: 'tests/model/fixtures.ts',
    pattern: /Maçaneta|média/,
    reason:
      'shared fixture data (sampleProject: marking Maçaneta, pair value média) asserted by tests/model, tests/store and tests/components',
  },
];

/** Files of the repository that are not text or are generated and checked by another test. */
export const GUARD_SKIPPED_PATHS: readonly {
  readonly path: string;
  readonly reason: string;
}[] = [
  {
    path: 'public/guide/',
    reason:
      "the interactive guide generated by `npm run build:guide` from scripts/guide/ (bilingual: its pt-BR strings are the guide's own); a test checks that it is up to date, and its source is scanned",
  },
  {
    path: 'package-lock.json',
    reason: 'generated by npm; the names it lists are not text we write',
  },
];
