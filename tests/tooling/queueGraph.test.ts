// @vitest-environment node
// Phase GF1 (stage #1761): the panel computes the queue graph (waves, expected entry order and arrows) on every
// write and stores it in the `meta` (`grafoNos` and `grafoSetas`); `vagas`, `vagasItens` and `show` do not change.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-12T10:00:00Z';
const SUBPROCESS_TIMEOUT = 30_000;

// The field names (Portuguese) are the script's output keys, read by the panel page.
type GraphNode = {
  issue: string;
  titulo: string;
  onda: number;
  rank: number | null;
  estado: string;
  motivo: string;
  fase: string;
  feitas: number;
  total: number;
};
type GraphArrow = { de: string; para: string; tipo: string };

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function meta(): Record<string, unknown> {
  const list = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
  return list[0] ?? {};
}

const nodes = (): GraphNode[] => meta().grafoNos as GraphNode[];
const arrows = (): GraphArrow[] => meta().grafoSetas as GraphArrow[];
const node = (issue: string): GraphNode => {
  const found = nodes().find((n) => n.issue === issue);
  if (!found) throw new Error(`${issue} is not a graph node`);
  return found;
};

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca} | fases=X1:#1:high,X2:#2:medium`;
}

function stage(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${plan}`, ...extra);
}

// The acceptance queue (paralelo 2): #1 and #2 run; the rest wait for different reasons.
function acceptanceQueue() {
  stage(
    '#1',
    ficha('nenhuma', 'a.ts'),
    'status=em andamento',
    'phases=X1:ok|X2:open',
    'step=fase X2',
  );
  stage('#2', ficha('nenhuma', 'b.ts'), 'status=em andamento');
  stage('#3', ficha('nenhuma', 'a.ts'));
  stage('#4', ficha('#1:aberta', 'c.ts'));
  stage('#5', ficha('#4:aberta,#1:aberta', 'd.ts'));
  stage('#6', ficha('nenhuma', 'e.ts'), 'exclusive=sim');
  stage('#7', ficha('nenhuma', 'f.ts'), 'exclusive=sim');
  stage('#8', ficha('#6:aberta', 'g.ts'));
  stage('#9', ficha('nenhuma', 'h.ts'), 'hold=esperando dono (decisão)');
}

describe('painel.py — queue graph (GF1, #1761)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'graph-'));
    run('init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'a. the waves of the acceptance queue, in the order wave, rank and order',
    () => {
      acceptanceQueue();
      expect(nodes().map((n) => n.issue)).toEqual([
        '#1',
        '#2',
        '#3',
        '#4',
        '#9',
        '#5',
        '#6',
        '#7',
        '#8',
      ]);
      expect(nodes().map((n) => n.onda)).toEqual([0, 0, 1, 1, 1, 2, 3, 4, 5]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'b. the rank starts at 1 on the aguardando rows free of hold and of ficha problems; the rest is null',
    () => {
      acceptanceQueue();
      const ranks = Object.fromEntries(nodes().map((n) => [n.issue, n.rank]));
      expect(ranks).toEqual({
        '#1': null,
        '#2': null,
        '#3': 1,
        '#4': 2,
        '#5': 3,
        '#6': 4,
        '#7': 5,
        '#8': 6,
        '#9': null,
      });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'c. the states, the title and the open phase with the progress',
    () => {
      acceptanceQueue();
      const states = Object.fromEntries(nodes().map((n) => [n.issue, n.estado]));
      expect(states).toEqual({
        '#1': 'rodando',
        '#2': 'rodando',
        '#3': 'arquivo',
        '#4': 'dep',
        '#5': 'dep',
        '#8': 'dep',
        '#6': 'exclusiva',
        '#7': 'exclusiva',
        '#9': 'segurada',
      });
      expect(node('#1')).toMatchObject({
        titulo: 'Stage #1',
        fase: 'X2',
        feitas: 1,
        total: 2,
        motivo: 'fase X2',
      });
      expect(node('#9').motivo).toBe('esperando dono (decisão)');
      expect(node('#4').motivo).toBe('dep #1');
      expect(node('#3').motivo).toBe('arquivo a.ts com #1');
      expect(node('#2')).toMatchObject({ fase: '', feitas: 0, total: 2 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'd. the arrows, only the transitive reduction (no #1→#5), ordered by para and then by de',
    () => {
      acceptanceQueue();
      expect(arrows()).toEqual([
        { de: '#1', para: '#3', tipo: 'arquivo' },
        { de: '#1', para: '#4', tipo: 'dep' },
        { de: '#4', para: '#5', tipo: 'dep' },
        { de: '#6', para: '#8', tipo: 'dep' },
      ]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'e. começa stays in wave 0 as livre with rank 1; vagas cheias stays in wave 1 as livre',
    () => {
      stage('#1', ficha('nenhuma', 'a.ts'));
      stage('#2', ficha('nenhuma', 'b.ts'));
      stage('#3', ficha('nenhuma', 'c.ts'));
      expect(meta().vagas).toBe('Vagas 0/2 · #1 começa · #2 começa · #3 vagas cheias');
      expect(node('#1')).toMatchObject({
        onda: 0,
        estado: 'livre',
        rank: 1,
        motivo: 'começa',
      });
      expect(node('#2')).toMatchObject({ onda: 0, estado: 'livre', rank: 2 });
      expect(node('#3')).toMatchObject({
        onda: 1,
        estado: 'livre',
        rank: 3,
        motivo: 'vagas cheias',
      });
      expect(arrows()).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'f. incomplete ficha, esperando dono, falhou and aguardando with started',
    () => {
      stage('#1', 'dep=nenhuma | toca=?');
      stage('#2', ficha('nenhuma', 'b.ts'), 'status=esperando dono', 'wait=merge pedido');
      stage('#3', ficha('nenhuma', 'c.ts'), 'status=falhou');
      stage(
        '#4',
        ficha('nenhuma', 'd.ts'),
        'status=aguardando',
        `started=${NOW}`,
        'step=parada no CI',
      );
      stage('#5', ficha('nenhuma', 'e.ts'), 'status=esperando dono');
      expect(node('#1')).toMatchObject({ estado: 'ficha', rank: null });
      expect(node('#1').motivo).toBe('ficha incompleta (toca)');
      expect(node('#2')).toMatchObject({
        onda: 0,
        estado: 'dono',
        motivo: 'merge pedido',
        rank: null,
      });
      expect(node('#3')).toMatchObject({ onda: 0, estado: 'dono', motivo: 'falhou' });
      expect(node('#4')).toMatchObject({
        onda: 0,
        estado: 'dep',
        motivo: 'parada no CI',
        rank: null,
      });
      expect(node('#5').motivo).toBe('esperando o dono');
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'g. dependency outside the queue and not merged: no arrow, motivo dep #N; concluída, merged or :main: no arrow and no wait',
    () => {
      stage('#1', ficha('#900:aberta', 'a.ts'));
      expect(node('#1').estado).toBe('dep');
      expect(node('#1').motivo).toBe('dep #900');
      expect(node('#1').onda).toBe(1);
      expect(arrows()).toEqual([]);

      run('start', dir, '--paralelo', '5');
      run('merged', dir, '#901');
      stage('#2', ficha('#901:aberta', 'b.ts'));
      stage('#3', ficha('#902:main', 'c.ts'));
      stage('#4', ficha('#903:aberta', 'd.ts'), 'status=concluída');
      stage('#5', ficha('#4:aberta', 'e.ts'));
      for (const issue of ['#2', '#3', '#5']) {
        expect(node(issue).estado).toBe('livre');
        expect(node(issue).onda).toBe(0);
      }
      expect(nodes().some((n) => n.issue === '#4')).toBe(false);
      expect(arrows()).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'h. schema with #N gives the arquivo arrow from #N',
    () => {
      stage('#1', ficha('nenhuma', 'a.ts', 'sim'), 'status=em andamento');
      stage('#2', ficha('nenhuma', 'b.ts', 'sim'));
      expect(meta().vagasItens).toEqual([
        'Vagas 1/2',
        '#2 schema com #1',
        'nenhuma ready elegível',
      ]);
      expect(node('#2')).toMatchObject({
        estado: 'arquivo',
        motivo: 'schema com #1',
        onda: 1,
      });
      expect(arrows()).toEqual([{ de: '#1', para: '#2', tipo: 'arquivo' }]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'i. dependency cycle: the command finishes and every node has a wave',
    () => {
      stage('#1', ficha('#2:aberta', 'a.ts'));
      stage('#2', ficha('#1:aberta', 'b.ts'));
      stage('#3', ficha('#2:aberta', 'c.ts'));
      expect(nodes()).toHaveLength(3);
      for (const n of nodes()) expect(Number.isInteger(n.onda)).toBe(true);
      expect(node('#1').onda).toBe(node('#2').onda);
      expect(arrows().length).toBeGreaterThan(0);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'j. concluída does not become a node; a log recalculates both fields; vagas and vagasItens stay as before',
    () => {
      acceptanceQueue();
      stage('#10', ficha('nenhuma', 'z.ts'), 'status=concluída');
      expect(nodes().some((n) => n.issue === '#10')).toBe(false);
      expect(meta().vagas).toBe(
        'Vagas 2/2 · #3 arquivo a.ts com #1 · #4 dep #1 · #5 dep #4, #1 · #6 exclusiva (espera a fila esvaziar) · #7 exclusiva (espera a fila esvaziar) · #8 dep #6 · #9 esperando dono (decisão)',
      );
      expect(meta().vagasItens).toEqual([
        'Vagas 2/2',
        '#3 arquivo a.ts com #1',
        '#4 dep #1',
        '#5 dep #4, #1',
        '#6 exclusiva (espera a fila esvaziar)',
        '#7 exclusiva (espera a fila esvaziar)',
        '#8 dep #6',
        '#9 esperando dono (decisão)',
      ]);
      run('row', dir, '#2', 'status=concluída');
      expect(node('#3').onda).toBe(1);
      run('row', dir, '#1', 'status=concluída');
      run('log', dir, 'recalculates');
      expect(node('#3')).toMatchObject({
        estado: 'livre',
        onda: 0,
        rank: 1,
        motivo: 'começa',
      });
      expect(node('#4').estado).toBe('livre');
      expect(nodes().some((n) => n.issue === '#1')).toBe(false);
      expect(arrows().some((s) => s.de === '#1')).toBe(false);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'l. the exclusive one at the front stays alone in a wave before the candidate it holds (#1813, decision 6)',
    () => {
      run('start', dir, '--paralelo', '9');
      stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento');
      stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
      stage('#3', ficha('nenhuma', 'c.ts'));
      expect(node('#3')).toMatchObject({
        estado: 'exclusiva',
        motivo: 'segurada para a exclusiva #2',
      });
      expect(node('#2')).toMatchObject({
        estado: 'exclusiva',
        motivo: 'exclusiva (espera a fila esvaziar)',
      });
      expect(nodes().map((n) => [n.issue, n.onda])).toEqual([
        ['#1', 0],
        ['#2', 1],
        ['#3', 2],
      ]);
      expect(arrows()).toEqual([]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'k. a queue with the same issue on two rows finishes the flush (no infinite loop) and gives one node per issue',
    () => {
      stage('#1', ficha('nenhuma', 'a.ts'));
      stage('#2', ficha('nenhuma', 'b.ts'));
      const file = path.join(dir, 'queue.json');
      const rows = JSON.parse(readFileSync(file, 'utf8')) as Array<
        Record<string, unknown>
      >;
      writeFileSync(file, JSON.stringify([...rows, { ...rows[0], order: 3 }]));
      expect(() =>
        execFileSync('python3', [SCRIPT, '--now', NOW, 'row', dir, '#2', 'title=Other'], {
          encoding: 'utf8',
          timeout: 10_000,
        }),
      ).not.toThrow();
      expect(new Set(nodes().map((n) => n.issue))).toEqual(new Set(['#1', '#2']));
    },
    SUBPROCESS_TIMEOUT,
  );
});
