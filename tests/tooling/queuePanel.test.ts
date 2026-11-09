// @vitest-environment node
// Fase FC1 (etapa #1285): o painel da fila guarda a ficha de cada etapa (`plan`), as filhas que
// devem aviso (`child`, `childAt`) e a conferência de reserva (`reserve`), e o `show` resume tudo
// sem imprimir o JSON inteiro, para o coordenador não encher o contexto.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function json(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'));
}

describe('painel.py (FC1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a linha guarda a ficha (plan) e o show de uma linha a imprime', () => {
    run('row', dir, '#10', 'title=Etapa dez', 'plan=dep=nenhuma; fases=AB1:#11');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.plan).toBe('dep=nenhuma; fases=AB1:#11');
    const out = run('show', dir, '#10');
    expect(out).toContain('#10');
    expect(out).toContain('dep=nenhuma; fases=AB1:#11');
  });

  it('child e childAt=now registram a filha; show lista só as atrasadas (mais de 60 min)', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'status=em andamento',
      'child=session_a',
      'childAt=now',
    );
    runAt(
      '2026-11-09T10:50:00Z',
      'row',
      dir,
      '#20',
      'status=em andamento',
      'child=session_b',
      'childAt=now',
    );
    const out = runAt('2026-11-09T11:10:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas:[^\n]*#10[^\n]*session_a/);
    expect(out).not.toMatch(/atrasadas:[^\n]*#20/);
  });

  it('child= vazio limpa childAt e a etapa deixa de estar atrasada', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.childAt).toBe('');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
  });

  it('reserve guarda o id da conferência no meta e o show o mostra', () => {
    const changed = run('reserve', dir, 'trig_abc');
    expect(changed).toContain('meta.json');
    const meta = json('meta') as Array<Record<string, unknown>>;
    expect(meta[0]?.reserve).toBe('trig_abc');
    expect(run('show', dir)).toContain('reserva: trig_abc');
  });

  it('childAt inválido é recusado', () => {
    expect(() => run('row', dir, '#10', 'childAt=ontem')).toThrow();
  });
});
