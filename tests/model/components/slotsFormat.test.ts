// Named slots (stage #1080, SL1): `slot.id` and `slot.fallback` in the component format (v4), the
// box rule and the version gate. The pure functions are in `slots.test.ts`.
import { describe, expect, it } from 'vitest';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const ID_PATTERN = 'expected text matching ^[a-z][a-zA-Z0-9_-]*$';
const NEEDS_ID = 'slot: with more than one slot, each one needs an id';
const BOX = 'slot: the box cannot depend on a field of the default content';

type Node = Record<string, unknown>;

const slot = (extra: Node = {}): Node => ({ type: 'slot', ...extra });
const frame = (extra: Node = {}): Node => ({ type: 'frame', ...extra });
const text = (field: string): Node => ({ type: 'text', text: { $field: field } });

function component(children: readonly unknown[], version = 4, root: Node = {}): unknown {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'bar',
    name: 'Bar',
    size: { width: 360, height: 64 },
    template: { type: 'frame', ...root, children },
  };
}

const problems = (children: readonly unknown[], version = 4, root: Node = {}): string[] =>
  validateComponent(component(children, version, root));

describe('slot.id: more than one slot needs an id', () => {
  it('two slots without id fail, one error per slot, at the node path', () => {
    expect(problems([slot(), slot()])).toEqual([
      `template.children[0]: ${NEEDS_ID}`,
      `template.children[1]: ${NEEDS_ID}`,
    ]);
  });

  it('only the slot without id fails when the other one has it', () => {
    expect(problems([slot({ id: 'a' }), slot()])).toEqual([
      `template.children[1]: ${NEEDS_ID}`,
    ]);
  });

  it('a slot nested in a frame counts for the rule, in depth', () => {
    expect(problems([frame({ children: [slot({ id: 'a' })] }), slot()])).toEqual([
      `template.children[1]: ${NEEDS_ID}`,
    ]);
  });

  it('a single slot, with or without id, is valid (everything works as today)', () => {
    expect(problems([slot()])).toEqual([]);
    expect(problems([slot({ id: 'content' })])).toEqual([]);
  });

  it('two slots with an id each are valid', () => {
    expect(problems([slot({ id: 'navigationIcon' }), slot({ id: 'actions' })])).toEqual(
      [],
    );
  });

  it('a repeated id fails at the id of the second slot', () => {
    expect(problems([slot({ id: 'a' }), slot({ id: 'b' }), slot({ id: 'a' })])).toEqual([
      'template.children[2].id: slot: repeated id: a',
    ]);
  });
});

describe('slot.id: pattern', () => {
  it.each(['Floating', '1a', 'a b', '-a', '', 'a.b'])('%j fails at the id path', (id) => {
    expect(problems([slot({ id })])).toEqual([`template.children[0].id: ${ID_PATTERN}`]);
  });

  it('a value that is not text fails the same way', () => {
    expect(problems([slot({ id: 3 })])).toEqual([
      `template.children[0].id: ${ID_PATTERN}`,
    ]);
  });

  it.each([
    'floatingActionButton',
    'navigationIcon',
    'a',
    'top-bar',
    'content_1',
    'a1B2',
  ])('%j passes (camelCase, so the id can equal the platform parameter)', (id) => {
    expect(problems([slot({ id })])).toEqual([]);
  });

  it('the id of the component root keeps its own (kebab) pattern', () => {
    const input = component([slot({ id: 'a' })]) as Node;
    expect(validateComponent({ ...input, id: 'floatingActionButton' })).toEqual([
      'id: expected text matching ^[a-z0-9][a-z0-9-_]*$',
    ]);
  });
});

describe('slot.id and slot.fallback before formatVersion 4', () => {
  it.each([1, 2, 3])('id in version %i is v4 only, at the id path', (version) => {
    expect(problems([slot({ id: 'a' })], version)).toEqual([
      `template.children[0].id: ${V4}`,
    ]);
  });

  it.each([1, 2, 3])(
    'fallback in version %i is v4 only, at the fallback path',
    (version) => {
      expect(problems([slot({ fallback: frame() })], version)).toEqual([
        `template.children[0].fallback: ${V4}`,
      ]);
    },
  );

  it.each([1, 2, 3])(
    'two slots without id in version %i stay valid, as today',
    (version) => {
      expect(problems([slot(), slot()], version)).toEqual([]);
    },
  );

  it('the id of a slot is not required nor flagged twice in version 3', () => {
    expect(problems([slot({ id: 'a' }), slot({ id: 'a' })], 3)).toEqual([
      `template.children[0].id: ${V4}`,
      `template.children[1].id: ${V4}`,
    ]);
  });
});

