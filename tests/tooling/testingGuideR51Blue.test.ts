// @vitest-environment node
// Stage #2916, fix CL2.1: the `blue` helper of the R51 Setup measured the ink box after `-trim`,
// which resets the offset (`%@` then gave a wrong `WxH+X+Y`). No shell helper may put `-trim`
// before `%@`, and the R51 `blue` helper must report the real box.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const lines = readFileSync('docs/TESTING.md', 'utf8').split('\n');
const blueLine = lines.find((l) => l.startsWith('blue() {')) ?? '';
const hasConvert = spawnSync('convert', ['-version']).status === 0;

describe('R51 Setup: the blue helper', () => {
  it('defines the helper', () => {
    expect(blueLine).not.toBe('');
  });

  it('does not use -trim before %@ in any helper of the script text', () => {
    const bad = lines.filter((l) => /-trim\s+(?:\+repage\s+)?-format\s+'%@/.test(l));
    expect(bad.map((l) => l.slice(0, 60))).toEqual([]);
  });

  it.runIf(hasConvert)('reports the real box, and 1x1+0+0 with no ink', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'r51blue-'));
    try {
      const run = (cmd: string): string =>
        spawnSync(
          'bash',
          ['-c', `${blueLine.replace(/\s+#.*$/, '')}\ncd "${dir}"\n${cmd}`],
          {
            encoding: 'utf8',
          },
        ).stdout.trim();
      const out = run(
        `convert -size 40x30 xc:white -fill '#0B5FFF' -draw 'rectangle 10,8 20,18' -draw 'rectangle 21,8 22,12' t.png
         convert -size 40x30 xc:white n.png
         blue t.png; blue n.png`,
      );
      expect(out.split('\n')).toEqual(['13x11+10+8', '1x1+0+0']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
