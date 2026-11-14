import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Finding 4.2 of #954: the R3.10 to R3.17 script of `docs/TESTING.md` said that the
// `libraries/material3-compose/` package is at version 2, and it was already at 3. The test ties the
// guide text to the version the package specialization declares, and the `mat-vN` copies to the chain.

const guide = readFileSync('docs/TESTING.md', 'utf8');
const spec = JSON.parse(
  readFileSync('libraries/material3-compose/material3-compose.spec.json', 'utf8'),
) as { version: number };
const row = (id: string): string => {
  const line = guide.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`row ${id} missing`);
  return line;
};

describe('R3.10 to R3.17 of the guide follow the Material 3 (Compose) package version', () => {
  const v = spec.version;

  it('R3.10 shows the package version in the window and in the row', () => {
    expect(row('R3.10')).toContain(`"v${v} · 50 type(s)`);
    expect(row('R3.10')).toContain(`"v${v} · 3 layer(s)"`);
  });

  it('the setup generates mat-v(N+1) to mat-v(N+4) from the current version', () => {
    expect(guide).toContain(`\`mat-v${v + 1}\` to \`mat-v${v + 4}\``);
    expect(guide).toContain(`already at version ${v};`);
    expect(guide).toContain(`s['version'] = ${v + 1}`);
    expect(guide).toContain(`'from': ${v + 1}, 'to': ${v + 2}`);
  });

  it('R3.14 to R3.17 use the shifted versions', () => {
    expect(row('R3.14')).toContain(`at version ${v})`);
    expect(row('R3.14')).toContain(`\`mat-v${v + 1}\``);
    expect(row('R3.14')).toContain(`From version ${v} to ${v + 1}.`);
    expect(row('R3.15')).toContain(`\`mat-v${v + 2}\``);
    expect(row('R3.16')).toContain(`\`mat-v${v + 3}\``);
    expect(row('R3.17')).toContain(`\`mat-v${v + 4}\``);
  });
});

// Retest finding of #1271: the guide's `evolve.py` had the v4..v7 branches swapped and broke with
// `KeyError 'migrations'`. The test runs the guide script on the chain the setup asks for and checks each copy.
describe('the guide evolve.py generates the mat-v(N+1) to mat-v(N+4) chain', () => {
  const v = spec.version;
  const after = guide.slice(guide.indexOf('**Preparing R3.14 to R3.17**'));
  const script = /```python\n([\s\S]*?)```/.exec(after)?.[1];

  it('runs without error and each copy has the right version, fields and migrations', () => {
    if (!script) throw new Error('evolve.py script missing from the guide');
    const dir = mkdtempSync(join(tmpdir(), 'evolve-'));
    try {
      writeFileSync(join(dir, 'evolve.py'), script);
      const run = (a: string, b: string, step: string): void => {
        execFileSync('python3', ['-I', join(dir, 'evolve.py'), a, b, step], {
          stdio: 'pipe',
        });
      };
      const out = (n: number): string => join(dir, `mat-v${n}`);
      run('libraries/material3-compose', out(v + 1), `v${v + 1}`);
      run(out(v + 1), out(v + 2), `v${v + 2}`);
      run(out(v + 2), out(v + 3), `v${v + 3}`);
      run(out(v + 3), out(v + 4), `v${v + 4}`);
      const read = (n: number): Record<string, unknown> =>
        JSON.parse(readFileSync(join(out(n), 'material3-compose.spec.json'), 'utf8'));
      const fab = (s: Record<string, unknown>): { key: string }[] =>
        (s.layers as { annotationTypes: { id: string; fields: { key: string }[] }[] }[])
          .flatMap((l) => l.annotationTypes)
          .find((t) => t.id === 'fab')!.fields;
      const keys = (n: number): string[] => fab(read(n)).map((f) => f.key);
      const typeIds = (n: number): string[] =>
        (read(n).layers as { annotationTypes: { id: string }[] }[]).flatMap((l) =>
          l.annotationTypes.map((t) => t.id),
        );
      for (let i = 1; i <= 4; i++) expect(read(v + i).version).toBe(v + i);
      expect(read(v + 1).migrations).toBeUndefined();
      expect(keys(v + 1)).toContain('note');
      expect(keys(v + 1)).toContain('containerColor');
      expect(keys(v + 2)).toContain('tone');
      expect(keys(v + 2)).not.toContain('containerColor');
      expect(read(v + 2).migrations).toEqual([
        {
          from: v + 1,
          to: v + 2,
          steps: [
            { op: 'rename-field', type: 'fab', from: 'containerColor', to: 'tone' },
          ],
        },
      ]);
      expect(keys(v + 3)).not.toContain('note');
      expect(
        (read(v + 3).migrations as { from: number; to: number }[]).map((m) => [
          m.from,
          m.to,
        ]),
      ).toEqual([
        [v + 1, v + 2],
        [v + 2, v + 3],
      ]);
      expect(typeIds(v + 3)).toContain('badge');
      expect(typeIds(v + 4)).not.toContain('badge');
      expect((read(v + 4).migrations as unknown[]).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the mat-v5 of R3.18 is valid: slider in tenths (enum) and examples only with tenths, without migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evolve5-'));
    try {
      writeFileSync(join(dir, 'evolve.py'), script!);
      execFileSync(
        'python3',
        [
          '-I',
          join(dir, 'evolve.py'),
          'libraries/material3-compose',
          join(dir, 'mat-v5'),
          'v5',
        ],
        { stdio: 'pipe' },
      );
      const s = JSON.parse(
        readFileSync(join(dir, 'mat-v5', 'material3-compose.spec.json'), 'utf8'),
      ) as {
        version: number;
        migrations?: unknown;
        layers: {
          annotationTypes: {
            id: string;
            fields: { key: string; type: string; options?: string[] }[];
            examples?: { values: Record<string, unknown> }[];
          }[];
        }[];
      };
      expect(s.version).toBe(5);
      expect(s.migrations).toBeUndefined();
      const slider = s.layers
        .flatMap((l) => l.annotationTypes)
        .find((t) => t.id === 'slider')!;
      const value = slider.fields.find((f) => f.key === 'value')!;
      expect(value.type).toBe('enum');
      for (const e of slider.examples ?? [])
        for (const k of ['value', 'valueStart', 'valueEnd'])
          if (k in e.values) expect(value.options).toContain(e.values[k]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('R3.15 says that Undo goes back to version N+1 of the specs', () => {
    expect(row('R3.15')).toContain(`goes back to \`"version": ${v + 1}\``);
  });
});
