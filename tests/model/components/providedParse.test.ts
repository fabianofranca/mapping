// MF3: inherited color (`provide` on the slot and `$provided` on the child, format 4) — validator.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';

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

const slot = (extra: Record<string, unknown> = {}) => ({ type: 'slot', ...extra });
const text = (color: unknown) => ({ type: 'text', text: 'x', color });

describe('provide on the slot (decision 8)', () => {
  it('applies to the slot, in v4, with text, number or expression', () => {
    const provide = {
      'content-color': { $token: 'on-primary' },
      size: 12,
      label: { $field: 'ink', default: '#111' },
      mixed: { $concat: ['a', 1] },
    };
    expect(validateComponent(withChild(slot({ provide })))).toEqual([]);
  });

  it('in v1 to v3 it is only allowed with formatVersion 4, at the key path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(slot({ provide: { ink: '#fff' } }), version)),
      ).toEqual([`template.children[0].provide: ${V4}`]);
  });

  it('only the slot offers: on another node it is an unknown key', () => {
    expect(
      validateComponent(withChild({ type: 'frame', provide: { ink: '#fff' } })),
    ).toEqual(['template.children[0].provide: unknown key: provide']);
  });

  it('an empty name is an error; the value is checked at its own path', () => {
    expect(validateComponent(withChild(slot({ provide: { '': '#fff' } })))).toEqual([
      'template.children[0].provide: empty name',
    ]);
    expect(validateComponent(withChild(slot({ provide: { ink: true } })))).toEqual([
      'template.children[0].provide.ink: expected text or a number',
    ]);
    expect(validateComponent(withChild(slot({ provide: 'ink' })))).toEqual([
      'template.children[0].provide: expected an object',
    ]);
  });
});

describe('$provided on the child (decision 8)', () => {
  it('applies wherever an Expr applies, with default (which is also an Expr)', () => {
    const read = { $provided: 'content-color', default: { $token: 'on-surface' } };
    expect(validateComponent(withChild(text(read)))).toEqual([]);
    expect(validateComponent(withChild({ type: 'rect', fill: read }))).toEqual([]);
  });

  it('only applies in a color position: what changes geometry does not inherit', () => {
    const msg = '$provided is only valid where a color is expected';
    expect(
      validateComponent(
        withChild({ type: 'rect', width: { $provided: 'w', default: 10 } }),
      ),
    ).toEqual([`template.children[0].width: ${msg}`]);
    expect(
      validateComponent(
        withChild({ type: 'text', text: { $provided: 't', default: 'x' } }),
      ),
    ).toEqual([`template.children[0].text: ${msg}`]);
  });

  it('without a name (or empty) is an error', () => {
    const msg = 'expected the name of the provided color (non-empty text)';
    expect(validateComponent(withChild(text({ $provided: '' })))).toEqual([
      `template.children[0].color.$provided: ${msg}`,
    ]);
    expect(validateComponent(withChild(text({ default: '#fff' })))).not.toEqual([]);
    expect(validateComponent(withChild(text({ $provided: 3 })))).toEqual([
      `template.children[0].color.$provided: ${msg}`,
    ]);
  });

  it('an unknown key alongside is an error', () => {
    expect(validateComponent(withChild(text({ $provided: 'a', other: 1 })))).toEqual([
      'template.children[0].color.other: unknown key: other',
    ]);
  });

  it('the image src is still restricted', () => {
    expect(
      validateComponent(withChild({ type: 'image', src: { $provided: 'a' } })),
    ).toEqual([
      'template.children[0].src: src only accepts literal text or { "$field": "<field>" }',
    ]);
  });

  it('in v1 to v3 it is only allowed with formatVersion 4, at the key path', () => {
    for (const version of [1, 2, 3]) {
      const issues = validateComponent(
        withChild(text({ $provided: 'a', default: '#fff' }), version),
      );
      expect(issues).toContain(`template.children[0].color.$provided: ${V4}`);
    }
  });
});
