// R3 (#1096, decision 11): the library validator accepts the five `$anchor.*` without a type field,
// refuses the others (`field does not exist`) and limits them to v4; the root `anchor` is also checked.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, unknown>;

function validate(children: Raw[], extra: Raw = {}, version = 4) {
  const comp = {
    format: 'mapping-component',
    formatVersion: version,
    id: 'tip',
    name: 'Tip',
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children },
    ...extra,
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'tip',
    name: 'Tip',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 'tip', name: 'Tip', component: 'components/tip.json', fields: [] },
        ],
      },
    ],
  };
  return validateLibrary({
    specPath: 'tip.spec.json',
    files: [
      { path: 'tip.spec.json', text: JSON.stringify(spec) },
      { path: 'components/tip.json', text: JSON.stringify(comp) },
    ],
  });
}

const rect = (extra: Raw): Raw => ({
  type: 'rect',
  name: 'r',
  width: 10,
  height: 10,
  fill: '#000000',
  ...extra,
});

const messages = (r: ReturnType<typeof validate>) =>
  [...r.errors, ...r.warnings].map((i) => `${i.path}: ${i.message}`);

describe('$anchor.* in the library', () => {
  it('the five names are valid without a field in the type (and no field warning)', () => {
    const r = validate([
      rect({
        anchors: {
          left: { $sub: [{ $field: '$anchor.x' }, 8] },
          top: { $field: '$anchor.y' },
        },
        visible: { $and: [{ $eq: ['$anchor.side', 'top'] }, { $has: '$anchor.width' }] },
        fill: { $switch: '$anchor.side', cases: { top: '#000000' }, default: '#ffffff' },
        height: { $field: '$anchor.height' },
      }),
    ]);
    expect(messages(r)).toEqual([]);
  });

  it('another $anchor.* is an error: field does not exist', () => {
    const r = validate([rect({ anchors: { left: { $field: '$anchor.foo' } } })]);
    expect(messages(r).join('\n')).toContain('field does not exist: $anchor.foo');
    expect(messages(r).join('\n')).not.toContain('does not declare');
  });

  it('in a version 1 to 3, it is only allowed with formatVersion 4', () => {
    const r = validate([rect({ visible: { $has: '$anchor.x' } })], {}, 3);
    expect(messages(r).join('\n')).toContain('only allowed with formatVersion 4');
  });

  it('the root anchor is checked by the same validation as the component', () => {
    const bad = validate([], { anchor: { side: 'left' } });
    expect(messages(bad).join('\n')).toContain(
      'expected one of: top, bottom, start, end',
    );
    expect(
      messages(validate([], { anchor: { side: 'bottom', align: 'start' } })),
    ).toEqual([]);
  });
});
