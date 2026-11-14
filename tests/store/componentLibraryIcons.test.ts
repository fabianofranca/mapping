// @vitest-environment node
// CF7: a biblioteca carregada na app resolve o ícone do pacote (`icons` da especialização).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpecText } from '../../src/model';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { readSpecComponents } from '../../src/store/componentLibrary';

const DIR = 'tests/fixtures/icons';
const SPEC_FILE = 'specs/icons/icons.spec.json';

const parsed = parseSpecText(readFileSync(join(DIR, 'icons.spec.json'), 'utf8'));
if (!parsed.ok) throw new Error('spec de teste inválida');

/** Lê um caminho da raiz do projeto (`specs/icons/…`) a partir da pasta do pacote de teste. */
async function read(path: string): Promise<string | null> {
  const rel = path.replace(/^specs\/icons\//, '');
  try {
    return readFileSync(join(DIR, rel), 'utf8');
  } catch {
    return null;
  }
}

describe('readSpecComponents com icons', () => {
  it('lê o arquivo de ícones junto dos componentes e o ícone do pacote desenha', async () => {
    const loaded = await readSpecComponents(parsed.spec, SPEC_FILE, 1, read);
    expect(loaded.problems).toEqual([]);
    const component = loaded.byType.get('badge');
    expect(component?.resolvedIcons?.icons.check).toBeDefined();
    if (component === undefined) throw new Error('sem componente');
    const { root, warnings } = instantiate(
      component,
      { icon: 'close', tint: '#0a7' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(warnings).toEqual([]);
    expect(JSON.stringify(root)).toContain('M6 6l12 12M18 6L6 18');
  });

  it('sem o arquivo de ícones, o catálogo avisa e o ícone fica reservado', async () => {
    const loaded = await readSpecComponents(parsed.spec, SPEC_FILE, 1, (path) =>
      path.endsWith('icons/set.json') ? Promise.resolve(null) : read(path),
    );
    expect(loaded.problems).toEqual(['icons: missing file (specs/icons/icons/set.json)']);
    const component = loaded.byType.get('badge');
    if (component === undefined) throw new Error('sem componente');
    const { warnings } = instantiate(
      component,
      { icon: 'check' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(warnings).toContain('unknown icon: check');
  });
});
