// SL1: the test library of named slots (`tests/fixtures/slots`) passes the library validator, and the
// box rule and the id rules reach it through the component file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconNodes } from '../../src/model/components/icons';
import { componentSlots, fallbackFields } from '../../src/model/components/slots';
import { parseComponent } from '../../src/model/components/parseComponent';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const DIR = 'tests/fixtures/slots';
const PATHS = [
  'slots.spec.json',
  'components/bar.json',
  'components/pin.json',
  'components/rounded-bar.json',
];

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(overrides: Record<string, string> = {}): LibraryFile[] {
  return PATHS.map((path) => ({ path, text: overrides[path] ?? read(path) }));
}

const brief = (
  issues: readonly { severity: string; file: string; path: string; message: string }[],
) => issues.map((i) => `${i.severity} ${i.file} ${i.path}: ${i.message}`);

function parsedBar() {
  const result = parseComponent(JSON.parse(read('components/bar.json')));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.component;
}

describe('validateLibrary: named slots test library', () => {
  it('passes with no errors or warnings', () => {
    const report = validateLibrary({ files: pack() });
    expect(brief(report.issues)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('the bar has two slots with an id, in template order', () => {
    expect(componentSlots(parsedBar()).map((slot) => slot.id)).toEqual([
      'navigationIcon',
      'actions',
    ]);
  });

  it('each fallback cites a field that only the default content uses', () => {
    const fields = fallbackFields(parsedBar());
    expect([...(fields.get('navigationIcon') ?? [])]).toEqual(['navLabel']);
    expect([...(fields.get('actions') ?? [])]).toEqual(['actionLabel']);
  });

  it('the hug slot and the fixed slot have the sizes the tests rely on', () => {
    const [nav, actions] = componentSlots(parsedBar());
    expect(nav?.width).toBe(40);
    expect(actions?.width).toBe('hug');
  });

  it('a slot without id in the bar is a library error at the component file', () => {
    const json: { template: { children: { id?: string }[] } } = JSON.parse(
      read('components/bar.json'),
    );
    delete json.template.children[0]?.id;
    const report = validateLibrary({
      files: pack({ 'components/bar.json': JSON.stringify(json) }),
    });
    expect(report.ok).toBe(false);
    expect(brief(report.errors).join('\n')).toContain(
      'slot: with more than one slot, each one needs an id',
    );
  });
});

describe('icons in the default content', () => {
  it('iconNodes collects the icon nodes of a slot fallback, at the fallback path', () => {
    const template = {
      type: 'frame',
      children: [
        {
          type: 'slot',
          id: 'a',
          fallback: { type: 'frame', children: [{ type: 'icon', name: 'check' }] },
        },
      ],
    };
    expect(iconNodes(template)).toEqual([
      { path: 'template.children[0].fallback.children[0].name', name: 'check' },
    ]);
  });
});
