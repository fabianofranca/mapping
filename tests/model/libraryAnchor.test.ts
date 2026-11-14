// R3 (#1096, decisão 11): o validador de biblioteca aceita os cinco `$anchor.*` sem campo do tipo,
// recusa os outros (`campo não existe`) e os limita à v4; o `anchor` da raiz também é conferido.
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

describe('$anchor.* na biblioteca', () => {
  it('os cinco nomes valem sem campo no tipo (nem aviso de campo)', () => {
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

  it('outro $anchor.* é erro: campo não existe', () => {
    const r = validate([rect({ anchors: { left: { $field: '$anchor.foo' } } })]);
    expect(messages(r).join('\n')).toContain('field does not exist: $anchor.foo');
    expect(messages(r).join('\n')).not.toContain('não declarado');
  });

  it('numa versão 1 a 3, só é permitido com formatVersion 4', () => {
    const r = validate([rect({ visible: { $has: '$anchor.x' } })], {}, 3);
    expect(messages(r).join('\n')).toContain('only allowed with formatVersion 4');
  });

  it('o anchor da raiz é conferido pela mesma validação do componente', () => {
    const bad = validate([], { anchor: { side: 'left' } });
    expect(messages(bad).join('\n')).toContain(
      'expected one of: top, bottom, start, end',
    );
    expect(
      messages(validate([], { anchor: { side: 'bottom', align: 'start' } })),
    ).toEqual([]);
  });
});
