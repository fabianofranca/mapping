// @vitest-environment node
// Fase CV3 (etapa #1466, decisões 16 e 17): o painel guarda o PR cujo CI espera o coordenador
// (`ciWait`, `ciWaitAt`), o `show` o lista, a página o mostra na coluna "Passo atual" e o SKILL.md
// manda gravar, conferir de hora em hora e citar no pior caso de detecção.
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

describe('painel.py: CI esperando o coordenador (CV3, decisão 16)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-ciwait-'));
    runAt('2026-11-10T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ciWait e ciWaitAt=now gravam os dois campos', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
  });

  it('o show imprime a linha com os minutos desde o --now, ou "nenhuma"', () => {
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

  it('ciWait= limpa o ciWaitAt e o show volta a "nenhuma"', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:05:00Z', 'row', dir, '#10', 'ciWait=');
    expect(queue()[0]?.ciWait).toBe('');
    expect(queue()[0]?.ciWaitAt).toBe('');
    expect(runAt('2026-11-10T10:06:00Z', 'show', dir)).toContain(
      'CI esperando o coordenador: nenhuma',
    );
  });

  it('child= (vazio) e a troca de child não mexem no ciWait', () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    runAt('2026-11-10T10:01:00Z', 'row', dir, '#10', 'child=session_b');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
    runAt('2026-11-10T10:02:00Z', 'row', dir, '#10', 'child=');
    expect(queue()[0]?.ciWait).toBe('PR #7');
    expect(queue()[0]?.ciWaitAt).toBe('2026-11-10T10:00:00Z');
  });

  it('status concluída ou falhou limpa o ciWait esquecido; esperando dono não', () => {
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

  it('ciWaitAt inválido é recusado, como o childAt', () => {
    expect(() => run('row', dir, '#10', 'ciWaitAt=ontem')).toThrow(/horário inválido/);
  });

  it("o show '#n' mostra o campo", () => {
    runAt('2026-11-10T10:00:00Z', 'row', dir, '#10', 'ciWait=PR #7', 'ciWaitAt=now');
    const out = run('show', dir, '#10');
    expect(out).toContain('ciWait: PR #7');
    expect(out).toContain('ciWaitAt: 2026-11-10T10:00:00Z');
  });
});

describe('implementar-fila: página e SKILL.md citam o ciWait (CV3, decisões 16 e 17)', () => {
  it('a página lê ciWait na célula do passo, com textContent', () => {
    expect(page).toMatch(/r\.ciWait/);
    expect(page).toContain('· CI: ');
  });

  it('o parágrafo "PR que espera o coordenador" grava e limpa o ciWait', () => {
    const para = between(
      skill,
      '**PR que espera o coordenador:**',
      'Quando a fase avisar',
    );
    expect(para).toContain('ciWait="PR #<n>"');
    expect(para).toContain('ciWaitAt=now');
    expect(para).toContain('ciWait=');
  });

  it('"Conferências de reserva" confere cada PR do ciWait e cita o ciWait no pior caso', () => {
    const reserva = between(
      skill,
      '**Conferências de reserva:**',
      '**CI vermelho no PR do épico**',
    );
    expect(reserva).toContain('CI esperando o coordenador');
    expect(reserva).toMatch(/sem esses PRs/);
    const pior = between(reserva, '- **Pior caso de detecção:**', '\n\n');
    expect(pior).toContain('ciWait');
  });

  it('"Painel" lista o comando e descreve a linha do show', () => {
    const painel = section(skill, '## Painel');
    expect(painel).toContain('ciWait="PR #<n>" ciWaitAt=now');
    expect(painel).toContain('CI esperando o coordenador');
  });
});