describe('slot.fallback', () => {
  it('a frame with children passes and is kept in the parsed component', () => {
    const result = parseComponent(
      component([slot({ id: 'a', fallback: frame({ children: [text('x')] }) })]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = result.component.template as unknown as Node;
    const found = (parsed.children as Node[])[0] as Node;
    expect(found.id).toBe('a');
    expect((found.fallback as Node).type).toBe('frame');
  });

  it('may have a repeat and its own size, anchors and layout', () => {
    expect(
      problems([
        slot({
          id: 'a',
          fallback: frame({
            width: 'hug',
            layout: { type: 'row', gap: 4 },
            children: [
              {
                type: 'repeat',
                count: 3,
                template: frame({ children: [text('x')] }),
              },
            ],
          }),
        }),
      ]),
    ).toEqual([]);
  });

  it('must be a frame, at the type path', () => {
    expect(problems([slot({ fallback: { type: 'rect' } })])).toEqual([
      'template.children[0].fallback.type: the fallback must be of type "frame"',
    ]);
  });

  it('a value that is not an object fails at the fallback path', () => {
    expect(problems([slot({ fallback: 'x' })])).toEqual([
      'template.children[0].fallback: expected an object (node)',
    ]);
  });

  it('a slot inside the fallback is an error, at the type path of that slot', () => {
    expect(
      problems([
        slot({ id: 'a', fallback: frame({ children: [frame({ children: [slot()] })] }) }),
      ]),
    ).toEqual([
      'template.children[0].fallback.children[0].children[0].type: fallback: cannot have a slot',
    ]);
  });

  it('the nodes of the fallback are validated like any other (unknown key)', () => {
    expect(
      problems([slot({ fallback: frame({ children: [{ type: 'rect', zz: 1 }] }) })]),
    ).toEqual(['template.children[0].fallback.children[0].zz: unknown key: zz']);
  });

  it('the variables of a frame `let` inside the fallback are expanded', () => {
    const result = parseComponent(
      component([
        slot({
          id: 'a',
          fallback: frame({
            let: { gap: 6 },
            layout: { type: 'row', gap: { $var: 'gap' } },
          }),
        }),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const found = (
      (result.component.template as unknown as Node).children as Node[]
    )[0] as Node;
    expect(found.fallback).toEqual({ type: 'frame', layout: { type: 'row', gap: 6 } });
  });
});

describe('slot box rule: the box does not depend on the default content', () => {
  const fab = (visibleOf: Node): unknown[] => [
    slot({ id: 'fab', visible: visibleOf, fallback: frame({ children: [text('fab')] }) }),
  ];

  it('visible of the slot citing a field only the fallback cites is an error, at the key', () => {
    expect(problems(fab({ $has: 'fab' }))).toEqual([
      `template.children[0].visible: ${BOX}: fab`,
    ]);
  });

  it('the same field also cited by the rest of the template is valid', () => {
    expect(problems([...fab({ $has: 'fab' }), text('fab')])).toEqual([]);
  });

  it('the visible inside the fallback is where the $has goes', () => {
    expect(
      problems([
        slot({
          id: 'fab',
          fallback: frame({ visible: { $has: 'fab' }, children: [text('fab')] }),
        }),
      ]),
    ).toEqual([]);
  });

  it('an ancestor of the slot with a visible citing it is also an error', () => {
    expect(
      problems([
        frame({
          visible: { $has: 'fab' },
          children: [slot({ id: 'fab', fallback: frame({ children: [text('fab')] }) })],
        }),
      ]),
    ).toEqual([`template.children[0].visible: ${BOX}: fab`]);
  });

  it('the root, as an ancestor, counts too', () => {
    expect(
      problems([slot({ id: 'a', fallback: frame({ children: [text('x')] }) })], 4, {
        visible: { $has: 'x' },
      }),
    ).toEqual([`template.visible: ${BOX}: x`]);
  });

  it.each([
    ['width', { $field: 'x', default: 20 }],
    ['height', { $field: 'x', default: 20 }],
    ['minWidth', { $field: 'x', default: 20 }],
    ['maxHeight', { $field: 'x', default: 20 }],
    ['anchors', { left: { $field: 'x', default: 4 } }],
    ['layout', { type: 'row', gap: { $field: 'x', default: 4 } }],
  ])(
    '%s of the slot citing a field only the fallback cites is an error',
    (key, value) => {
      expect(
        problems([
          slot({ id: 'a', [key]: value, fallback: frame({ children: [text('x')] }) }),
        ]),
      ).toEqual([`template.children[0].${key}: ${BOX}: x`]);
    },
  );

  it('a field of the box that the fallback does not cite is valid', () => {
    expect(
      problems([
        slot({
          id: 'a',
          visible: { $has: 'other' },
          fallback: frame({ children: [text('x')] }),
        }),
      ]),
    ).toEqual([]);
  });

  it('a slot without fallback has no rule to break', () => {
    expect(problems([slot({ id: 'a', visible: { $has: 'x' } })])).toEqual([]);
  });

  it('another slot fallback does not count as the rest of the template for the field', () => {
    expect(
      problems([
        slot({
          id: 'a',
          visible: { $has: 'x' },
          fallback: frame({ children: [text('x')] }),
        }),
        slot({ id: 'b', fallback: frame({ children: [text('x')] }) }),
      ]),
    ).toEqual([`template.children[0].visible: ${BOX}: x`]);
  });
});
