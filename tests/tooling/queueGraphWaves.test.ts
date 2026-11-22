// @vitest-environment node
// Phase GW1 (stage #2293): the waves of the queue graph apply the file and schema conflicts. Inside a round, a row enters
// only if it has no file (`first_conflict`) and no schema (`changes_schema` on both) in common with the rows already placed in
// that round; rows with `hold` or an incomplete ficha neither block nor are blocked; the slots do not cut a wave.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-12T10:00:00Z';
const SUBPROCESS_TIMEOUT = 30_000;

// The field names (Portuguese) are the script's output keys, read by the panel page.
type GraphNode = { issue: string; onda: number; estado: string; motivo: string };

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

const waves = (): Record<string, number> =>
  Object.fromEntries((meta().grafoNos as GraphNode[]).map((n) => [n.issue, n.onda]));

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca} | fases=X1:#1:high,X2:#2:medium`;
}

function stage(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${plan}`, ...extra);
}

// One slot, taken by a running stage: every waiting stage is in wave 1 or later, whatever its conflicts.
function fullSlots() {
  run('start', dir, '--paralelo', '1');
  stage('#90', ficha('nenhuma', 'running.ts'), 'status=em andamento');
}

describe('painel.py — real waves (GW1, #2293)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'waves-'));
    run('init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'a. three stages that share a file land in waves 1, 2 and 3, in order; two that share nothing stay together',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'src/a.ts'));
      stage('#2', ficha('nenhuma', 'src/a.ts'));
      stage('#3', ficha('nenhuma', 'src/a.ts'));
      stage('#4', ficha('nenhuma', 'src/b.ts'));
      stage('#5', ficha('nenhuma', 'src/c.ts'));
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 2, '#3': 3, '#4': 1, '#5': 1 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'b. an append-only or an ignored citation in common does not split a round',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'docs/MCP.md#tools, changelog/x.md'));
      stage('#2', ficha('nenhuma', 'docs/MCP.md#tools, changelog/x.md'));
      stage('#3', ficha('nenhuma', 'src/i18n/en-US.ts'));
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 1, '#3': 1 });
      stage('#4', ficha('nenhuma', 'docs/MCP.md#tools, src/real.ts'));
      stage('#5', ficha('nenhuma', 'docs/MCP.md#tools, src/real.ts'));
      expect(waves()['#4']).toBe(1);
      expect(waves()['#5']).toBe(2);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'c. two stages that change the schema go to different waves; schema=não on one keeps them together',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'src/a.ts', 'v24'));
      stage('#2', ficha('nenhuma', 'src/b.ts', 'v24'));
      expect(waves()).toMatchObject({ '#1': 1, '#2': 2 });
      stage('#2', ficha('nenhuma', 'src/b.ts', 'não'));
      expect(waves()).toMatchObject({ '#1': 1, '#2': 1 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'd. a row with hold and a row with toca=? enter their round and push no one to a later wave',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'src/a.ts'), 'hold=owner decision pending');
      stage('#2', ficha('nenhuma', 'src/a.ts'));
      stage('#3', 'dep=nenhuma | toca=?');
      stage('#4', ficha('nenhuma', 'src/a.ts'));
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 1, '#3': 1, '#4': 2 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'e. the exclusive stage at the front still enters alone, after the ordinary ones that come before it',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'src/a.ts'));
      stage('#2', ficha('nenhuma', 'src/a.ts'));
      stage('#3', ficha('nenhuma', 'src/x.ts'), 'exclusive=sim');
      stage('#4', ficha('nenhuma', 'src/y.ts'));
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 2, '#3': 3, '#4': 4 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'h. a stage that depends on a delayed one follows it, and an exclusive stage with hold enters last, as before',
    () => {
      fullSlots();
      stage('#1', ficha('nenhuma', 'src/a.ts'));
      stage('#2', ficha('nenhuma', 'src/a.ts'));
      stage('#3', ficha('#2:aberta', 'src/c.ts'));
      stage(
        '#4',
        ficha('nenhuma', 'src/d.ts'),
        'exclusive=sim',
        'hold=owner decision pending',
      );
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 2, '#3': 3, '#4': 4 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'f. a dep cycle still enters together in the last wave, even with a file in common',
    () => {
      fullSlots();
      stage('#1', ficha('#2:aberta', 'src/a.ts'));
      stage('#2', ficha('#1:aberta', 'src/a.ts'));
      expect(waves()).toEqual({ '#90': 0, '#1': 1, '#2': 1 });
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    'g. wave 0, vagas and começar agora are the ones of the slots, whatever the conflicts',
    () => {
      run('start', dir, '--paralelo', '3');
      stage('#1', ficha('nenhuma', 'src/a.ts'), 'status=em andamento');
      stage('#2', ficha('nenhuma', 'src/b.ts'));
      stage('#3', ficha('nenhuma', 'src/a.ts'));
      stage('#4', ficha('nenhuma', 'src/a.ts'));
      stage('#5', ficha('nenhuma', 'src/c.ts'));
      expect(meta().vagas).toBe(
        'Vagas 1/3 · #2 começa · #3 arquivo src/a.ts com #1 · #4 arquivo src/a.ts com #1 · #5 começa',
      );
      expect(waves()).toEqual({ '#1': 0, '#2': 0, '#5': 0, '#3': 1, '#4': 2 });
      const shown = run('show', dir);
      expect(shown).toContain('começar agora: #2 #5');
    },
    SUBPROCESS_TIMEOUT,
  );
});
