// L3 (#1078, decisions 10 to 16): validation of `layout.type: "grid"`, `span`, `weight` and `repeat.layout`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Json = Record<string, unknown>;
const V4 = 'only allowed with formatVersion 4';
const TRACKS =
  'layout: give exactly one of columns, minColumnWidth, rows and minRowHeight';

function component(template: unknown, version = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

const rect = (extra: Json = {}): Json => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

function host(layout: unknown, children: Json[] = [], version = 4): Json {
  return component({ type: 'frame', layout, children }, version);
}

const issues = (doc: Json): string[] => validateComponent(doc);

describe('layout grid: type and keys', () => {
  it('accepts a literal grid with one track and the grid keys', () => {
    const layout = {
      type: 'grid',
      columns: 3,
      gap: 4,
      padding: 2,
      align: 'center',
      justify: 'stretch',
      reverse: true,
      lineGap: 8,
    };
    expect(issues(host(layout))).toEqual([]);
    for (const track of [
      { rows: 2 },
      { minColumnWidth: 80.5 },
      { minRowHeight: 40 },
      { columns: { $field: 'n', default: 2 } },
    ])
      expect(issues(host({ type: 'grid', ...track }))).toEqual([]);
  });

  it('the invalid type cites grid in the message', () => {
    expect(issues(host({ type: 'diagonal' }))).toEqual([
      'template.layout.type: expected "none", "row", "column" or "grid"',
    ]);
  });

  it('requires exactly one track', () => {
    expect(issues(host({ type: 'grid' }))).toEqual([`template.layout: ${TRACKS}`]);
    expect(issues(host({ type: 'grid', columns: 2, rows: 2 }))).toEqual([
      `template.layout: ${TRACKS}`,
    ]);
    expect(issues(host({ type: 'grid', columns: 2, minColumnWidth: 40 }))).toEqual([
      `template.layout: ${TRACKS}`,
    ]);
  });

  it('checks the values of the tracks', () => {
    expect(issues(host({ type: 'grid', columns: 0 }))).toEqual([
      'template.layout.columns: expected an integer greater than or equal to 1',
    ]);
    expect(issues(host({ type: 'grid', rows: 1.5 }))).toEqual([
      'template.layout.rows: expected an integer greater than or equal to 1',
    ]);
    expect(issues(host({ type: 'grid', minColumnWidth: 0 }))).toEqual([
      'template.layout.minColumnWidth: expected a number greater than 0',
    ]);
    expect(issues(host({ type: 'grid', minRowHeight: -3 }))).toEqual([
      'template.layout.minRowHeight: expected a number greater than 0',
    ]);
  });

  it('wrap, maxPerLine and maxLines do not apply in the grid', () => {
    expect(
      issues(
        host({ type: 'grid', columns: 2, wrap: 'wrap', maxPerLine: 2, maxLines: 3 }),
      ),
    ).toEqual([
      'template.layout.wrap: not valid in a grid layout',
      'template.layout.maxPerLine: not valid in a grid layout',
      'template.layout.maxLines: not valid in a grid layout',
    ]);
  });

  it('align and justify of the grid: start, center, end and stretch', () => {
    expect(issues(host({ type: 'grid', columns: 2, align: 'baseline' }))).toEqual([
      'template.layout.align: expected one of: start, center, end, stretch',
    ]);
    expect(issues(host({ type: 'grid', columns: 2, justify: 'space-between' }))).toEqual([
      'template.layout.justify: expected one of: start, center, end, stretch',
    ]);
  });

  it('track key outside a literal layout grid', () => {
    expect(issues(host({ type: 'row', columns: 2 }))).toEqual([
      'template.layout.columns: only valid in a grid layout',
    ]);
    expect(issues(host({ type: 'column', minRowHeight: 2 }))).toEqual([
      'template.layout.minRowHeight: only valid in a grid layout',
    ]);
  });

  it('with a type by expression it accepts the track keys', () => {
    const type = { $field: 't', default: 'row' };
    expect(issues(host({ type, columns: 2 }))).toEqual([]);
    expect(issues(host({ type: { $field: 't', default: 'grid' }, rows: 2 }))).toEqual([]);
  });

  it('the slot accepts layout grid with the same rules', () => {
    const doc = (layout: Json): Json =>
      component({ type: 'frame', children: [{ type: 'slot', layout }] });
    expect(issues(doc({ type: 'grid', columns: 2 }))).toEqual([]);
    expect(issues(doc({ type: 'grid' }))).toEqual([
      `template.children[0].layout: ${TRACKS}`,
    ]);
  });

  it('in a formatVersion 1 to 3 grid and the tracks are v4 only', () => {
    for (const version of [1, 2, 3]) {
      expect(issues(host({ type: 'grid', columns: 2 }, [], version))).toContain(
        `template.layout.type: ${V4}`,
      );
      expect(issues(host({ type: 'grid', columns: 2 }, [], version))).toContain(
        `template.layout.columns: ${V4}`,
      );
    }
    expect(issues(host({ type: 'grid', minRowHeight: 2 }, [], 3))).toContain(
      `template.layout.minRowHeight: ${V4}`,
    );
  });
});

describe('span', () => {
  const grid = { type: 'grid', columns: 3 };

  it('is valid on a direct child of a grid, literal or expression', () => {
    expect(
      issues(
        host(grid, [rect({ span: 2 }), rect({ span: { $field: 's', default: 1 } })]),
      ),
    ).toEqual([]);
  });

  it('a literal outside a grid is an error on the child path', () => {
    expect(issues(host({ type: 'row' }, [rect({ span: 2 })]))).toEqual([
      'template.children[0].span: span: only valid on a child of a grid layout',
    ]);
    expect(issues(component({ type: 'frame', children: [rect({ span: 2 })] }))).toEqual([
      'template.children[0].span: span: only valid on a child of a grid layout',
    ]);
  });

  it('with the parent type by expression, or an expression in span, it accepts', () => {
    const type = { $field: 't', default: 'grid' };
    expect(issues(host({ type, columns: 2 }, [rect({ span: 2 })]))).toEqual([]);
    expect(
      issues(host({ type: 'row' }, [rect({ span: { $field: 's', default: 2 } })])),
    ).toEqual([]);
  });

  it('an integer greater than or equal to 1', () => {
    expect(issues(host(grid, [rect({ span: 0 })]))).toEqual([
      'template.children[0].span: expected an integer greater than or equal to 1',
    ]);
    expect(issues(host(grid, [rect({ span: 1.5 })]))).toEqual([
      'template.children[0].span: expected an integer greater than or equal to 1',
    ]);
  });

  it('the repeat template is a child of the repeat.layout grid', () => {
    const repeat = (layout: Json): Json => ({
      type: 'repeat',
      count: 3,
      layout,
      template: { type: 'frame', span: 2 },
    });
    expect(
      issues(
        component({ type: 'frame', children: [repeat({ type: 'grid', columns: 2 })] }),
      ),
    ).toEqual([]);
    expect(
      issues(component({ type: 'frame', children: [repeat({ type: 'row' })] })),
    ).toEqual([
      'template.children[0].template.span: span: only valid on a child of a grid layout',
    ]);
  });

  it('in a formatVersion 1 to 3 span is v4', () => {
    expect(issues(host({ type: 'row' }, [rect({ span: 2 })], 3))).toContain(
      `template.children[0].span: ${V4}`,
    );
  });
});

describe('weight', () => {
  const WEIGHT = 'weight: only valid on a fill child on the main axis of a row or column';

  it('is valid on a fill child on the main axis (absent, "fill" or expression)', () => {
    const fillRow = [
      { type: 'rect', weight: 2 },
      { type: 'rect', width: 'fill', weight: 0.5 },
      { type: 'rect', width: { $field: 'w', default: 10 }, weight: 1 },
      { type: 'rect', weight: { $field: 'p', default: 2 } },
    ];
    expect(issues(host({ type: 'row' }, fillRow))).toEqual([]);
    expect(
      issues(host({ type: 'column' }, [{ type: 'rect', height: 'fill', weight: 3 }])),
    ).toEqual([]);
  });

  it('a hug, px or % child is an error on the weight path', () => {
    for (const width of ['hug', 40, '50%'])
      expect(issues(host({ type: 'row' }, [rect({ width, weight: 2 })]))).toEqual([
        `template.children[0].weight: ${WEIGHT}`,
      ]);
  });

  it('the main axis of the row is the width and that of the column is the height', () => {
    expect(
      issues(
        host({ type: 'row' }, [
          { type: 'rect', width: 'hug', height: 'fill', weight: 1 },
        ]),
      ),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
    expect(
      issues(
        host({ type: 'column' }, [
          { type: 'rect', width: 'fill', height: 20, weight: 1 },
        ]),
      ),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
  });

  it('text without a size is hug: error; with fill it is valid', () => {
    expect(
      issues(host({ type: 'row' }, [{ type: 'text', text: 'a', weight: 1 }])),
    ).toEqual([`template.children[0].weight: ${WEIGHT}`]);
    expect(
      issues(
        host({ type: 'row' }, [{ type: 'text', text: 'a', width: 'fill', weight: 1 }]),
      ),
    ).toEqual([]);
  });

  it('parent none, without layout or grid is an error; a parent with a type by expression accepts', () => {
    const child = [{ type: 'rect', weight: 1 }];
    expect(issues(host({ type: 'none' }, child))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(component({ type: 'frame', children: child }))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(host({ type: 'grid', columns: 2 }, child))).toEqual([
      `template.children[0].weight: ${WEIGHT}`,
    ]);
    expect(issues(host({ type: { $field: 't', default: 'row' } }, child))).toEqual([]);
  });

  it('a number greater than 0', () => {
    expect(issues(host({ type: 'row' }, [{ type: 'rect', weight: 0 }]))).toEqual([
      'template.children[0].weight: expected a number greater than 0',
    ]);
  });

  it('the repeat template follows the type of the generated frame', () => {
    const repeat = (extra: Json): Json => ({
      type: 'repeat',
      count: 3,
      ...extra,
      template: { type: 'frame', weight: 2 },
    });
    expect(
      issues(component({ type: 'frame', children: [repeat({ direction: 'row' })] })),
    ).toEqual([]);
    expect(
      issues(
        component({ type: 'frame', children: [repeat({ layout: { type: 'column' } })] }),
      ),
    ).toEqual([]);
    expect(
      issues(
        component({
          type: 'frame',
          children: [repeat({ layout: { type: 'grid', columns: 2 } })],
        }),
      ),
    ).toEqual([`template.children[0].template.weight: ${WEIGHT}`]);
  });

  it('in a formatVersion 1 to 3 weight is v4', () => {
    expect(issues(host({ type: 'row' }, [{ type: 'rect', weight: 2 }], 3))).toContain(
      `template.children[0].weight: ${V4}`,
    );
  });
});

describe('repeat.layout', () => {
  const repeat = (extra: Json, version = 4): Json =>
    component(
      {
        type: 'frame',
        children: [{ type: 'repeat', count: 3, template: { type: 'frame' }, ...extra }],
      },
      version,
    );

  it('accepts a complete layout and checks the layout rules', () => {
    expect(
      issues(repeat({ layout: { type: 'grid', minColumnWidth: 60, gap: 4 } })),
    ).toEqual([]);
    expect(issues(repeat({ layout: { type: 'row', wrap: 'wrap', lineGap: 2 } }))).toEqual(
      [],
    );
    expect(issues(repeat({ layout: { type: 'grid' } }))).toEqual([
      `template.children[0].layout: ${TRACKS}`,
    ]);
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2, wrap: 'wrap' } })),
    ).toEqual(['template.children[0].layout.wrap: not valid in a grid layout']);
  });

  it('does not combine with direction or gap', () => {
    const layout = { type: 'grid', columns: 2 };
    expect(issues(repeat({ layout, direction: 'row' }))).toEqual([
      'template.children[0]: repeat.layout: does not combine with direction or gap',
    ]);
    expect(issues(repeat({ layout, gap: 4 }))).toEqual([
      'template.children[0]: repeat.layout: does not combine with direction or gap',
    ]);
  });

  it('the loose wrap keys of the repeat do not combine with repeat.layout (code-review)', () => {
    expect(
      issues(repeat({ layout: { type: 'column' }, wrap: 'wrap', lineGap: 2 })),
    ).toEqual([
      'template.children[0].wrap: repeat.layout: the key goes inside layout (wrap)',
      'template.children[0].lineGap: repeat.layout: the key goes inside layout (lineGap)',
    ]);
  });

  it('repeat.layout with type none does not apply (code-review)', () => {
    expect(issues(repeat({ layout: { type: 'none' } }))).toEqual([
      'template.children[0].layout.type: repeat.layout: use row, column or grid',
    ]);
  });

  it('distribute fill does not apply with layout grid', () => {
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2 }, distribute: 'fill' })),
    ).toEqual([
      'template.children[0].distribute: distribute: not valid with a grid layout',
    ]);
    expect(issues(repeat({ layout: { type: 'row' }, distribute: 'fill' }))).toEqual([]);
    expect(
      issues(repeat({ layout: { type: 'grid', columns: 2 }, distribute: 'none' })),
    ).toEqual([]);
  });

  it('in a formatVersion 1 to 3 repeat.layout is v4', () => {
    expect(issues(repeat({ layout: { type: 'row' }, field: undefined }, 3))).toContain(
      `template.children[0].layout: ${V4}`,
    );
  });
});

