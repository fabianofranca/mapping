// @vitest-environment node
// Phase EA1 (stage #2373): `painel.py` starts a stage early when its only blockers are file conflicts with stages already in
// their tester (or closing), marks it with `cedo`, waits for the holders in the status `esperando entrega` and says when it can sync.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-20T20:00:00Z';
// Tests that spawn dozens of painel.py subprocesses: headroom for CI under load.
const SUBPROCESS_TIMEOUT = 30_000;

type Row = Record<string, unknown>;
type GraphNode = {
  issue: string;
  onda: number;
  estado: string;
  motivo: string;
  cedo: string;
};
type GraphArrow = { de: string; para: string; tipo: string };

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function read(name: string, folder = dir): Row[] {
  return JSON.parse(readFileSync(path.join(folder, `${name}.json`), 'utf8')) as Row[];
}

function rowOf(issue: string, folder = dir): Row {
  const found = read('queue', folder).find((r) => r.issue === issue);
  if (!found) throw new Error(`${issue} is not in the queue`);
  return found;
}

function editQueue(change: (queue: Row[]) => Row[]) {
  writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(change(read('queue'))));
}

const slots = (): string => String(read('meta')[0]?.vagas);
const show = (): string => run('show', dir);
const line = (text: string, prefix: string): string =>
  text.split('\n').find((l) => l.startsWith(prefix)) ?? '';
const nodes = (): GraphNode[] => read('meta')[0]?.grafoNos as unknown as GraphNode[];
const arrows = (): GraphArrow[] => read('meta')[0]?.grafoSetas as unknown as GraphArrow[];
const node = (issue: string): GraphNode => {
  const found = nodes().find((n) => n.issue === issue);
  if (!found) throw new Error(`${issue} is not a graph node`);
  return found;
};

type Ficha = { dep?: string; schema?: string; formato?: string | null };

function ficha(toca: string, o: Ficha = {}): string {
  const fields = [
    `dep=${o.dep ?? 'nenhuma'}`,
    'nivel=impact: low',
    'mcp=não',
    `schema=${o.schema ?? 'não'}`,
  ];
  if (o.formato !== null) fields.push(`formato=${o.formato ?? 'não'}`);
  fields.push(`toca=${toca}`, 'fases=X1:#1:high,X2:#2:medium');
  return fields.join(' | ');
}

