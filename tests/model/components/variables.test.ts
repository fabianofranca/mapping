// Component variables (formatVersion 4, stage #1504): `let` on frames and `{ "$var": … }`
// replaced on read. The component read has no `let` or `$var` and equals the hand-written one.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  MAX_EXPANDED_NODES,
  expandVariables,
  variableSyntaxPaths,
} from '../../../src/model/components/variables';

type Raw = Record<string, unknown>;

function file(template: Raw, formatVersion = 4): Raw {
  return {
    format: 'mapping-component',
    formatVersion,
    id: 'vars',
    name: 'Variables',
    size: { width: 200, height: 100 },
    template,
  };
}

function parsed(raw: Raw): ComponentFile {
  const result = parseComponent(raw);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

const rect = (extra: Raw = {}): Raw => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});
const frame = (extra: Raw = {}): Raw => ({ type: 'frame', ...extra });

describe('let and $var: reading substitutes them and returns the component without them', () => {
  it('let at the root used in a grandchild', () => {
    const withLet = file(
      frame({
        let: { pad: 12 },
        children: [frame({ children: [rect({ width: { $var: 'pad' } })] })],
      }),
    );
    const byHand = file(
      frame({ children: [frame({ children: [rect({ width: 12 })] })] }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
    expect(JSON.stringify(parsed(withLet))).not.toMatch(/"let"|\$var/);
  });

  it('let in a repeat template: $index is the one of the row of the use', () => {
    const next = { $add: [{ $field: '$index' }, 1] };
    const text = (t: unknown): Raw => ({ type: 'text', text: t, font: { size: 10 } });
    const withLet = file(
      frame({
        children: [
          {
            type: 'repeat',
            count: 3,
            template: frame({
              let: { n: next },
              children: [text({ $var: 'n' }), text({ $concat: ['#', { $var: 'n' }] })],
            }),
          },
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [
          {
            type: 'repeat',
            count: 3,
            template: frame({ children: [text(next), text({ $concat: ['#', next] })] }),
          },
        ],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('$index in a root variable is valid inside the repeat that uses it', () => {
    const next = { $add: [{ $field: '$index' }, 1] };
    const withLet = file(
      frame({
        let: { n: next },
        children: [
          {
            type: 'repeat',
            count: { $var: 'rows' },
            template: frame({
              children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
            }),
          },
        ],
      }),
    );
    // `rows` does not exist: the error is only about it ($index stays safe from a check outside the repeat)
    expect(validateComponent(withLet)).toEqual([
      'template.children[0].count: undefined variable: rows',
    ]);
    const fixed = file(
      frame({
        let: { n: next, rows: 3 },
        children: [
          {
            type: 'repeat',
            count: { $var: 'rows' },
            template: frame({
              children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
            }),
          },
        ],
      }),
    );
    expect(validateComponent(fixed)).toEqual([]);
    const read = parsed(fixed).template as unknown as { children: Raw[] };
    expect(read.children[0]?.count).toBe(3);
  });

  it('$index in a variable used outside a repeat is an error at the path of the use', () => {
    const raw = file(
      frame({
        let: { n: { $field: '$index' } },
        children: [{ type: 'text', text: { $var: 'n' }, font: { size: 10 } }],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].text.$var(n).$field: $index is only valid inside a repeat',
    ]);
  });

  it('$size inside the variable is the one of the place of the use', () => {
    const withLet = file(
      frame({
        let: { w: { $size: 'width' } },
        children: [rect({ width: { $mul: [{ $var: 'w' }, 0.5] } })],
      }),
    );
    const byHand = file(
      frame({ children: [rect({ width: { $mul: [{ $size: 'width' }, 0.5] } })] }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('the inner let hides the outer one, and the sibling sees the outer one', () => {
    const withLet = file(
      frame({
        let: { x: 1 },
        children: [
          frame({ let: { x: 2 }, children: [rect({ width: { $var: 'x' } })] }),
          rect({ width: { $var: 'x' } }),
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [frame({ children: [rect({ width: 2 })] }), rect({ width: 1 })],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('the order inside the same let is free', () => {
    const withLet = file(
      frame({
        let: { b: { $add: [{ $var: 'a' }, 1] }, a: 5 },
        children: [rect({ width: { $var: 'b' } })],
      }),
    );
    const byHand = file(frame({ children: [rect({ width: { $add: [5, 1] } })] }));
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('a name in the same let wins over the outer one', () => {
    const withLet = file(
      frame({
        let: { a: 100 },
        children: [
          frame({
            let: { a: 1, b: { $var: 'a' } },
            children: [rect({ width: { $var: 'b' } })],
          }),
        ],
      }),
    );
    const byHand = file(frame({ children: [frame({ children: [rect({ width: 1 })] })] }));
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('$var as a condition (visible and $if), color, text and repeat.count', () => {
    const withLet = file(
      frame({
        let: {
          show: { $has: 'label' },
          ink: '#112233',
          title: { $concat: ['A', { $field: 'label' }] },
          rows: 2,
        },
        children: [
          rect({ visible: { $var: 'show' }, fill: { $var: 'ink' } }),
          rect({
            fill: { $if: { $var: 'show' }, then: { $var: 'ink' }, else: '#ffffff' },
          }),
          { type: 'text', text: { $var: 'title' }, font: { size: 10 } },
          { type: 'repeat', count: { $var: 'rows' }, template: frame() },
        ],
      }),
    );
    const byHand = file(
      frame({
        children: [
          rect({ visible: { $has: 'label' }, fill: '#112233' }),
          rect({ fill: { $if: { $has: 'label' }, then: '#112233', else: '#ffffff' } }),
          {
            type: 'text',
            text: { $concat: ['A', { $field: 'label' }] },
            font: { size: 10 },
          },
          { type: 'repeat', count: 2, template: frame() },
        ],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('uses the variable in all keys of the frame itself (layout, size, anchors)', () => {
    const withLet = file(
      frame({
        let: { gap: 6 },
        layout: { type: 'row', gap: { $var: 'gap' } },
        children: [rect({ anchors: { left: { $var: 'gap' } } })],
      }),
    );
    const byHand = file(
      frame({
        layout: { type: 'row', gap: 6 },
        children: [rect({ anchors: { left: 6 } })],
      }),
    );
    expect(parsed(withLet)).toEqual(parsed(byHand));
  });

  it('the __proto__ key of the file remains an unknown key after substitution', () => {
    const raw = file(
      frame({
        let: { w: 3 },
        children: [
          JSON.parse('{"type":"rect","width":{"$var":"w"},"height":4,"__proto__":1}'),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].__proto__: unknown key: __proto__',
    ]);
  });

  it('without let or $var returns the same object', () => {
    const raw = file(frame({ children: [rect()] }));
    const result = parseComponent(raw);
    expect(result.ok && result.component).toBe(raw);
  });

  it('an unused variable produces no error or warning', () => {
    const raw = file(
      frame({ let: { unused: { $mul: 'broken' }, ghost: { $var: 'nobody' } } }),
    );
    const result = parseComponent(raw);
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('the content of the variable is not shared between uses', () => {
    const raw = file(
      frame({
        let: { w: { $add: [1, 2] } },
        children: [rect({ width: { $var: 'w' } }), rect({ width: { $var: 'w' } })],
      }),
    );
    const kids = (parsed(raw).template as unknown as { children: Raw[] }).children;
    expect(kids[0]?.width).toEqual(kids[1]?.width);
    expect(kids[0]?.width).not.toBe(kids[1]?.width);
  });
});

describe('let and $var: errors', () => {
  it('name outside [a-z][a-zA-Z0-9]*', () => {
    for (const bad of ['Gap', '1gap', 'gap-1', 'a_b', '$x'])
      expect(validateComponent(file(frame({ let: { [bad]: 1 } })))).toEqual([
        `template.let.${bad}: expected a variable name ([a-z][a-zA-Z0-9]*)`,
      ]);
    expect(validateComponent(file(frame({ let: { gap1A: 1, g: 2 } })))).toEqual([]);
  });

  it('the $var name has the same pattern and is text', () => {
    const at = (name: unknown) =>
      validateComponent(file(frame({ children: [rect({ width: { $var: name } })] })));
    expect(at('Gap')).toEqual([
      'template.children[0].width.$var: expected a variable name ([a-z][a-zA-Z0-9]*)',
    ]);
    expect(at(3)).toEqual([
      'template.children[0].width.$var: expected a variable name ([a-z][a-zA-Z0-9]*)',
    ]);
  });

  it('let must be an object', () => {
    expect(validateComponent(file(frame({ let: [1] })))).toEqual([
      'template.let: expected an object',
    ]);
  });

  it('undefined variable, at the path of the use', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'gap' } })] }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width: undefined variable: gap',
    ]);
  });

  it('a sibling variable does not count (the scope is the frame and its descendants)', () => {
    const raw = file(
      frame({
        children: [
          frame({ let: { w: 4 } }),
          frame({ children: [rect({ width: { $var: 'w' } })] }),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[1].children[0].width: undefined variable: w',
    ]);
  });

  it('cycle a → b → a, at the path of the let', () => {
    const raw = file(
      frame({
        let: { a: { $add: [{ $var: 'b' }, 1] }, b: { $mul: [{ $var: 'a' }, 2] } },
        children: [rect({ width: { $var: 'a' } })],
      }),
    );
    expect(validateComponent(raw)).toEqual(['template.let.a: variable cycle: a → b → a']);
  });

  it('a variable that uses itself is a cycle, even when hiding the outer one', () => {
    const raw = file(
      frame({
        let: { a: 1 },
        children: [
          frame({
            let: { a: { $add: [{ $var: 'a' }, 1] } },
            children: [rect({ width: { $var: 'a' } })],
          }),
        ],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].let.a: variable cycle: a → a',
    ]);
  });

  it('$var with another key alongside', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'a', default: 2 } })] }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width.default: unknown key: default',
    ]);
  });

  it('let on a rect is an unknown key', () => {
    const raw = file(frame({ children: [rect({ let: { a: 1 } })] }));
    expect(validateComponent(raw)).toEqual([
      'template.children[0].let: unknown key: let',
    ]);
  });

  it('let and $var in formatVersion 3: only allowed with formatVersion 4', () => {
    const raw = file(
      frame({ let: { a: 1 }, children: [rect({ width: { $var: 'a' } })] }),
      3,
    );
    expect(validateComponent(raw)).toEqual([
      'template.let: only allowed with formatVersion 4',
      'template.children[0].width: only allowed with formatVersion 4',
    ]);
  });

  it('an expression variable in version 3 does not repeat the error of the same path', () => {
    const raw = file(
      frame({ let: { w: { $add: [1, 2] } }, children: [rect({ width: { $var: 'w' } })] }),
      3,
    );
    const errors = validateComponent(raw);
    expect(errors).toEqual([...new Set(errors)]);
    expect(errors).toContain(
      'template.children[0].width: only allowed with formatVersion 4',
    );
  });

  it('the type error inside the variable comes out at the path of the use, with $var(<name>)', () => {
    const inner = file(
      frame({
        let: { gap: { $add: ['wide', 1] } },
        children: [rect({ width: { $var: 'gap' } })],
      }),
    );
    expect(validateComponent(inner)).toEqual([
      'template.children[0].width.$var(gap).$add[0]: must be a number',
    ]);
    const direct = file(
      frame({
        let: { gap: 'wide' },
        children: [rect({ width: { $add: [{ $var: 'gap' }, 1] } })],
      }),
    );
    expect(validateComponent(direct)).toEqual([
      'template.children[0].width.$add[0].$var(gap): must be a number',
    ]);
  });

  it('variables inside variables accumulate the $var(<name>) in the path', () => {
    const raw = file(
      frame({
        let: { outer: { $add: [{ $var: 'inner' }, 1] }, inner: 'text' },
        children: [rect({ width: { $var: 'outer' } })],
      }),
    );
    expect(validateComponent(raw)).toEqual([
      'template.children[0].width.$var(outer).$add[0].$var(inner): must be a number',
    ]);
  });

  it('the same variable used in two places errors at both paths', () => {
    const raw = file(
      frame({
        let: { w: 'x' },
        children: [rect({ width: { $var: 'w' } }), rect({ height: { $var: 'w' } })],
      }),
    );
    const errors = validateComponent(raw);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^template\.children\[0\]\.width\.\$var\(w\): /);
    expect(errors[1]).toMatch(/^template\.children\[1\]\.height\.\$var\(w\): /);
  });

  it('the expansion exceeds the node ceiling: error at the root', () => {
    const lets: Raw = { v0: 1 };
    for (let i = 1; i <= 20; i++)
      lets[`v${i}`] = { $add: [{ $var: `v${i - 1}` }, { $var: `v${i - 1}` }] };
    const raw = file(frame({ let: lets, children: [rect({ width: { $var: 'v20' } })] }));
    expect(validateComponent(raw)).toEqual([
      `variable expansion too large (more than ${MAX_EXPANDED_NODES} nodes)`,
    ]);
  });

  it('a large component with a small variable does not exceed the ceiling (only what the substitution creates counts)', () => {
    const many = Array.from({ length: 30000 }, () => rect({ fill: '#112233' }));
    const raw = file(
      frame({ let: { w: 3 }, children: [...many, rect({ width: { $var: 'w' } })] }),
    );
    expect(validateComponent(raw)).toEqual([]);
  });

  it('a very long chain of variables is a size error, without overflowing the stack', () => {
    const lets: Raw = {};
    for (let i = 0; i < 20000; i++) lets[`a${i}`] = { $var: `a${i + 1}` };
    lets.a20000 = 1;
    const raw = file(frame({ let: lets, children: [rect({ width: { $var: 'a0' } })] }));
    expect(validateComponent(raw)).toEqual([
      `variable expansion too large (more than ${MAX_EXPANDED_NODES} nodes)`,
    ]);
  });

  it('the font family warning of a variable carries the $var(<name>) in the path', () => {
    const raw = file(
      frame({
        let: { fam: '"Roboto' },
        children: [
          {
            type: 'text',
            text: 'x',
            font: { size: 10, family: { $var: 'fam' } },
          },
        ],
      }),
    );
    const result = parseComponent(raw);
    expect(result.ok && result.warnings.map((w) => w.path)).toEqual([
      'template.children[0].font.family.$var(fam)',
    ]);
  });

  it('the errors of the rest of the file still come out when the expansion fails', () => {
    const raw = {
      ...file(frame({ children: [rect({ width: { $var: 'x' } })] })),
      id: '',
    };
    expect(validateComponent(raw)).toEqual([
      'id: expected text matching ^[a-z0-9][a-z0-9-_]*$',
      'template.children[0].width: undefined variable: x',
    ]);
  });
});

describe('expandVariables', () => {
  it('returns the same template when there is no let or $var', () => {
    const template = frame({ children: [rect()] });
    const out = expandVariables(template);
    expect(out.value).toBe(template);
    expect(out.issues).toEqual([]);
    expect(out.rewrite('template.children[0]')).toBe('template.children[0]');
  });

  it('variableSyntaxPaths finds the let of frames and every $var, including in an unused variable', () => {
    const template = frame({
      let: { a: { $var: 'b' } },
      children: [rect({ width: { $var: 'a' } })],
    });
    expect(variableSyntaxPaths(template)).toEqual([
      'template.let',
      'template.let.a',
      'template.children[0].width',
    ]);
  });
});
