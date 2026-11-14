// Format 4, phase CF2: size limits, expression in size and layout, repeat.distribute.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';

function component(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

/** A root frame with a child of the given type, already with the extra keys. */
function withChild(child: Record<string, unknown>, version = 4): unknown {
  return component({ type: 'frame', children: [child] }, version);
}

const rect = (extra: Record<string, unknown>): Record<string, unknown> => ({
  type: 'rect',
  ...extra,
});

describe('minWidth, maxWidth, minHeight and maxHeight', () => {
  it('apply to any node, including repeat, with a number or an expression', () => {
    const limits = {
      minWidth: 10,
      maxWidth: { $field: 'w', default: 300 },
      minHeight: { $if: { $has: 'x' }, then: 5, else: 0 },
      maxHeight: 80,
    };
    expect(validateComponent(withChild(rect(limits)))).toEqual([]);
    expect(
      validateComponent(
        withChild({
          type: 'repeat',
          field: 'rows',
          ...limits,
          template: { type: 'frame' },
        }),
      ),
    ).toEqual([]);
  });

  it('a negative or non-number value fails at the key path', () => {
    expect(validateComponent(withChild(rect({ minWidth: -1, maxHeight: 'x' })))).toEqual([
      'template.children[0].minWidth: expected a number greater than or equal to 0',
      'template.children[0].maxHeight: expected a number greater than or equal to 0',
    ]);
  });

  it('min greater than max, with both literals, fails at the min path', () => {
    expect(validateComponent(withChild(rect({ minWidth: 200, maxWidth: 100 })))).toEqual([
      'template.children[0].minWidth: cannot be greater than maxWidth',
    ]);
    expect(validateComponent(withChild(rect({ minHeight: 9, maxHeight: 3 })))).toEqual([
      'template.children[0].minHeight: cannot be greater than maxHeight',
    ]);
  });

  it('min equal to max, or with an expression, does not fail', () => {
    expect(validateComponent(withChild(rect({ minWidth: 100, maxWidth: 100 })))).toEqual(
      [],
    );
    expect(
      validateComponent(withChild(rect({ minWidth: 200, maxWidth: { $field: 'm' } }))),
    ).toEqual([]);
  });

  it('in formatVersion 3 they give the version error at the key path', () => {
    expect(validateComponent(withChild(rect({ minWidth: 1, maxHeight: 2 }), 3))).toEqual([
      `template.children[0].minWidth: ${V4}`,
      `template.children[0].maxHeight: ${V4}`,
    ]);
  });
});

describe('repeat.distribute', () => {
  const repeat = (distribute: unknown): Record<string, unknown> => ({
    type: 'repeat',
    field: 'rows',
    distribute,
    template: { type: 'frame' },
  });

  it('accepts none and fill; rejects another value and an expression', () => {
    expect(validateComponent(withChild(repeat('none')))).toEqual([]);
    expect(validateComponent(withChild(repeat('fill')))).toEqual([]);
    expect(validateComponent(withChild(repeat('spread')))).toEqual([
      'template.children[0].distribute: expected one of: none, fill',
    ]);
    expect(validateComponent(withChild(repeat({ $field: 'd' })))).toEqual([
      'template.children[0].distribute: expected one of: none, fill',
    ]);
  });

  it('in formatVersion 3 it gives the version error', () => {
    expect(validateComponent(withChild(repeat('fill'), 3))).toEqual([
      `template.children[0].distribute: ${V4}`,
    ]);
  });

  it('on a node that is not a repeat it is still an unknown key', () => {
    expect(validateComponent(withChild(rect({ distribute: 'fill' })))).toContain(
      'template.children[0].distribute: unknown key: distribute',
    );
  });
});

describe('expression in width and height', () => {
  it('accepts an expression whose branches are valid sizes', () => {
    const width = {
      $switch: 'size',
      cases: { s: 40, m: '50%', l: 'fill' },
      default: 'hug',
    };
    expect(
      validateComponent(withChild(rect({ width, height: { $field: 'h', default: 20 } }))),
    ).toEqual([]);
  });

  it('checks the literal inside the expression', () => {
    expect(
      validateComponent(withChild(rect({ width: { $field: 'w', default: -3 } }))),
    ).toEqual([
      'template.children[0].width.default: expected a number greater than or equal to 0, "fill", "hug", "min-content", "max-content" or "<number>%"',
    ]);
    expect(
      validateComponent(
        withChild(rect({ height: { $if: { $has: 'x' }, then: 'wide', else: 10 } })),
      ),
    ).toEqual([
      'template.children[0].height.then: expected a number greater than or equal to 0, "fill", "hug", "min-content", "max-content" or "<number>%"',
    ]);
  });

  it('the image node rejects hug, also in an expression branch', () => {
    const image = (extra: Record<string, unknown>): Record<string, unknown> => ({
      type: 'image',
      src: { $field: 'photo' },
      ...extra,
    });
    const hug =
      'the image node does not accept hug: the layout does not depend on the downloaded image';
    expect(validateComponent(withChild(image({ width: 'hug' }), 3))).toEqual([
      `template.children[0].width: ${hug}`,
    ]);
    expect(
      validateComponent(
        withChild(image({ height: { $if: { $has: 'x' }, then: 'hug', else: 10 } })),
      ),
    ).toEqual([`template.children[0].height.then: ${hug}`]);
    expect(
      validateComponent(withChild(image({ width: { $field: 'w', default: 'fill' } }))),
    ).toEqual([]);
  });
});

describe('expression in layout.type, align and justify', () => {
  const frameWith = (layout: unknown, version = 4): unknown =>
    component({ type: 'frame', layout }, version);

  it('layout.type by expression accepts gap, padding, align and justify', () => {
    const layout = {
      type: { $switch: 'dir', cases: { h: 'row', v: 'column' }, default: 'none' },
      gap: 8,
      padding: [4, 8],
      align: { $field: 'a', default: 'center' },
      justify: { $if: { $has: 'x' }, then: 'space-between', else: 'start' },
    };
    expect(validateComponent(frameWith(layout))).toEqual([]);
  });

  it('the same applies in the layout of a slot', () => {
    const layout = {
      type: { $field: 'dir', default: 'row' },
      align: { $field: 'a', default: 'end' },
    };
    expect(
      validateComponent(
        component({ type: 'frame', children: [{ type: 'slot', layout }] }),
      ),
    ).toEqual([]);
  });

  it('checks the literals of the branches', () => {
    expect(
      validateComponent(frameWith({ type: { $field: 'd', default: 'diagonal' } })),
    ).toEqual([
      'template.layout.type.default: expected "none", "row", "column" or "grid"',
    ]);
    expect(
      validateComponent(
        frameWith({ type: 'row', align: { $field: 'a', default: 'middle' } }),
      ),
    ).toEqual([
      'template.layout.align.default: expected one of: start, center, end, stretch, baseline',
    ]);
    expect(
      validateComponent(
        frameWith({ type: 'row', justify: { $field: 'j', default: 'around' } }),
      ),
    ).toEqual([
      'template.layout.justify.default: expected one of: start, center, end, space-between, space-around, space-evenly',
    ]);
  });

  it('an invalid literal in type keeps the usual message', () => {
    expect(validateComponent(frameWith({ type: 'diagonal' }))).toEqual([
      'template.layout.type: expected "none", "row", "column" or "grid"',
    ]);
  });

  it('with literal type none, only type applies', () => {
    expect(validateComponent(frameWith({ type: 'none', gap: 4 }))).toEqual([
      'template.layout.gap: unknown key: gap',
    ]);
  });
});

describe('expression in the five keys before formatVersion 4', () => {
  it('v3 with minWidth, distribute and width by expression gives exactly three errors', () => {
    const doc = component(
      {
        type: 'frame',
        children: [
          rect({ minWidth: 10 }),
          {
            type: 'repeat',
            field: 'rows',
            distribute: 'fill',
            template: { type: 'frame' },
          },
          rect({ width: { $field: 'w' } }),
        ],
      },
      3,
    );
    expect(validateComponent(doc)).toEqual([
      `template.children[0].minWidth: ${V4}`,
      `template.children[1].distribute: ${V4}`,
      `template.children[2].width: ${V4}`,
    ]);
  });

  it('height and layout.type/align/justify by expression too, in slot and in repeat', () => {
    const layout = {
      type: { $field: 'd', default: 'row' },
      align: { $field: 'a', default: 'start' },
      justify: { $field: 'j', default: 'start' },
    };
    const doc = component(
      {
        type: 'frame',
        layout,
        children: [
          rect({ height: { $field: 'h', default: 3 } }),
          { type: 'slot', layout },
          {
            type: 'repeat',
            field: 'rows',
            template: { type: 'frame', width: { $field: 'w', default: 5 } },
          },
        ],
      },
      2,
    );
    expect(validateComponent(doc)).toEqual([
      `template.layout.type: ${V4}`,
      `template.layout.align: ${V4}`,
      `template.layout.justify: ${V4}`,
      `template.children[0].height: ${V4}`,
      `template.children[1].layout.type: ${V4}`,
      `template.children[1].layout.align: ${V4}`,
      `template.children[1].layout.justify: ${V4}`,
      `template.children[2].template.width: ${V4}`,
    ]);
  });

  it('literals in those keys remain valid in all versions', () => {
    const doc = component(
      {
        type: 'frame',
        width: 'fill',
        layout: { type: 'row', align: 'center', justify: 'end' },
        children: [rect({ width: '50%', height: 'hug' })],
      },
      1,
    );
    expect(validateComponent(doc)).toEqual([]);
  });
});

describe('v4 component with everything together', () => {
  it('passes', () => {
    const doc = component({
      type: 'frame',
      width: { $field: 'w', default: 'fill' },
      minHeight: 40,
      maxHeight: { $field: 'mh', default: 400 },
      layout: {
        type: { $field: 'dir', default: 'column' },
        gap: 8,
        align: { $field: 'a', default: 'stretch' },
        justify: { $field: 'j', default: 'start' },
      },
      children: [
        rect({
          minWidth: 10,
          maxWidth: 100,
          width: 'fill',
          height: { $field: 'h', default: 20 },
        }),
        {
          type: 'repeat',
          field: 'rows',
          direction: 'column',
          distribute: 'fill',
          minHeight: 20,
          template: { type: 'frame', height: 'fill', maxWidth: 300 },
        },
      ],
    });
    expect(validateComponent(doc)).toEqual([]);
  });
});
