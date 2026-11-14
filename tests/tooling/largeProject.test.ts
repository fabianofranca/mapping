// @vitest-environment node
// Generator of the large project of steps R12.29 to R12.33 (canvas-scale stage, DA5).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('scripts/testing/large-project.mjs', () => {
  it('writes mapping.json with the requested markings, half of them arrows, and revision 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'large-project-test-'));
    try {
      const out = execFileSync(
        'node',
        ['scripts/testing/large-project.mjs', '--marcacoes', '200', '--pasta', dir],
        { encoding: 'utf8' },
      ).trim();
      expect(out).toBe(join(dir, 'mapping.json'));
      const project = JSON.parse(readFileSync(out, 'utf8')) as {
        revision: number;
        markings: unknown[];
        arrows: unknown[];
      };
      expect(project.markings).toHaveLength(200);
      expect(project.arrows).toHaveLength(100);
      expect(project.revision).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses a count that is not a multiple of 100', () => {
    expect(() =>
      execFileSync(
        'node',
        ['scripts/testing/large-project.mjs', '--marcacoes', '150', '--pasta', '/tmp/x'],
        { stdio: 'pipe' },
      ),
    ).toThrow();
  });
});
