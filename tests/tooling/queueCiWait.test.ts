// @vitest-environment node
// Phase CV3 (stage #1466, decisions 16 and 17): the panel keeps the PR whose CI the coordinator
// is waiting for (`ciWait`, `ciWaitAt`), `show` lists it, the page shows it in the "Current step"
// column and SKILL.md says to record it, check it hourly and cite it in the worst case of detection.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const BASE = '.claude/skills/implementar-fila';
const SCRIPT = `${BASE}/painel/painel.py`;
const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function queue(): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, 'queue.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

describe('painel.py: CI waiting for the coordinator (CV3, decision 16)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-ciwait-'));
    runAt('2026-11-10T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ciWait and ciWaitAt=now write both fields', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
  });

  it('show prints the line with the minutes since --now, or "nenhuma"', () => {
    expect(runAt('2026-11-10T10:00:00Z', 'show', dir)).toContain(
      'CI esperando o coordenador: nenhuma',
    );
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:02:00Z', 'row', dir, '#11', 'ciWait=PR #9', 'ciWaitAt=now');
    const out = runAt('2026-11-10T10:12:00Z', 'show', dir);
    expect(out).toContain(
      'CI esperando o coordenador: #10 PR #7 (12 min); #11 PR #9 (10 min)',
    );
    expect(out).not.toContain('CI esperando o coordenador: nenhuma');
  });

  it("a new ciWait without ciWaitAt writes the current time (does not inherit the previous PR's)", () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:30:00Z', 'row', dir, '#10', 'ciWait=PR #9');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:30:00Z');
    runAt('2026-11-10T10:31:00Z', 'row', dir, '#11', 'ciWait=PR #11');
    expect(queue()[1]?.ciWaitAt).toBe('2026-11-10T10:31:00Z');
  });

  it('ended= (finished row) clears a forgotten ciWait', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:05:00Z', 'row', dir, '#10', 'ended=now');
    expect(queue()[0]?.ciWait).toBe('');
    expect(queue()[0]?.ciWaitAt).toBe('');
  });

  it('ciWait= clears ciWaitAt and show goes back to "nenhuma"', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:05:00Z', 'row', dir, '#10', 'ciWait=');
    expect(queue()[0]?.ciWait).toBe('');
    expect(queue()[0]?.ciWaitAt).toBe('');
    expect(runAt('2026-11-10T10:06:00Z', 'show', dir)).toContain(
      'CI esperando o coordenador: nenhuma',
    );
  });

  it('child= (empty) and changing child do not touch ciWait', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:01:00Z', 'row', dir, '#10', 'child=session_b');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
    runAt('2026-11-10T10:02:00Z', 'row', dir, '#10', 'child=');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
  });

  it('status concluída or falhou clears a forgotten ciWait; esperando dono does not', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:01:00Z', 'row', dir, '#10', 'status=esperando dono');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    runAt(
      '2026-11-10T10:02:00Z',
      'row',
      dir,
      '#10',
      'status=concluída',
      'stage=Mesclada',
    );
    expect(queue()[0]?.ciWait).toBe('');
    expect(queue()[0]?.ciWaitAt).toBe('');
    runAt('2026-11-10T10:03:00Z', 'row', dir, '#11', 'ciWait=PR #9', 'ciWaitAt=now');
    runAt('2026-11-10T10:04:00Z', 'row', dir, '#11', 'status=falhou');
    expect(queue()[1]?.ciWait).toBe('');
  });

  it('an invalid ciWaitAt is refused, like childAt', () => {
    expect(() => run('row', dir, '#10', 'ciWaitAt=yesterday')).toThrow(
      /horário inválido/,
    );
  });

  it("o show '#n' mostra o campo", () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    const out = run('show', dir, '#10');
    expect(out).toContain('ciWait: PR #7');
    expect(out).toContain('ciWaitAt: 2026-11-10T10:00:00Z');
  });
});

describe('implementar-fila: page and SKILL.md cite ciWait (CV3, decisions 16 and 17)', () => {
  it('the page reads ciWait in the step cell, with textContent', () => {
    expect(page).toMatch(/r\.ciWait/);
    expect(page).toContain('· CI: ');
  });

  it('the "PR that waits for the coordinator" paragraph writes and clears ciWait', () => {
    const para = between(
      skill,
      '**PR that waits for the coordinator:**',
      'When the phase notifies',
    );
    expect(para).toContain('ciWait="PR #<n>"');
    expect(para).toContain('ciWaitAt=now');
    expect(para).toContain('ciWait=');
  });

  it('"Fallback checks" checks each PR of the ciWait and cites ciWait in the worst case', () => {
    const fallback = between(skill, '**Fallback checks:**', '**Red CI on the epic PR**');
    expect(fallback).toContain('CI esperando o coordenador');
    expect(fallback).toMatch(/none of those PRs/);
    const worst = between(fallback, '- **Worst case of detection:**', '\n\n');
    expect(worst).toContain('ciWait');
  });

  it('"Panel" lists the command and describes the show line', () => {
    const panel = section(skill, '## Panel');
    expect(panel).toContain('ciWait="PR #<n>" ciWaitAt=now');
    expect(panel).toContain('CI esperando o coordenador');
  });
});
