// @vitest-environment node
// CF7: the library loaded in the app resolves the package icon (`icons` of the specialization).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpecText } from '../../src/model';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { readSpecComponents } from '../../src/store/componentLibrary';

const DIR = 'tests/fixtures/icons';
const SPEC_FILE = 'specs/icons/icons.spec.json';

const parsed = parseSpecText(readFileSync(join(DIR, 'icons.spec.json'), 'utf8'));
if (!parsed.ok) throw new Error('invalid test spec');

/** Reads a path from the project root (`specs/icons/…`) from the folder of the test package. */
async function read(path: string): Promise<string | null> {
  const rel = path.replace(/^specs\/icons\//, '');
  try {
    return readFileSync(join(DIR, rel), 'utf8');
  } catch {
    return null;
  }
}

describe('readSpecComponents with icons', () => {
  it('reads the icons file along with the components and the package icon draws', async () => {
    const loaded = await readSpecComponents(parsed.spec, SPEC_FILE, 1, read);
    expect(loaded.problems).toEqual([]);
    const component = loaded.byType.get('badge');
    expect(component?.resolvedIcons?.icons.check).toBeDefined();
    if (component === undefined) throw new Error('no component');
    const { root, warnings } = instantiate(
      component,
      { icon: 'close', tint: '#0a7' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(warnings).toEqual([]);
    expect(JSON.stringify(root)).toContain('M6 6l12 12M18 6L6 18');
  });

  it('without the icons file, the catalog warns and the icon stays reserved', async () => {
    const loaded = await readSpecComponents(parsed.spec, SPEC_FILE, 1, (path) =>
      path.endsWith('icons/set.json') ? Promise.resolve(null) : read(path),
    );
    expect(loaded.problems).toEqual(['icons: missing file (specs/icons/icons/set.json)']);
    const component = loaded.byType.get('badge');
    if (component === undefined) throw new Error('no component');
    const { warnings } = instantiate(
      component,
      { icon: 'check' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer },
    );
    expect(warnings).toContain('unknown icon: check');
  });
});
