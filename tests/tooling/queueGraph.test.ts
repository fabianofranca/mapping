// @vitest-environment node
// Fase GF1 (etapa #1761): o painel calcula o grafo da fila (ondas, ordem prevista de entrada e setas) em toda
// gravação e o grava no `meta` (`grafoNos` e `grafoSetas`); `vagas`, `vagasItens` e o `show` não mudam.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-12T10:00:00Z';
const TEMPO_SUBPROCESSOS = 30_000;

type No = {
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
type Seta = { de: string; para: string; tipo: string };

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

const nos = (): No[] => meta().grafoNos as No[];
const setas = (): Seta[] => meta().grafoSetas as Seta[];
const no = (issue: string): No => {
  const found = nos().find((n) => n.issue === issue);
  if (!found) throw new Error(`${issue} não é nó do grafo`);
  return found;
};

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca} | fases=X1:#1:high,X2:#2:medium`;
}

function etapa(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Etapa ${issue}`, `plan=${plan}`, ...extra);
}

// A fila do aceite (paralelo 2): #1 e #2 rodam; o resto espera por motivos diferentes.
function filaDoAceite() {
  etapa(
    '#1',
    ficha('nenhuma', 'a.ts'),
    'status=em andamento',
    'phases=X1:ok|X2:open',
    'step=fase X2',
  );
  etapa('#2', ficha('nenhuma', 'b.ts'), 'status=em andamento');
  etapa('#3', ficha('nenhuma', 'a.ts'));
  etapa('#4', ficha('#1:aberta', 'c.ts'));
  etapa('#5', ficha('#4:aberta,#1:aberta', 'd.ts'));
  etapa('#6', ficha('nenhuma', 'e.ts'), 'exclusive=sim');
  etapa('#7', ficha('nenhuma', 'f.ts'), 'exclusive=sim');
  etapa('#8', ficha('#6:aberta', 'g.ts'));
  etapa('#9', ficha('nenhuma', 'h.ts'), 'hold=esperando dono (decisão)');
}

describe('painel.py — grafo da fila (GF1, #1761)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'grafo-'));
    run('init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'a. as ondas da fila do aceite, na ordem onda, rank e order',
    () => {
      filaDoAceite();
      expect(nos().map((n) => n.issue)).toEqual([
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
      expect(nos().map((n) => n.onda)).toEqual([0, 0, 1, 1, 1, 2, 3, 4, 5]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'b. o rank vai a partir de 1 nas aguardando livres de hold e de ficha; o resto é null',
    () => {
      filaDoAceite();
      const ranks = Object.fromEntries(nos().map((n) => [n.issue, n.rank]));
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
    TEMPO_SUBPROCESSOS,
  );

  it(
    'c. os estados, o título e a fase aberta com o progresso',
    () => {
      filaDoAceite();
      const estados = Object.fromEntries(nos().map((n) => [n.issue, n.estado]));
      expect(estados).toEqual({
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
      expect(no('#1')).toMatchObject({
        titulo: 'Etapa #1',
        fase: 'X2',
        feitas: 1,
        total: 2,
        motivo: 'fase X2',
      });
      expect(no('#9').motivo).toBe('esperando dono (decisão)');
      expect(no('#4').motivo).toBe('dep #1');
      expect(no('#3').motivo).toBe('arquivo a.ts com #1');
      expect(no('#2')).toMatchObject({ fase: '', feitas: 0, total: 2 });
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'd. as setas, só a redução transitiva (sem #1→#5), na ordem do para e depois do de',
    () => {
      filaDoAceite();
      expect(setas()).toEqual([
        { de: '#1', para: '#3', tipo: 'arquivo' },
        { de: '#1', para: '#4', tipo: 'dep' },
        { de: '#4', para: '#5', tipo: 'dep' },
        { de: '#6', para: '#8', tipo: 'dep' },
      ]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'e. começa fica na onda 0 como livre com rank 1; vagas cheias fica na onda 1 como livre',
    () => {
      etapa('#1', ficha('nenhuma', 'a.ts'));
      etapa('#2', ficha('nenhuma', 'b.ts'));
      etapa('#3', ficha('nenhuma', 'c.ts'));
      expect(meta().vagas).toBe('Vagas 0/2 · #1 começa · #2 começa · #3 vagas cheias');
      expect(no('#1')).toMatchObject({
        onda: 0,
        estado: 'livre',
        rank: 1,
        motivo: 'começa',
      });
      expect(no('#2')).toMatchObject({ onda: 0, estado: 'livre', rank: 2 });
      expect(no('#3')).toMatchObject({
        onda: 1,
        estado: 'livre',
        rank: 3,
        motivo: 'vagas cheias',
      });
      expect(setas()).toEqual([]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'f. ficha incompleta, esperando dono, falhou e aguardando com started',
    () => {
      etapa('#1', 'dep=nenhuma | toca=?');
      etapa('#2', ficha('nenhuma', 'b.ts'), 'status=esperando dono', 'wait=merge pedido');
      etapa('#3', ficha('nenhuma', 'c.ts'), 'status=falhou');
      etapa(
        '#4',
        ficha('nenhuma', 'd.ts'),
        'status=aguardando',
        `started=${NOW}`,
        'step=parada no CI',
      );
      etapa('#5', ficha('nenhuma', 'e.ts'), 'status=esperando dono');
      expect(no('#1')).toMatchObject({ estado: 'ficha', rank: null });
      expect(no('#1').motivo).toBe('ficha incompleta (toca)');
      expect(no('#2')).toMatchObject({
        onda: 0,
        estado: 'dono',
        motivo: 'merge pedido',
        rank: null,
      });
      expect(no('#3')).toMatchObject({ onda: 0, estado: 'dono', motivo: 'falhou' });
      expect(no('#4')).toMatchObject({
        onda: 0,
        estado: 'dep',
        motivo: 'parada no CI',
        rank: null,
      });
      expect(no('#5').motivo).toBe('esperando o dono');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'g. dependência fora da fila e não mesclada: sem seta, motivo dep #N; concluída, mesclada ou :main: sem seta e sem espera',
    () => {
      etapa('#1', ficha('#900:aberta', 'a.ts'));
      expect(no('#1').estado).toBe('dep');
      expect(no('#1').motivo).toBe('dep #900');
      expect(no('#1').onda).toBe(1);
      expect(setas()).toEqual([]);

      run('start', dir, '--paralelo', '5');
      run('merged', dir, '#901');
      etapa('#2', ficha('#901:aberta', 'b.ts'));
      etapa('#3', ficha('#902:main', 'c.ts'));
      etapa('#4', ficha('#903:aberta', 'd.ts'), 'status=concluída');
      etapa('#5', ficha('#4:aberta', 'e.ts'));
      for (const issue of ['#2', '#3', '#5']) {
        expect(no(issue).estado).toBe('livre');
        expect(no(issue).onda).toBe(0);
      }
      expect(nos().some((n) => n.issue === '#4')).toBe(false);
      expect(setas()).toEqual([]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'h. schema com #N dá a seta arquivo de #N',
    () => {
      etapa('#1', ficha('nenhuma', 'a.ts', 'sim'), 'status=em andamento');
      etapa('#2', ficha('nenhuma', 'b.ts', 'sim'));
      expect(meta().vagasItens).toEqual([
        'Vagas 1/2',
        '#2 schema com #1',
        'nenhuma ready elegível',
      ]);
      expect(no('#2')).toMatchObject({
        estado: 'arquivo',
        motivo: 'schema com #1',
        onda: 1,
      });
      expect(setas()).toEqual([{ de: '#1', para: '#2', tipo: 'arquivo' }]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'i. ciclo de dependências: o comando termina e todos os nós têm onda',
    () => {
      etapa('#1', ficha('#2:aberta', 'a.ts'));
      etapa('#2', ficha('#1:aberta', 'b.ts'));
      etapa('#3', ficha('#2:aberta', 'c.ts'));
      expect(nos()).toHaveLength(3);
      for (const n of nos()) expect(Number.isInteger(n.onda)).toBe(true);
      expect(no('#1').onda).toBe(no('#2').onda);
      expect(setas().length).toBeGreaterThan(0);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'j. concluída não vira nó; um log recalcula os dois campos; vagas e vagasItens ficam como antes',
    () => {
      filaDoAceite();
      etapa('#10', ficha('nenhuma', 'z.ts'), 'status=concluída');
      expect(nos().some((n) => n.issue === '#10')).toBe(false);
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
      expect(no('#3').onda).toBe(1);
      run('row', dir, '#1', 'status=concluída');
      run('log', dir, 'recalcula');
      expect(no('#3')).toMatchObject({
        estado: 'livre',
        onda: 0,
        rank: 1,
        motivo: 'começa',
      });
      expect(no('#4').estado).toBe('livre');
      expect(nos().some((n) => n.issue === '#1')).toBe(false);
      expect(setas().some((s) => s.de === '#1')).toBe(false);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'l. a exclusiva da frente fica sozinha numa onda antes da candidata que ela segura (#1813, decisão 6)',
    () => {
      run('start', dir, '--paralelo', '9');
      etapa('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento');
      etapa('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
      etapa('#3', ficha('nenhuma', 'c.ts'));
      expect(no('#3')).toMatchObject({
        estado: 'exclusiva',
        motivo: 'segurada para a exclusiva #2',
      });
      expect(no('#2')).toMatchObject({
        estado: 'exclusiva',
        motivo: 'exclusiva (espera a fila esvaziar)',
      });
      expect(nos().map((n) => [n.issue, n.onda])).toEqual([
        ['#1', 0],
        ['#2', 1],
        ['#3', 2],
      ]);
      expect(setas()).toEqual([]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'k. fila com a mesma issue em duas linhas termina o flush (sem laço infinito) e dá um nó por issue',
    () => {
      etapa('#1', ficha('nenhuma', 'a.ts'));
      etapa('#2', ficha('nenhuma', 'b.ts'));
      const arquivo = path.join(dir, 'queue.json');
      const fila = JSON.parse(readFileSync(arquivo, 'utf8')) as Array<
        Record<string, unknown>
      >;
      writeFileSync(arquivo, JSON.stringify([...fila, { ...fila[0], order: 3 }]));
      expect(() =>
        execFileSync('python3', [SCRIPT, '--now', NOW, 'row', dir, '#2', 'title=Outra'], {
          encoding: 'utf8',
          timeout: 10_000,
        }),
      ).not.toThrow();
      expect(new Set(nos().map((n) => n.issue))).toEqual(new Set(['#1', '#2']));
    },
    TEMPO_SUBPROCESSOS,
  );
});