function stage(issue: string, toca: string, o: Ficha = {}, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${ficha(toca, o)}`, ...extra);
}

// A started stage that opens (or not) the early start: `em andamento` in the given `stage` of the workflow.
function started(
  issue: string,
  toca: string,
  at: string,
  o: Ficha = {},
  ...extra: string[]
) {
  stage(issue, toca, o, 'status=em andamento', `started=${NOW}`, `stage=${at}`, ...extra);
}

// The candidate starts the way the coordinator does it: after `começa cedo` shows in `vagas`.
function start(issue: string) {
  run('row', dir, issue, 'status=em andamento', `started=${NOW}`, 'stage=Fases');
}

function reset() {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = mkdtempSync(path.join(tmpdir(), 'early-'));
  run('init', dir);
  run('start', dir, '--paralelo', '4');
}

beforeEach(reset);

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py — early start (EA1, #2373)', () => {
  it(
    'decision 1: a holder in Testador, Correção, Fechamento or with a merge asked opens the early start',
    () => {
      const opens: Array<() => void> = [
        ...['Testador', 'Correção', 'Fechamento'].map(
          (at) => () => started('#1', 'src/a.ts', at),
        ),
        () =>
          started(
            '#1',
            'src/a.ts',
            'Fechamento',
            {},
            'status=esperando dono',
            'wait=merge pedido ao dono: PR #9',
          ),
      ];
      for (const holder of opens) {
        reset();
        holder();
        stage('#2', 'src/a.ts');
        expect(slots()).toContain('#2 começa cedo (espera #1 para testar)');
      }
      expect(line(show(), 'começar agora:')).toBe('começar agora: #2 (cedo: #1)');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 1: a holder in Fases, falhou, stopped, exclusive or a fast track never opens it',
    () => {
      const closed: Array<() => void> = [
        () => started('#1', 'src/a.ts', 'Fases'),
        () => started('#1', 'src/a.ts', 'Testador', {}, 'status=falhou'),
        () => stage('#1', 'src/a.ts', {}, `started=${NOW}`, 'stage=Testador'), // aguardando with started: stopped by the owner
        () => started('#1', 'src/a.ts', 'Testador', {}, 'kind=via-rapida'),
        () => started('#1', 'src/a.ts', 'Testador', {}, 'exclusive=sim'),
      ];
      for (const holder of closed) {
        reset();
        holder();
        stage('#2', 'src/a.ts');
        expect(slots()).not.toContain('começa cedo');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 1: a holder with cedo pending (set by the script when it started early) does not open it',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts, src/b.ts');
      start('#2');
      expect(rowOf('#2').cedo).toBe('#1');
      run('row', dir, '#2', 'stage=Testador');
      stage('#3', 'src/b.ts');
      expect(slots()).toContain('#3 arquivo src/b.ts com #2');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 2: an eligible holder plus a stage in implementation holds the candidate on the one in implementation',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      started('#2', 'src/b.ts', 'Fases');
      stage('#3', 'src/a.ts, src/b.ts');
      expect(slots()).toContain('#3 arquivo src/b.ts com #2');
      expect(slots()).not.toContain('começa cedo');
      expect(line(show(), 'começar agora:')).toBe('começar agora: nenhuma');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 2 and 10: the schema rule still holds against every started stage, and a full slot gives vagas cheias',
    () => {
      started('#1', 'src/a.ts', 'Testador', { schema: 'sim' });
      stage('#2', 'src/a.ts', { schema: 'sim' });
      expect(slots()).toContain('#2 schema com #1');
      run('row', dir, '#2', `plan=${ficha('src/a.ts')}`);
      expect(slots()).toContain('#2 começa cedo');
      run('start', dir, '--paralelo', '1');
      expect(slots()).toContain('#2 vagas cheias');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 2: a fast-track candidate never starts early, a stage with testador=nenhum may',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts', {}, 'kind=via-rapida');
      expect(slots()).toContain('#2 arquivo src/a.ts com #1');
      stage('#3', 'src/a.ts');
      run('row', dir, '#3', `plan=${ficha('src/a.ts')} | testador=nenhum`);
      expect(slots()).toContain('#3 começa cedo (espera #1 para testar)');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 8: a pair of the same format family, or with an unknown format, is not started early',
    () => {
      started('#1', 'src/a.ts', 'Testador', { formato: 'spec, proposal' });
      stage('#2', 'src/a.ts', { formato: 'proposal' });
      expect(slots()).toContain('#2 arquivo src/a.ts com #1');
      stage('#3', 'src/a.ts', { formato: '?' });
      expect(slots()).toContain('#3 arquivo src/a.ts com #1');
      stage('#4', 'src/a.ts', { formato: null });
      expect(slots()).toContain('#4 arquivo src/a.ts com #1');
      stage('#5', 'src/a.ts', { formato: 'foo' });
      expect(slots()).toContain('#5 arquivo src/a.ts com #1');
      stage('#6', 'src/a.ts', { formato: 'comment' });
      expect(slots()).toContain('#6 começa cedo (espera #1 para testar)');
      // `não` on both sides is the empty set: no family in common
      reset();
      started('#1', 'src/a.ts', 'Testador', { formato: 'não' });
      stage('#2', 'src/a.ts', { formato: 'não' });
      expect(slots()).toContain('#2 começa cedo (espera #1 para testar)');
      // an unknown format on the holder's side excludes the pair too
      reset();
      started('#1', 'src/a.ts', 'Testador', { formato: '?' });
      stage('#2', 'src/a.ts', { formato: 'não' });
      expect(slots()).toContain('#2 arquivo src/a.ts com #1');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 3: row writes cedo with the holders when the stage starts early; by hand only cedo= is accepted',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      started('#3', 'src/b.ts', 'Correção');
      stage('#2', 'src/a.ts, src/b.ts');
      expect(slots()).toContain('#2 começa cedo (espera #1, #3 para testar)');
      expect(line(show(), 'começar agora:')).toBe('começar agora: #2 (cedo: #1, #3)');
      start('#2');
      expect(rowOf('#2').cedo).toBe('#1 #3');
      expect(runRaw('row', dir, '#2', 'cedo=#1').status).toBe(2);
      expect(rowOf('#2').cedo).toBe('#1 #3');
      run('row', dir, '#2', 'cedo=');
      expect(rowOf('#2').cedo).toBe('');
      // a stage that starts without the early start has none
      stage('#4', 'src/free.ts');
      start('#4');
      expect(rowOf('#4').cedo).toBe('');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 4: esperando entrega needs a cedo and its step is rewritten with the holders still open',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      started('#3', 'src/b.ts', 'Testador');
      stage('#2', 'src/a.ts, src/b.ts');
      start('#2');
      expect(runRaw('row', dir, '#3', 'status=esperando entrega').status).toBe(2);
      run('row', dir, '#2', 'status=esperando entrega', 'step=qualquer coisa');
      expect(rowOf('#2').step).toBe('espera merge de #1, #3 para testar');
      expect(slots()).toContain('Vagas 2/4'); // it takes no slot: only #1 and #3 run
      run('merged', dir, '#1');
      run('row', dir, '#1', 'status=concluída');
      expect(rowOf('#2').step).toBe('espera merge de #3 para testar');
      expect(runRaw('row', dir, '#2', 'status=esperando entrega', 'cedo=').status).toBe(
        2,
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 5 and 7: show lists the rows waiting for a merge and, apart, the ones that can sync, with the outcome of each holder',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      started('#3', 'src/b.ts', 'Testador');
      started('#4', 'src/c.ts', 'Testador');
      stage('#2', 'src/a.ts, src/b.ts, src/c.ts');
      start('#2');
      run('row', dir, '#2', 'status=esperando entrega');
      let text = show();
      expect(line(text, 'esperando merge para testar:')).toBe(
        'esperando merge para testar: #2 (espera #1, #3, #4)',
      );
      expect(line(text, 'pode sincronizar:')).toBe('pode sincronizar: nenhuma');
      expect(text.indexOf('merge pedido ao dono:')).toBeLessThan(
        text.indexOf('esperando merge para testar:'),
      );
      expect(text.indexOf('esperando merge para testar:')).toBeLessThan(
        text.indexOf('pode sincronizar:'),
      );
      // #1 merged (concluída), #3 failed, #4 refused and later absent
      run('row', dir, '#1', 'status=concluída');
      run('row', dir, '#3', 'status=falhou');
      run('row', dir, '#4', 'status=recusada');
      text = show();
      expect(line(text, 'pode sincronizar:')).toBe(
        'pode sincronizar: #2 (#1 mesclada; #3 falhou; #4 recusada)',
      );
      expect(line(text, 'esperando merge para testar:')).toBe(
        'esperando merge para testar: nenhuma',
      );
      editQueue((q) => q.filter((r) => r.issue !== '#4'));
      expect(line(show(), 'pode sincronizar:')).toBe(
        'pode sincronizar: #2 (#1 mesclada; #3 falhou; #4 fora da fila)',
      );
      // `meta.merged` alone also resolves a holder
      run('row', dir, '#3', 'status=em andamento');
      expect(line(show(), 'esperando merge para testar:')).toBe(
        'esperando merge para testar: #2 (espera #3)',
      );
      run('merged', dir, '#3');
      expect(line(show(), 'pode sincronizar:')).toContain('#3 mesclada');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 5: a holder waiting for the owner or stopped is still open',
    () => {
      started('#1', 'src/a.ts', 'Fechamento');
      stage('#2', 'src/a.ts');
      start('#2');
      run('row', dir, '#2', 'status=esperando entrega');
      run('row', dir, '#1', 'status=esperando dono', 'wait=merge pedido ao dono: PR #9');
      expect(line(show(), 'pode sincronizar:')).toBe('pode sincronizar: nenhuma');
      expect(line(show(), 'esperando merge para testar:')).toContain('#2 (espera #1)');
      run('row', dir, '#1', 'status=aguardando');
      expect(line(show(), 'pode sincronizar:')).toBe('pode sincronizar: nenhuma');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 7: the em andamento line of a row with cedo ends in · cedo: #S',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts');
      start('#2');
      const text = show();
      expect(line(text, '  #2 ')).toMatch(/ · cedo: #1$/);
      expect(line(text, '  #1 ')).not.toContain('cedo');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 9: a stage with cedo cleared and stage Testador opens the early start for another; one with cedo pending does not',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts, src/b.ts');
      start('#2');
      stage('#3', 'src/b.ts');
      expect(slots()).toContain('#3 arquivo src/b.ts com #2');
      run('row', dir, '#2', 'cedo=', 'stage=Testador');
      expect(slots()).toContain('#3 começa cedo (espera #2 para testar)');
      start('#3');
      expect(rowOf('#3').cedo).toBe('#2');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 8: fichas a refazer lists a non-final row with no formato= field, never one with formato=?, and does not hold it',
    () => {
      stage('#1', 'src/a.ts', { formato: null });
      stage('#2', 'src/b.ts', { formato: '?' });
      stage('#3', 'src/c.ts', { formato: 'não' });
      stage('#4', 'src/d.ts', { formato: null }, 'status=concluída');
      expect(line(show(), 'fichas a refazer:')).toBe('fichas a refazer: #1');
      expect(slots()).toContain('#1 começa');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 3 and 4: import carries cedo and esperando entrega, reentra clears cedo',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts');
      start('#2');
      run('row', dir, '#2', 'status=esperando entrega');
      const fresh = mkdtempSync(path.join(tmpdir(), 'early-new-'));
      try {
        run('init', fresh);
        run('import', fresh, dir);
        expect(rowOf('#2', fresh).status).toBe('esperando entrega');
        expect(rowOf('#2', fresh).cedo).toBe('#1');
      } finally {
        rmSync(fresh, { recursive: true, force: true });
      }
      run('row', dir, '#2', 'status=recusada');
      run('reentra', dir, '#2', 'kind=etapa', `plan=${ficha('src/a.ts')}`);
      expect(rowOf('#2').cedo).toBe('');
      expect(rowOf('#2').status).toBe('aguardando');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 6: the session kind sincronização exists, with no signals',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      run('session', dir, '#1', 'sm1', 'kind=sincronização', 'label=SM1');
      const sessions = read('meta')[0]?.sessions as unknown as Row[];
      expect(sessions.find((s) => s.id === 'sm1')?.kind).toBe('sincronização');
      const refused = runRaw('sinal', dir, 'sm1', 'ci=1');
      expect(refused.status).toBe(2);
      expect(runRaw('session', dir, '#1', 'sm2', 'kind=outra').status).toBe(2);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'decision 7 and 11: the graph has the entrega state, the cedo of the node, the entrega arrow and a começa cedo candidate in wave 0',
    () => {
      started('#1', 'src/a.ts', 'Testador');
      stage('#2', 'src/a.ts, src/b.ts');
      expect(node('#2')).toMatchObject({ onda: 0, estado: 'livre', cedo: '' });
      start('#2');
      expect(node('#2')).toMatchObject({ onda: 0, estado: 'rodando', cedo: '#1' });
      expect(arrows()).toContainEqual({ de: '#1', para: '#2', tipo: 'entrega' });
      run('row', dir, '#2', 'status=esperando entrega');
      expect(node('#2')).toMatchObject({
        onda: 0,
        estado: 'entrega',
        motivo: 'espera merge de #1 para testar',
        cedo: '#1',
      });
      expect(arrows()).toContainEqual({ de: '#1', para: '#2', tipo: 'entrega' });
      run('row', dir, '#1', 'status=concluída');
      expect(node('#2').cedo).toBe('');
      expect(arrows().some((a) => a.tipo === 'entrega')).toBe(false);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'acceptance: a panel without cedo, esperando entrega or formato= prints the same show, plus the new lines',
    () => {
      stage('#1', 'src/a.ts', { formato: null });
      const text = show();
      expect(text).toContain('esperando entrega: 0');
      expect(line(text, 'esperando merge para testar:')).toBe(
        'esperando merge para testar: nenhuma',
      );
      expect(line(text, 'pode sincronizar:')).toBe('pode sincronizar: nenhuma');
      expect(line(text, 'começar agora:')).toBe('começar agora: #1');
    },
    SUBPROCESS_TIMEOUT,
  );
});
