// MF2: shadow list (1 to 4), `shadow.spread` and `stroke.gap` (format 4) — validator.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const t = (name: string) => ({ $token: name });
const shadow = (extra: Record<string, unknown> = {}) => ({ color: '#000', ...extra });

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [child] },
  };
}

const rect = (extra: Record<string, unknown>) => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

describe('shadow as a list (decision 3)', () => {
  it('from 1 to 4 shadows is valid', () => {
    for (let n = 1; n <= 4; n++) {
      const list = Array.from({ length: n }, () => shadow({ y: 2 }));
      expect(validateComponent(withChild(rect({ shadow: list })))).toEqual([]);
    }
  });

  it('the single object is still valid, in every version', () => {
    for (const version of [1, 2, 3, 4])
      expect(validateComponent(withChild(rect({ shadow: shadow() }), version))).toEqual(
        [],
      );
  });

  it('an empty list or one with 5 shadows is an error', () => {
    const msg = 'template.children[0].shadow: expected 1 to 4 shadows';
    expect(validateComponent(withChild(rect({ shadow: [] })))).toEqual([msg]);
    const five = Array.from({ length: 5 }, () => shadow());
    expect(validateComponent(withChild(rect({ shadow: five })))).toEqual([msg]);
  });

  it('each item is validated at its own path', () => {
    const list = [shadow(), { x: 1 }, shadow({ blur: -1 }), shadow({ cor: 1 })];
    expect(validateComponent(withChild(rect({ shadow: list })))).toEqual([
      'template.children[0].shadow[1].color: required field',
      'template.children[0].shadow[2].blur: expected a number greater than or equal to 0',
      'template.children[0].shadow[3].cor: unknown key: cor',
    ]);
  });

  it('in a version 1 to 3 the list gives the version error, at the shadow path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ shadow: [shadow(), shadow()] }), version)),
      ).toEqual([`template.children[0].shadow: ${V4}`]);
  });

  it('a list item with $token collects the reference at the item path', () => {
    const r = parseComponent(
      withChild(rect({ shadow: [shadow(), shadow({ blur: t('e-blur') })] })),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind])).toEqual([
      ['template.children[0].shadow[1].blur', 'number'],
    ]);
  });
});

describe('shadow.spread (decision 4)', () => {
  it('literal (including negative) and number $token are valid', () => {
    expect(validateComponent(withChild(rect({ shadow: shadow({ spread: 2 }) })))).toEqual(
      [],
    );
    expect(
      validateComponent(withChild(rect({ shadow: shadow({ spread: -3 }) }))),
    ).toEqual([]);
    const r = parseComponent(
      withChild(rect({ shadow: [shadow({ spread: t('e-spread') })] })),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.kind])).toEqual([
      ['template.children[0].shadow[0].spread', 'number'],
    ]);
  });

  it('text is not valid', () => {
    expect(
      validateComponent(withChild(rect({ shadow: shadow({ spread: 'x' }) }))),
    ).toEqual(['template.children[0].shadow.spread: expected a number']);
  });

  it('in versions 1 to 3 it gives the version error, at the key path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ shadow: shadow({ spread: 2 }) }), version)),
      ).toEqual([`template.children[0].shadow.spread: ${V4}`]);
  });
});

describe('stroke.gap (decision 7)', () => {
  const labelled = (stroke: Record<string, unknown>, version = 4, type = 'frame') => {
    const node: Record<string, unknown> = {
      type,
      width: 60,
      height: 20,
      stroke: { color: '#000', ...stroke },
    };
    return {
      format: COMPONENT_FORMAT,
      formatVersion: version,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 40 },
      template: {
        type: 'frame',
        children: [
          node,
          { type: 'text', name: 'label', text: 'Name', width: 'hug', height: 'hug' },
        ],
      },
    };
  };

  it('is valid with the name of a template node, with and without padding', () => {
    expect(validateComponent(labelled({ gap: { node: 'label', padding: 4 } }))).toEqual(
      [],
    );
    expect(validateComponent(labelled({ gap: { node: 'label' } }))).toEqual([]);
    expect(
      validateComponent(labelled({ gap: { node: 'label', padding: 4 } }, 4, 'rect')),
    ).toEqual([]);
  });

  it('the default name of a node (the type) is also found', () => {
    const unnamed = labelled({ gap: { node: 'text' } }) as {
      template: { children: Record<string, unknown>[] };
    };
    delete unnamed.template.children[1]!.name;
    expect(validateComponent(unnamed)).toEqual([]);
  });

  it('a name that no node has is a validation error', () => {
    expect(validateComponent(labelled({ gap: { node: 'nothing' } }))).toEqual([
      'template.children[0].stroke.gap.node: node not found: nothing',
    ]);
  });

  // CL1 / D2: the gap only opens on a node outside `repeat` and that is not itself; the rest is an error.
  it('citing the node itself is a validation error', () => {
    const own = labelled({ gap: { node: 'self' } }) as {
      template: { children: Record<string, unknown>[] };
    };
    own.template.children[0]!.name = 'self';
    expect(validateComponent(own)).toEqual([
      'template.children[0].stroke.gap.node: stroke.gap.node cannot name the node itself: self',
    ]);
  });

  it('citing a node inside a repeat is a validation error', () => {
    const doc = labelled({ gap: { node: 'label' } }) as {
      template: { children: unknown[] };
    };
    doc.template.children[1] = {
      type: 'repeat',
      count: 2,
      template: {
        type: 'frame',
        children: [
          { type: 'text', name: 'label', text: 'x', width: 'hug', height: 'hug' },
        ],
      },
    };
    expect(validateComponent(doc)).toEqual([
      'template.children[0].stroke.gap.node: stroke.gap.node cannot name a node inside a repeat: label',
    ]);
  });

  it('the gap inside a repeat is a validation error', () => {
    const doc = labelled({ gap: { node: 'label' } }) as {
      template: { children: unknown[] };
    };
    const [frame, text] = doc.template.children;
    doc.template.children = [{ type: 'repeat', count: 2, template: frame }, text];
    expect(validateComponent(doc)).toEqual([
      'template.children[0].template.stroke.gap.node: stroke.gap cannot be used inside a repeat',
    ]);
  });

  it('gap together with sides is an error', () => {
    expect(
      validateComponent(labelled({ gap: { node: 'label' }, sides: ['top', 'left'] })),
    ).toEqual(['template.children[0].stroke.gap: gap is not valid with sides']);
  });

  it('only valid on frame and rect', () => {
    expect(validateComponent(labelled({ gap: { node: 'label' } }, 4, 'ellipse'))).toEqual(
      ['template.children[0].stroke.gap: only valid in frame and rect (this is ellipse)'],
    );
  });

  it('wrong shape: node is required, unknown key, numeric padding', () => {
    expect(validateComponent(labelled({ gap: {} }))).toEqual([
      'template.children[0].stroke.gap.node: required field',
    ]);
    expect(validateComponent(labelled({ gap: { node: 'label', foo: 1 } }))).toEqual([
      'template.children[0].stroke.gap.foo: unknown key: foo',
    ]);
    expect(validateComponent(labelled({ gap: { node: 'label', padding: 'x' } }))).toEqual(
      ['template.children[0].stroke.gap.padding: expected a number'],
    );
  });

  it('in versions 1 to 3 it gives the version error, at the key path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(labelled({ gap: { node: 'label', padding: 4 } }, version)),
      ).toContain(`template.children[0].stroke.gap: ${V4}`);
  });
});
