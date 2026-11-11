// Preparo do R8.5 (achado 1.1, etapa #1533): `mat-sem-badge` precisa estar numa versão acima da
// do pacote instalado, senão a app responde "Nada a fazer" e nunca chega ao erro do `badge`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { missingMigrations } from '../../src/model/specVersions';
import type { Spec } from '../../src/model/spec';

const read = (file: string): Spec => JSON.parse(readFileSync(file, 'utf8')) as Spec;

describe('scripts/testing/r85-prep.sh (achado 1.1)', () => {
  let out = '';
  beforeAll(() => {
    out = mkdtempSync(path.join(tmpdir(), 'r85-'));
    const r = spawnSync('bash', ['scripts/testing/r85-prep.sh', out], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('mat-sem-badge tem versão acima do pacote instalado e a migração do badge falta', () => {
    const installed = read('libraries/material3-compose/material3-compose.spec.json');
    const prepared = read(path.join(out, 'mat-sem-badge/material3-compose.spec.json'));
    expect(prepared.version).toBeGreaterThan(installed.version);
    const missing = missingMigrations(installed, prepared);
    expect(missing.map((c) => [c.code, c.typeId])).toEqual([['removed-type', 'badge']]);
  });
});
