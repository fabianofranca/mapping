// @vitest-environment node
// Stage #2480: the writes that can free a start (`apply`, and a lone `row` that changes `stage` or `status`, or `merged`) print the
// `começar agora:` line of `show`, computed on the state after the write, so the coordinator starts the stage in the same cycle
// without remembering a second command. The line is printed only when it is not `nenhuma`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-21T18:42:22Z';
const TIMEOUT = 30_000;
const SKILL = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');

let dir = '';

const run = (...args: string[]): string =>
  execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
const apply = (batch: string): string =>
  execFileSync('python3', [SCRIPT, '--now', NOW, 'apply', dir, '-'], {
    encoding: 'utf8',
    input: batch,
  });
const line = (text: string): string =>
  text.split('\n').find((l) => l.startsWith('começar agora:')) ?? '';

function ficha(toca: string): string {
  return `dep=nenhuma | nivel=impact: low | mcp=não | schema=não | formato=não | toca=${toca} | fases=X1:#1:high,X2:#2:medium`;
}

const stage = (issue: string, toca: string, ...extra: string[]) =>
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${ficha(toca)}`, ...extra);

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'apply-starts-'));
  run('init', dir);
  run('start', dir, '--paralelo', '4');
  // #1 is in its phases (not a holder yet); #2 shares its file and waits.
  stage('#1', 'src/a.ts', 'status=em andamento', `started=${NOW}`, 'stage=Fases');
  stage('#2', 'src/a.ts');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py — `começar agora:` after a write (#2480)', () => {
  it(
    'an apply that writes `stage=Testador` on the holder prints `começar agora: #2 (cedo: #1)`',
    () => {
      expect(line(run('show', dir))).toBe('começar agora: nenhuma');
      const out = apply("row '#1' stage=Testador\nlog 'tester started'\n");
      expect(out).toContain('alterados:');
      expect(line(out)).toBe('começar agora: #2 (cedo: #1)');
      expect(line(out)).toBe(line(run('show', dir)));
    },
    TIMEOUT,
  );

  it(
    'a lone `row` that writes `stage` or `status` prints it too, and one that writes neither does not',
    () => {
      const out = run('row', dir, '#1', 'stage=Testador');
      expect(line(out)).toBe('começar agora: #2 (cedo: #1)');
      expect(line(run('row', dir, '#2', 'step=waiting'))).toBe('');
    },
    TIMEOUT,
  );

  it(
    'a `merged` prints the line of `show`, which is not empty here',
    () => {
      run('row', dir, '#1', 'stage=Fechamento');
      const out = run('merged', dir, '#1');
      expect(line(out)).toBe('começar agora: #2 (cedo: #1)');
      expect(line(out)).toBe(line(run('show', dir)));
    },
    TIMEOUT,
  );

  it(
    'prints nothing when there is nothing to start, and not inside an apply line by line',
    () => {
      const out = apply("log 'no change'\n");
      expect(line(out)).toBe('');
      const batch = apply("row '#1' stage=Testador\nrow '#1' step=x\n");
      expect(batch.split('começar agora:')).toHaveLength(2);
      expect(batch.match(/alterados:/g)).toHaveLength(1);
    },
    TIMEOUT,
  );

  it('"3. Per stage" tells the coordinator that the write output carries the line', () => {
    const per = SKILL.slice(SKILL.indexOf('**Early start in the same cycle**'));
    const paragraph = per.slice(0, per.indexOf('\n'));
    expect(paragraph).toContain('`apply` prints `começar agora:`');
    expect(paragraph).not.toContain('`apply` does not print');
  });
});
