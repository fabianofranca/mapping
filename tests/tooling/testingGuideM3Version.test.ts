import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Achado 4.2 da #954: o roteiro R3.10 a R3.17 do `docs/TESTING.md` dizia que o pacote
// `libraries/material3-compose/` está na versão 2, e ele já estava na 3. O teste amarra o texto
// do guia à versão que a especialização do pacote declara, e as cópias `mat-vN` à cadeia.

const guide = readFileSync('docs/TESTING.md', 'utf8');
const spec = JSON.parse(
  readFileSync('libraries/material3-compose/material3-compose.spec.json', 'utf8'),
) as { version: number };
const row = (id: string): string => {
  const line = guide.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!line) throw new Error(`linha ${id} ausente`);
  return line;
};

describe('R3.10 a R3.17 do guia seguem a versão do pacote Material 3 (Compose)', () => {
  const v = spec.version;

  it('R3.10 mostra a versão do pacote na janela e na linha', () => {
    expect(row('R3.10')).toContain(`"v${v} · 50 tipo(s)`);
    expect(row('R3.10')).toContain(`"v${v} · 3 camada(s)"`);
  });

  it('o preparo gera mat-v(N+1) a mat-v(N+4) a partir da versão atual', () => {
    expect(guide).toContain(`\`mat-v${v + 1}\` a \`mat-v${v + 4}\``);
    expect(guide).toContain(`já está na versão ${v};`);
    expect(guide).toContain(`s['version'] = ${v + 1}`);
    expect(guide).toContain(`'from': ${v + 1}, 'to': ${v + 2}`);
  });

  it('R3.14 a R3.17 usam as versões deslocadas', () => {
    expect(row('R3.14')).toContain(`na versão ${v})`);
    expect(row('R3.14')).toContain(`\`mat-v${v + 1}\``);
    expect(row('R3.14')).toContain(`Da versão ${v} para a ${v + 1}.`);
    expect(row('R3.15')).toContain(`\`mat-v${v + 2}\``);
    expect(row('R3.16')).toContain(`\`mat-v${v + 3}\``);
    expect(row('R3.17')).toContain(`\`mat-v${v + 4}\``);
  });
});

// Achado do reteste da #1271: o `evolve.py` do guia tinha os ramos v4..v7 trocados e quebrava com
// `KeyError 'migrations'`. O teste roda o script do guia na cadeia que o preparo manda e confere cada cópia.
describe('o evolve.py do guia gera a cadeia mat-v(N+1) a mat-v(N+4)', () => {
  const v = spec.version;
  const after = guide.slice(guide.indexOf('**Preparo do R3.14 a R3.17**'));
  const script = /```python\n([\s\S]*?)```/.exec(after)?.[1];

  it('roda sem erro e cada cópia tem a versão, os campos e as migrações certos', () => {
    if (!script) throw new Error('script evolve.py ausente no guia');
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

  it('o R3.15 diz que o Desfazer volta à versão N+1 do specs', () => {
    expect(row('R3.15')).toContain(`volta a \`"version": ${v + 1}\``);
  });
});
