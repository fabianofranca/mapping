import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { files } from '../support/material3Library';

// Finding R9.22 of #1355 (fix CL1): the script said "1 warning" and `children[1]`, but the
// Material 3 package already brings the `parâmetro fora da ficha` warnings and the `label` node is
// `children[4].children[2]`. The test assembles the real package with the invalid `family` and ties
// the script text to the result.

const BUTTON = 'components/button.json';
const FAMILY = '"Segoe UI, Roboto';

const withFamily = (): typeof files =>
  files.map((f) => {
    if (f.path !== BUTTON || f.text === undefined) return f;
    const json = JSON.parse(f.text) as {
      template: {
        children: { children: { name: string; font: Record<string, unknown> }[] }[];
      };
    };
    const label = json.template.children[4]?.children[2];
    if (label?.name !== 'label')
      throw new Error('label node is not at children[4].children[2]');
    label.font.family = FAMILY;
    return { ...f, text: JSON.stringify(json, null, 2) };
  });

const row = readFileSync('docs/TESTING.md', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('| R9.22 |'));

describe('R9.22 of the script matches the Material 3 package validator', () => {
  const base = validateLibrary({ files });
  const altered = validateLibrary({ files: withFamily() });
  const added = altered.warnings.filter(
    (w) => w.file === BUTTON && w.path.endsWith('font.family'),
  );

  it('the new warning is the only one in button.json and cites the path and the value', () => {
    expect(altered.errors).toEqual([]);
    expect(added.map((w) => w.path)).toEqual([
      'template.children[4].children[2].font.family',
    ]);
    expect(added[0]?.message).toContain(FAMILY);
    expect(altered.warnings.length).toBe(base.warnings.length + 1);
  });

  it('the script says "the usual warnings plus 1", with no fixed number, and the right path', () => {
    expect(row).toBeDefined();
    expect(row).not.toMatch(/1 warning/);
    expect(row).not.toMatch(/one item in `warnings`/);
    expect(row).toContain('template.children[4].children[2]');
    expect(row).not.toContain('`children[1]` of the frame');
    expect(row).toContain('`parameter outside the signature`');
    expect(row).toContain('plus 1');
  });
});
