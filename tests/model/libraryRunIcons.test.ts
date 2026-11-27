// RT3 of #2916: the icon runs (`…runs[i].icon`) go through the same library checks as the `icon` node.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const DIR = 'tests/fixtures/icons';
const SPEC = 'icons.spec.json';
const PATHS = [SPEC, 'components/badge.json', 'icons/set.json'];
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(overrides: Record<string, string> = {}): LibraryFile[] {
  return PATHS.map((path) => ({ path, text: overrides[path] ?? read(path) }));
}

/** The badge with a text node of icon runs added after the icon node. */
function badgeWithRuns(runs: unknown[]): string {
  const json = JSON.parse(read('components/badge.json'));
  json.template.children.push({ type: 'text', runs });
  return JSON.stringify(json);
}

const brief = (
  issues: readonly { severity: string; file: string; path: string; message: string }[],
) => issues.map((i) => `${i.severity} ${i.file} ${i.path}: ${i.message}`);

describe('validateLibrary: icon runs', () => {
  it('a literal name in the set is fine', () => {
    const report = validateLibrary({
      files: pack({ 'components/badge.json': badgeWithRuns([{ icon: 'check' }]) }),
    });
    expect(brief(report.issues)).toEqual([]);
  });

  it('a literal name outside the set is an error at …runs[i].icon, with the icon node code', () => {
    const report = validateLibrary({
      files: pack({
        'components/badge.json': badgeWithRuns([{ text: 'a' }, { icon: 'cloud' }]),
      }),
    });
    expect(brief(report.errors)).toEqual([
      'error components/badge.json template.children[1].runs[1].icon: the icon "cloud" does not exist in the icon set (icons/set.json)',
    ]);
  });

  it('a literal name inside an $if is checked too', () => {
    const report = validateLibrary({
      files: pack({
        'components/badge.json': badgeWithRuns([
          { icon: { $if: { $field: 'icon' }, then: 'cloud', else: 'check' } },
        ]),
      }),
    });
    expect(brief(report.errors).join('\n')).toContain(
      'template.children[1].runs[0].icon.then: the icon "cloud" does not exist',
    );
  });

  it('level 3: an enum option read by the run icon that is not in the set warns', () => {
    const spec = JSON.parse(read(SPEC));
    spec.layers[0].annotationTypes[0].fields[0].options = ['check', 'cloud'];
    const comp = JSON.parse(read('components/badge.json'));
    comp.template.children = [{ type: 'text', runs: [{ icon: { $field: 'icon' } }] }];
    const report = validateLibrary({
      files: pack({
        [SPEC]: JSON.stringify(spec),
        'components/badge.json': JSON.stringify(comp),
      }),
    });
    expect(brief(report.warnings)).toContain(
      `warning ${SPEC} layers[0].annotationTypes[0].fields[0].options[1]: the option "cloud" of the field "icon" is not in the icon set; the drawing falls back to the placeholder`,
    );
  });
});
