// Biblioteca de exemplo `sdui-backend` (EX1): a origem executável (um backend de SDUI fictício),
// com `sources`, `slot`, âncoras, `scrim`, exemplos do sistema externo e o contrato de versão.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';

const ROOT = join(__dirname, '../../examples/libraries/sdui-backend');
const SPEC_FILE = 'sdui-backend.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('biblioteca de exemplo sdui-backend', () => {
  it('tem a especialização, um componente por tipo visual, um documento por tipo e os JSON do sistema externo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/sdui-button.json',
        'components/sdui-column.json',
        'components/sdui-fab.json',
        'components/sdui-scrim.json',
        'components/sdui-sheet.json',
        'docs/sdui-button.md',
        'docs/sdui-column.md',
        'docs/sdui-endpoint.md',
        'docs/sdui-fab.md',
        'docs/sdui-scrim.md',
        'docs/sdui-sheet.md',
        'examples/button.sdui.json',
        'examples/settings.sdui.json',
      ].sort(),
    );
  });

  it('valida sem erro nos três níveis e sem aviso', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 6, components: 5, docs: 6 });
  });

  it('é a versão 2, com uma migração da 1 e os seis passos', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.version).toBe(2);
    expect(parsed.spec.migrations).toHaveLength(1);
    const steps = parsed.spec.migrations?.[0]?.steps ?? [];
    expect([...new Set(steps.map((s) => s.op))].sort()).toEqual([
      'fill-field',
      'map-values',
      'remove-field',
      'remove-type',
      'rename-field',
      'rename-type',
    ]);
    const modes = steps.flatMap((s) => (s.op === 'remove-type' ? [s.mode] : []));
    expect(modes.sort()).toEqual(['convert', 'delete']);
  });
});

describe('contrato da origem do pacote', () => {
  const library = loadLibrary(
    files
      .filter((f) => f.path.endsWith('.json'))
      .map((f) => ({ path: f.path, text: f.text })),
  );

  it('a declaração traduz examples/settings.sdui.json sem aviso', () => {
    expect(library.problems).toEqual([]);
    const result = screenFromSource(
      library,
      JSON.parse(text('examples/settings.sdui.json')),
      { measure: approximateMeasurer },
    );
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.screen).toBeDefined();
  });

  it('a tela traz a coluna, a flutuante e a folha com a película', () => {
    const result = screenFromSource(
      library,
      JSON.parse(text('examples/settings.sdui.json')),
      { measure: approximateMeasurer },
    );
    const types = JSON.stringify(result.screen);
    for (const id of [
      'sdui-column',
      'sdui-button',
      'sdui-fab',
      'sdui-sheet',
      'sdui-scrim',
    ]) {
      expect(types, id).toContain(id);
    }
  });
});
