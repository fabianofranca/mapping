// R25.1: a biblioteca m3-fiel (cópia do pacote com oito componentes trocados pelo fiel.mjs) valida sem aviso.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFontPath } from '../../src/model/components/library';
import { validateLibrary } from '../../src/model/library';

const REPO = join(__dirname, '../..');

function list(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

describe('fiel.mjs (R25.1)', () => {
  it('m3-fiel: sem erro nem aviso (o interaction dos tipos trocados não fica sem uso)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'fiel-')), 'm3-fiel');
    cpSync(join(REPO, 'libraries/material3-compose'), dir, { recursive: true });
    execFileSync('node', [join(REPO, 'scripts/testing/fiel.mjs'), dir, '4']);
    writeFileSync(join(dir, '.keep'), '');
    const files = list(dir)
      .filter((p) => p !== '.keep')
      .map((path) =>
        isFontPath(path)
          ? { path, binary: true as const }
          : { path, text: readFileSync(join(dir, path), 'utf8') },
      );
    const report = validateLibrary({ files });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});