describe('docs/component.schema.json', () => {
  const ok = (doc: Json): void => expect(checkSchema(schema, doc)).toEqual([]);
  const bad = (doc: Json): void =>
    expect(checkSchema(schema, doc).length).toBeGreaterThan(0);

  it('accepts the grid, span, weight and repeat.layout', () => {
    ok(
      host({
        type: 'grid',
        columns: 3,
        gap: 4,
        lineGap: 2,
        align: 'center',
        justify: 'stretch',
      }),
    );
    ok(
      host({ type: 'grid', minRowHeight: 30.5 }, [
        rect({ span: 2 }),
        rect({ span: { $field: 's', default: 1 } }),
      ]),
    );
    ok(
      host({ type: 'row' }, [
        { type: 'rect', weight: 2.5 },
        { type: 'text', text: 'a', weight: 1 },
      ]),
    );
    ok(host({ type: { $field: 't', default: 'grid' }, columns: 2 }));
    ok(
      component({
        type: 'frame',
        children: [
          {
            type: 'repeat',
            count: 3,
            layout: { type: 'grid', columns: 2 },
            template: { type: 'frame', span: 2, weight: 1 },
          },
        ],
      }),
    );
  });

  it('rejects a loose key, a value outside the type and align outside the grid set', () => {
    bad(host({ type: 'grid', columns: 0 }));
    bad(host({ type: 'grid', minColumnWidth: 0 }));
    bad(host({ type: 'grid', columns: 2, wrap: 'wrap' }));
    bad(host({ type: 'grid', columns: 2, align: 'baseline' }));
    bad(host({ type: 'grid', columns: 2, justify: 'space-between' }));
    bad(host({ type: 'row' }, [{ type: 'rect', weight: 0 }]));
    bad(host({ type: 'grid', columns: 2 }, [rect({ span: 0 })]));
    bad(host({ type: 'grid', columns: 2 }, [rect({ span: 1.5 })]));
  });
});
