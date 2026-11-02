import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSpecText, type Spec } from '../../src/model';

const ROOT = join(__dirname, '../../tests/fixtures/material3');

function list(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? list(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

/** O pacote do Material 3 como a app o recebe: caminho relativo à pasta → texto ou bytes. */
export function material3Package(): Map<string, string | Blob> {
  const files = new Map<string, string | Blob>();
  for (const path of list(ROOT).sort()) {
    const bytes = readFileSync(join(ROOT, path));
    files.set(
      path,
      path.endsWith('.json') || path.endsWith('.md')
        ? bytes.toString('utf8')
        : new Blob([new Uint8Array(bytes)]),
    );
  }
  return files;
}

export function material3Spec(): Spec {
  const text = material3Package().get('material3.spec.json');
  const parsed = parseSpecText(typeof text === 'string' ? text : '');
  if (!parsed.ok) throw new Error('material3.spec.json inválido');
  return parsed.spec;
}
