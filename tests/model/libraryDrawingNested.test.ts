// CC2: the drawing proof (level 3) draws a composed component: the `component` node draws the inner
// type like the app does, and an inner "does not fit" warning arrives with `(approximate)`.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'n.spec.json';

const component = (id: string, template: Raw, over: Raw = {}): Raw => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width: 100, height: 50 },
  template,
  ...over,
});

/** The inner `label`: a row with a text that is wider than 100 px when it says "Hello world". */
const label = (text: unknown): Raw =>
  component('label', {
    type: 'frame',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'text',
        name: 'caption',
        text,
        font: { family: 'Roboto', size: 20, weight: 400, lineHeight: 24 },
        color: '#000000',
      },
    ],
  });

const outer = (): Raw =>
  component('outer', {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'component',
        id: 'label',
        width: 100,
        height: 50,
        values: { text: { $field: 'title' } },
      },
    ],
  });

const spec = (): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'n',
  name: 'N',
  version: 1,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        {
          id: 'outer',
          name: 'Outer',
          component: 'components/outer.json',
          fields: [{ key: 'title', type: 'string', default: 'Hi' }],
        },
        {
          id: 'label',
          name: 'Label',
          component: 'components/label.json',
          fields: [{ key: 'text', type: 'string', default: 'Hi' }],
        },
      ],
    },
  ],
});

function prove(text: unknown) {
  return validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec()) },
      { path: 'components/outer.json', text: JSON.stringify(outer()) },
      { path: 'components/label.json', text: JSON.stringify(label(text)) },
    ],
  });
}

describe('drawing proof of a composed component', () => {
  it('draws the composed component with no warning when the inner one fits', () => {
    const report = prove({ $field: 'text' });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('an inner "does not fit" warning arrives, with (approximate)', () => {
    const report = prove('A text that is much wider than the box');
    const messages = report.warnings.map((w) => w.message);
    const outerMessages = messages.filter((m) => m.startsWith('type "outer"'));
    expect(outerMessages.length).toBeGreaterThan(0);
    expect(outerMessages.every((m) => m.endsWith('(approximate)'))).toBe(true);
    expect(outerMessages.join('\n')).toMatch(/larger than the box/);
  });
});
