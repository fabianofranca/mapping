// Components lab: validation of the `mapping-component` file.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  collectFieldKeys,
  parseComponent,
  parseComponentText,
  validateComponent,
} from '../../../src/model/components/parseComponent';

/** Validates and returns the typed file; fails the test if the result is not ok. */
function parsedOf(input: unknown): ComponentFile {
  const result = parseComponent(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.component;
}

/** A realistic button: optional icon, label bound to the field, color per variant, conditional border. */
function button(): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'button',
    name: 'Button',
    description: 'Button with an optional icon.',
    size: { width: 120, height: 40 },
    minSize: { width: 60, height: 32 },
    preview: { label: 'Save', variant: 'primary', icon: 'yes', count: 3, note: null },
    template: {
      type: 'frame',
      name: 'Root',
      clip: true,
      layout: {
        type: 'row',
        gap: 8,
        padding: [8, 16],
        align: 'center',
        justify: 'center',
      },
      cornerRadius: 8,
      fill: {
        $switch: 'variant',
        cases: {
          primary: '#0a84ff',
          danger: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#ff453a' },
              { offset: 1, color: '#d70015' },
            ],
          },
        },
        default: '#e5e5ea',
      },
      stroke: {
        color: { $if: { $eq: ['variant', 'secondary'] }, then: '#8e8e93', else: 'none' },
        width: 1,
        align: 'inside',
        dash: [4, 2],
      },
      shadow: { color: '#00000033', x: 0, y: 2, blur: 4 },
      children: [
        {
          type: 'path',
          name: 'Icon',
          visible: { $field: 'icon' },
          width: 16,
          height: 16,
          d: 'M0 0L10 10',
          viewBox: [16, 16],
          fillRule: 'evenodd',
          fill: '#ffffff',
        },
        {
          type: 'text',
          width: 'hug',
          height: '100%',
          opacity: { $if: { $field: 'disabled' }, then: 0.4, else: 1 },
          text: {
            $concat: [{ $field: 'label', default: 'Button' }, ' ', { $field: 'count' }],
          },
          font: {
            family: 'Inter',
            size: 14,
            weight: { $switch: 'variant', cases: { primary: 600 }, default: 400 },
            italic: false,
            lineHeight: 1.2,
            letterSpacing: 0,
            align: 'center',
            verticalAlign: { $field: 'valign', default: 'middle' },
            decoration: 'none',
          },
          color: '#ffffff',
        },
        {
          type: 'frame',
          layout: { type: 'none' },
          width: 'fill',
          visible: {
            $if: { $and: [{ $has: 'badge' }, { $not: { $field: 'hidden' } }] },
            then: true,
            else: false,
          },
          children: [
            {
              type: 'ellipse',
              anchors: { right: 0, top: 0 },
              width: 8,
              height: 8,
              fill: '#ff3b30',
            },
            {
              type: 'rect',
              anchors: { centerX: true, centerY: true },
              cornerRadius: [1, 2, 3, 4],
            },
            { type: 'slot', label: { $field: 'slotLabel', default: 'Content' } },
          ],
        },
      ],
    },
  };
}

type Mutate = (c: Record<string, any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Applies the mutation to a valid button and returns the problems. */
function problemsAfter(mutate: Mutate): string[] {
  const c = button();
  mutate(c);
  return validateComponent(c);
}

/** Asserts that a problem exists exactly at the given path, with the message fragment. */
function expectProblem(problems: string[], path: string, fragment: string): void {
  const found = problems.find((p) => p.startsWith(`${path}: `));
  expect(found, `problems: ${JSON.stringify(problems)}`).toBeDefined();
  expect(found).toContain(fragment);
}

describe('parseComponent: valid component', () => {
  it('accepts the full button and returns the same object', () => {
    const input = button();
    expect(validateComponent(input)).toEqual([]);
    const parsed = parsedOf(input);
    expect(parsed.id).toBe('button');
    expect(parsed.template.children).toHaveLength(3);
  });

  it('collectFieldKeys lists the cited keys, sorted and without repetition', () => {
    expect(collectFieldKeys(parsedOf(button()))).toEqual([
      'badge',
      'count',
      'disabled',
      'hidden',
      'icon',
      'label',
      'slotLabel',
      'valign',
      'variant',
    ]);
  });

  it('accepts the minimum: only the required fields', () => {
    const minimal = {
      format: 'mapping-component',
      formatVersion: 1,
      id: 'box',
      name: 'Box',
      size: { width: 10, height: 10 },
      template: { type: 'frame' },
    };
    expect(validateComponent(minimal)).toEqual([]);
    expect(collectFieldKeys(parsedOf(minimal))).toEqual([]);
  });
});

describe('parseComponent: root', () => {
  it('wrong format', () => {
    const problems = problemsAfter((c) => (c.format = 'other'));
    expectProblem(problems, 'format', 'mapping-component');
  });

  it('wrong formatVersion', () => {
    expectProblem(
      problemsAfter((c) => (c.formatVersion = 5)),
      'formatVersion',
      'expected 1, 2, 3 or 4',
    );
  });

  it('invalid id', () => {
    expectProblem(
      problemsAfter((c) => (c.id = 'Big Button')),
      'id',
      'matching',
    );
    expectProblem(
      problemsAfter((c) => (c.id = '-x')),
      'id',
      'matching',
    );
    expectProblem(
      problemsAfter((c) => (c.id = '')),
      'id',
      'matching',
    );
  });

  it('empty name and non-text description', () => {
    expectProblem(
      problemsAfter((c) => (c.name = ' ')),
      'name',
      'non-empty',
    );
    expectProblem(
      problemsAfter((c) => (c.description = 3)),
      'description',
      'text',
    );
  });

  it('missing size or with an invalid value', () => {
    expectProblem(
      problemsAfter((c) => delete c.size),
      'size',
      'required field',
    );
    expectProblem(
      problemsAfter((c) => (c.size.width = 0)),
      'size.width',
      'positive',
    );
    expectProblem(
      problemsAfter((c) => (c.size.height = '40')),
      'size.height',
      'positive',
    );
  });

  it('minSize greater than size', () => {
    const problems = problemsAfter((c) => (c.minSize = { width: 200, height: 10 }));
    expectProblem(problems, 'minSize', 'greater than size');
  });

  it('preview with a value of an invalid type', () => {
    expectProblem(
      problemsAfter((c) => (c.preview.flag = true)),
      'preview.flag',
      'text, a number or null',
    );
    expectProblem(
      problemsAfter((c) => (c.preview = [])),
      'preview',
      'object',
    );
  });

  it('missing template or one that is not a frame', () => {
    expectProblem(
      problemsAfter((c) => delete c.template),
      'template',
      'required field',
    );
    const problems = problemsAfter((c) => (c.template = { type: 'rect' }));
    expectProblem(problems, 'template.type', 'frame');
  });

  it('unknown key at the root', () => {
    expectProblem(
      problemsAfter((c) => (c.extra = 1)),
      'extra',
      'unknown key: extra',
    );
  });

  it('input that is not an object', () => {
    expect(validateComponent(null)).toEqual(['component: expected an object']);
    expect(validateComponent([])).toEqual(['component: expected an object']);
  });
});

describe('parseComponent: nodes', () => {
  it('unknown node type', () => {
    const problems = problemsAfter((c) => (c.template.children[1].type = 'blob'));
    expectProblem(problems, 'template.children[1].type', 'unknown node type');
  });

  it('unknown key in a node (typo)', () => {
    const problems = problemsAfter((c) => (c.template.children[0].colour = '#fff'));
    expectProblem(problems, 'template.children[0].colour', 'unknown key: colour');
  });

  it('invalid SizeSpec', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[0].width = '10px')),
      'template.children[0].width',
      '"fill", "hug"',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[0].height = -1)),
      'template.children[0].height',
      'greater than or equal to 0',
    );
  });

  it('opacity outside 0..1', () => {
    expectProblem(
      problemsAfter((c) => (c.template.opacity = 2)),
      'template.opacity',
      'between 0 and 1',
    );
    // a literal inside the expression follows the same rule
    expectProblem(
      problemsAfter((c) => (c.template.children[1].opacity.then = 5)),
      'template.children[1].opacity.then',
      'between 0 and 1',
    );
  });

  it('invalid anchors', () => {
    const problems = problemsAfter((c) => {
      const anchors = c.template.children[2].children[0].anchors;
      anchors.left = '4';
      anchors.centerX = 1;
      anchors.middle = true;
    });
    const base = 'template.children[2].children[0].anchors';
    expectProblem(problems, `${base}.left`, 'a number');
    expectProblem(problems, `${base}.centerX`, 'boolean');
    expectProblem(problems, `${base}.middle`, 'unknown key: middle');
  });

  it('gradient with a single stop', () => {
    const problems = problemsAfter((c) => {
      c.template.fill.cases.danger.stops = [{ offset: 0, color: '#fff' }];
    });
    expectProblem(problems, 'template.fill.cases.danger.stops', 'at least 2');
  });

  it('stop with an offset outside 0..1', () => {
    const problems = problemsAfter(
      (c) => (c.template.fill.cases.danger.stops[1].offset = 3),
    );
    expectProblem(
      problems,
      'template.fill.cases.danger.stops[1].offset',
      'between 0 and 1',
    );
  });

  it('border without a color', () => {
    const problems = problemsAfter((c) => delete c.template.stroke.color);
    expectProblem(problems, 'template.stroke.color', 'required field');
  });

  it('border with an invalid align and shadow without a color', () => {
    const problems = problemsAfter((c) => {
      c.template.stroke.align = 'middle';
      delete c.template.shadow.color;
    });
    expectProblem(problems, 'template.stroke.align', 'inside, center, outside');
    expectProblem(problems, 'template.shadow.color', 'required field');
  });

  it('invalid cornerRadius', () => {
    const problems = problemsAfter((c) => (c.template.cornerRadius = [1, 2]));
    expectProblem(problems, 'template.cornerRadius', '4 numbers');
  });

  it('invalid layout', () => {
    const problems = problemsAfter((c) => {
      c.template.layout.justify = 'around';
      c.template.layout.padding = [1, 2, 3];
    });
    expectProblem(problems, 'template.layout.justify', 'space-between');
    expectProblem(problems, 'template.layout.padding', 'list of 4');
  });

  it('text without text', () => {
    const problems = problemsAfter((c) => delete c.template.children[1].text);
    expectProblem(problems, 'template.children[1].text', 'required field');
  });

  it('font with a weight outside 100..900 and an invalid alignment', () => {
    const problems = problemsAfter((c) => {
      c.template.children[1].font.weight = 1000;
      c.template.children[1].font.align = 'distributed';
    });
    expectProblem(problems, 'template.children[1].font.weight', '100 and 900');
    expectProblem(
      problems,
      'template.children[1].font.align',
      'left, center, right, justify',
    );
  });

  it('path without a viewBox or with an invalid viewBox', () => {
    expectProblem(
      problemsAfter((c) => delete c.template.children[0].viewBox),
      'template.children[0].viewBox',
      'required field',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[0].viewBox = [16, 0])),
      'template.children[0].viewBox',
      'positive',
    );
  });

  it('children in a rect', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[2].children[1].children = []),
    );
    expectProblem(problems, 'template.children[2].children[1].children', 'frame');
  });

  it('layout in a text', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[1].layout = { type: 'none' }),
    );
    expectProblem(problems, 'template.children[1].layout', 'frame');
  });
});

describe('parseComponent: visible and italic as BoolExpr', () => {
  it('accepts a direct condition, $field, literal and $if', () => {
    const visibles = [
      { $has: 'label' },
      { $not: { $field: 'on' } },
      { $eq: ['variant', 'primary'] },
      { $and: [{ $has: 'a' }, { $or: [{ $field: 'b' }, { $has: 'c' }] }] },
      { $field: 'icon' },
      true,
      { $if: { $has: 'label' }, then: true, else: false },
    ];
    for (const visible of visibles) {
      const problems = problemsAfter((c) => (c.template.children[0].visible = visible));
      expect(problems, JSON.stringify(visible)).toEqual([]);
    }
  });

  it('italic accepts a direct condition', () => {
    const problems = problemsAfter(
      (c) => (c.template.children[1].font.italic = { $has: 'em' }),
    );
    expect(problems).toEqual([]);
  });

  it('direct condition fields enter collectFieldKeys', () => {
    const c = button();
    (c.template as Record<string, unknown>).visible = { $has: 'extra' };
    expect(collectFieldKeys(parsedOf(c))).toContain('extra');
  });

  it('$has with a value that is not text is invalid', () => {
    const problems = problemsAfter((c) => (c.template.children[0].visible = { $has: 3 }));
    expectProblem(problems, 'template.children[0].visible.$has', 'field key');
  });

  it('invalid direct condition in italic and with an extra operator', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[1].font.italic = { $has: 3 })),
      'template.children[1].font.italic.$has',
      'field key',
    );
    expectProblem(
      problemsAfter(
        (c) => (c.template.children[0].visible = { $has: 'a', $not: { $field: 'b' } }),
      ),
      'template.children[0].visible',
      'more than one operator',
    );
  });

  it('a literal that is not a boolean is still invalid', () => {
    expectProblem(
      problemsAfter((c) => (c.template.children[0].visible = 'yes')),
      'template.children[0].visible',
      'boolean',
    );
  });
});

describe('parseComponent: expressions', () => {
  it('expression with two operators', () => {
    const problems = problemsAfter(
      (c) =>
        (c.template.children[0].visible = { $field: 'icon', $switch: 'x', cases: {} }),
    );
    expectProblem(problems, 'template.children[0].visible', 'more than one operator');
  });

  it('unknown key inside an expression', () => {
    const problems = problemsAfter((c) => (c.template.children[0].visible.defualt = 'x'));
    expectProblem(
      problems,
      'template.children[0].visible.defualt',
      'unknown key: defualt',
    );
  });

  it('$if without then', () => {
    const problems = problemsAfter((c) => delete c.template.stroke.color.then);
    expectProblem(problems, 'template.stroke.color.then', 'required field');
  });

  it('$eq that is not a list', () => {
    const problems = problemsAfter(
      (c) => (c.template.stroke.color.$if = { $eq: 'variant' }),
    );
    expectProblem(problems, 'template.stroke.color.$if.$eq', 'expected a list');
  });

  it('$eq with a value that is neither text nor number', () => {
    const problems = problemsAfter(
      (c) => (c.template.stroke.color.$if = { $eq: ['v', true] }),
    );
    expectProblem(problems, 'template.stroke.color.$if.$eq', 'expected a list');
  });

  it('condition without an operator or with an unknown operator', () => {
    const problems = problemsAfter((c) => (c.template.stroke.color.$if = { $nope: 'x' }));
    expectProblem(problems, 'template.stroke.color.$if', 'without an operator');
  });

  it('literal of the wrong type inside then', () => {
    const problems = problemsAfter((c) => (c.template.stroke.color.then = 12));
    expectProblem(problems, 'template.stroke.color.then', 'expected a color');
  });

  it('literal of the wrong type in fill by $if and in $concat', () => {
    expectProblem(
      problemsAfter((c) => (c.template.fill = { $if: { $field: 'a' }, then: 12 })),
      'template.fill.then',
      'expected a color',
    );
    expectProblem(
      problemsAfter((c) => (c.template.children[1].text.$concat[0] = true)),
      'template.children[1].text.$concat[0]',
      'text or a number',
    );
  });

  it('$switch with cases and default checked', () => {
    const problems = problemsAfter((c) => {
      c.template.fill.cases.primary = 5;
      c.template.fill.default = false;
      c.template.fill.cases = [];
    });
    expectProblem(problems, 'template.fill.default', 'expected a color');
    expectProblem(problems, 'template.fill.cases', 'object of cases');
  });

  it('$field with an empty key and default of the wrong type', () => {
    const problems = problemsAfter((c) => {
      c.template.children[1].text.$concat[0] = { $field: '' };
      c.template.children[0].visible = { $field: 'icon', default: 'yes' };
    });
    expectProblem(problems, 'template.children[1].text.$concat[0].$field', 'field key');
    expectProblem(problems, 'template.children[0].visible.default', 'boolean');
  });
});

describe('validateComponent e parseComponent', () => {
  it('validateComponent returns all the problems at once', () => {
    const problems = problemsAfter((c) => {
      c.format = 'x';
      c.id = 'Bad';
      delete c.size;
      c.template.children[0].width = '10px';
      c.template.children[1].opacity = 2;
      c.template.children[2].children[1].children = [];
    });
    expect(problems).toHaveLength(6);
    expectProblem(problems, 'format', 'mapping-component');
    expectProblem(problems, 'id', 'matching');
    expectProblem(problems, 'size', 'required field');
    expectProblem(problems, 'template.children[0].width', '"fill", "hug"');
    expectProblem(problems, 'template.children[1].opacity', 'between 0 and 1');
    expectProblem(problems, 'template.children[2].children[1].children', 'frame');
  });

  it('parseComponent returns issues with path and message, and errors in the validateComponent format', () => {
    const input = button();
    input.format = 'x';
    input.id = 'Bad';
    input.name = '';
    const result = parseComponent(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(3);
    expect(result.issues[0]).toEqual({
      path: 'format',
      message: 'expected "mapping-component"',
      code: 'component.formatInvalid',
    });
    expect(result.errors).toEqual(validateComponent(input));
  });

  it('parseComponent returns the component when valid', () => {
    const input = button();
    expect(parseComponent(input)).toEqual({
      ok: true,
      component: input,
      warnings: [],
      tokenRefs: [],
      rewrite: expect.any(Function),
    });
    // Without variables, the path of the read component is the file's.
    const parsed = parseComponent(input);
    expect(parsed.ok && parsed.rewrite('template.children[0]')).toBe(
      'template.children[0]',
    );
  });

  it('parseComponentText reads the JSON text and treats invalid JSON as an issue with an empty path', () => {
    expect(parseComponentText(JSON.stringify(button())).ok).toBe(true);
    const bad = parseComponentText('{ not json');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.issues).toHaveLength(1);
    expect(bad.issues[0]?.path).toBe('');
    expect(bad.issues[0]?.message).toMatch(/^invalid JSON: /);
    expect(bad.errors[0]).toMatch(/^invalid JSON: /);
  });
});

describe('font.family warning', () => {
  const withFamily = (family: unknown): Record<string, unknown> => {
    const c = button();
    c.template = {
      type: 'frame',
      children: [{ type: 'text', text: 'x', font: { family, size: 14 } }],
    };
    return c;
  };
  const warningsOf = (family: unknown) => {
    const result = parseComponent(withFamily(family));
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.warnings;
  };

  it('an invalid literal family is a warning, with the node path and the value', () => {
    expect(warningsOf('"Segoe UI, Roboto')).toEqual([
      {
        path: 'template.children[0].font.family',
        message: expect.stringContaining('"Segoe UI, Roboto'),
        code: 'component.fontFamilyInvalid',
        params: { family: expect.stringContaining('"Segoe UI, Roboto') },
      },
    ]);
  });

  it('a valid stack and an expression do not generate a warning', () => {
    expect(
      warningsOf('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'),
    ).toEqual([]);
    expect(warningsOf({ $field: 'font' })).toEqual([]);
  });
});

describe('parseComponent: numeric operations and comparisons (format 4)', () => {
  const V4 = 'only allowed with formatVersion 4';
  const opsComponent = (extra: Record<string, unknown>, version = 4): unknown => ({
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template: { type: 'frame', ...extra },
  });
  const problems = (extra: Record<string, unknown>, version = 4): string[] => {
    const { gap, ...rest } = extra;
    const layout = gap === undefined ? {} : { layout: { type: 'column', gap } };
    return validateComponent(opsComponent({ ...rest, ...layout }, version));
  };

  it('accepts each operation where a number is valid, including nested', () => {
    const ok = {
      width: { $mul: [{ $field: 'p' }, 200] },
      height: { $add: [{ $sub: [100, 4] }, { $round: { $field: 'h', default: 1.4 } }] },
      gap: { $min: [{ $max: [1, 2] }, 8] },
      children: [{ type: 'rect', width: { $mod: [{ $field: 'i' }, 3] }, height: 4 }],
      opacity: { $clamp: [{ $field: 'o' }, 0, 1] },
      cornerRadius: { $floor: 4.5 },
    };
    expect(problems(ok)).toEqual([]);
    expect(
      validateComponent(opsComponent({ layout: { type: 'row', padding: { $abs: -3 } } })),
    ).toEqual([]);
    expect(
      problems({
        children: [
          {
            type: 'text',
            text: { $concat: ['x', { $div: [1, 3] }] },
            font: {
              size: { $ceil: 11.2 },
            },
            anchors: { left: 0, top: 0 },
          },
          { type: 'rect', width: { $sin: 30 }, height: { $cos: 60 } },
        ],
      }),
    ).toEqual([]);
  });

  it('accepts the comparisons in $if, visible, $and, $or and $not', () => {
    expect(
      problems({
        visible: {
          $and: [{ $gt: [{ $field: 'a' }, 1] }, { $not: { $lte: [2, { $field: 'b' }] } }],
        },
        gap: { $if: { $or: [{ $gte: [1, 2] }, { $lt: [3, 4] }] }, then: 4, else: 8 },
      }),
    ).toEqual([]);
    expect(problems({ visible: { $gt: [1, 2] } })).toEqual([]);
  });

  it('in a formatVersion 1 to 3, each new key is only for 4, at the key path', () => {
    for (const version of [1, 2, 3]) {
      const found = problems(
        {
          width: { $mul: [{ $field: 'p' }, 200] },
          visible: { $gt: [1, 2] },
          gap: { $if: { $and: [{ $lte: [1, 2] }] }, then: { $sin: 3 }, else: 0 },
        },
        version,
      );
      expectProblem(found, 'template.width.$mul', V4);
      expectProblem(found, 'template.visible.$gt', V4);
      expectProblem(found, 'template.layout.gap.$if.$and[0].$lte', V4);
      expectProblem(found, 'template.layout.gap.then.$sin', V4);
    }
  });

  it('the wrong arity is refused', () => {
    expectProblem(
      problems({ gap: { $sub: [1, 2, 3] } }),
      'template.layout.gap.$sub',
      'needs 2 operands',
    );
    expectProblem(
      problems({ gap: { $div: [1] } }),
      'template.layout.gap.$div',
      'needs 2 operands',
    );
    expectProblem(
      problems({ gap: { $mod: [1, 2, 3] } }),
      'template.layout.gap.$mod',
      'needs 2 operands',
    );
    expectProblem(
      problems({ gap: { $add: [1] } }),
      'template.layout.gap.$add',
      'needs 2 or more operands',
    );
    expectProblem(
      problems({ gap: { $mul: [] } }),
      'template.layout.gap.$mul',
      'needs 2 or more operands',
    );
    expectProblem(
      problems({ gap: { $min: [1] } }),
      'template.layout.gap.$min',
      'needs 2 or more operands',
    );
    expectProblem(
      problems({ gap: { $max: 3 } }),
      'template.layout.gap.$max',
      'expected a list',
    );
    expectProblem(
      problems({ gap: { $clamp: [1, 2] } }),
      'template.layout.gap.$clamp',
      'needs 3 operands',
    );
    expectProblem(
      problems({ gap: { $round: [1, 2] } }),
      'template.layout.gap.$round',
      'needs 1 operand',
    );
    expectProblem(
      problems({ gap: { $sin: [1, 2] } }),
      'template.layout.gap.$sin',
      'needs 1 operand',
    );
    expectProblem(
      problems({ visible: { $gt: [1] } }),
      'template.visible.$gt',
      'needs 2 operands',
    );
  });

  it('an operand literal that is not a number is refused, at the operand path', () => {
    expectProblem(
      problems({ gap: { $add: [1, 'x'] } }),
      'template.layout.gap.$add[1]',
      'must be a number',
    );
    expectProblem(
      problems({ gap: { $abs: 'x' } }),
      'template.layout.gap.$abs',
      'must be a number',
    );
    expectProblem(
      problems({ gap: { $clamp: [1, 0, true] } }),
      'template.layout.gap.$clamp[2]',
      'must be a number',
    );
    expectProblem(
      problems({ visible: { $lt: ['a', 1] } }),
      'template.visible.$lt[0]',
      'must be a number',
    );
    expectProblem(
      problems({ gap: { $add: [1, { $mul: [2, 'y'] }] } }),
      'template.layout.gap.$add[1].$mul[1]',
      'must be a number',
    );
  });

  it('a key inherited from Object (constructor, toString) in a $switch case does not become an operation', () => {
    for (const version of [3, 4]) {
      expect(
        problems(
          {
            fill: {
              $switch: 'k',
              cases: { constructor: '#fff', toString: '#000', valueOf: '#111' },
            },
          },
          version,
        ),
      ).toEqual([]);
    }
  });

  it('an operation outside a numeric position is refused; an unknown key too', () => {
    expectProblem(problems({ fill: { $add: [1, 2] } }), 'template.fill', 'a number');
    expectProblem(
      problems({ gap: { $add: [1, 2], extra: 1 } }),
      'template.layout.gap.extra',
      'unknown key',
    );
    expectProblem(
      problems({ gap: { $add: [1, 2], $mul: [1, 2] } }),
      'template.layout.gap',
      'more than one operator',
    );
  });
});

describe('$lines and sizing by expression (MC2, decisions 8 and 9 of #898)', () => {
  const V4 = 'only allowed with formatVersion 4';
  const text = (name: string, extra: Record<string, unknown> = {}) => ({
    type: 'text',
    name,
    text: 'Hello',
    ...extra,
  });
  const file = (
    template: Record<string, unknown>,
    extra: Record<string, unknown> = {},
    version = 4,
  ): unknown => ({
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
    ...extra,
  });
  const MIN = { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 68, else: 48 };
  const root = (children: unknown[], extra: Record<string, unknown> = {}) => ({
    type: 'frame',
    minHeight: MIN,
    children,
    ...extra,
  });

  it('accepts $lines citing a single text node, where a number is valid', () => {
    expect(validateComponent(file(root([text('msg')])))).toEqual([]);
  });

  it('cited node that does not exist, or is not text', () => {
    for (const nodes of [[text('other')], [{ type: 'rect', name: 'msg' }]]) {
      const errors = validateComponent(file(root(nodes)));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(
        /^template\.minHeight\..*\$lines: text node "msg" does not exist$/,
      );
    }
  });

  it('repeated node', () => {
    const errors = validateComponent(file(root([text('msg'), text('msg')])));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\$lines: more than one text node "msg"$/);
  });

  it('a node inside a repeat can only be cited from inside the same row', () => {
    const rowOf = (cell: Record<string, unknown>) => ({
      type: 'repeat',
      field: 'rows',
      template: { type: 'frame', children: [cell] },
    });
    const outside = validateComponent(
      file({
        type: 'frame',
        minHeight: { $lines: 'cell' },
        children: [rowOf(text('cell'))],
      }),
    );
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatch(/\$lines: text node "cell" is inside a repeat/);
    // From inside the same row, and from inside the repeat to a node outside, it is valid.
    expect(
      validateComponent(
        file({
          type: 'frame',
          children: [
            text('head'),
            {
              type: 'repeat',
              field: 'rows',
              template: {
                type: 'frame',
                minHeight: { $mul: [{ $lines: 'cell' }, { $lines: 'head' }] },
                children: [text('cell')],
              },
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('the node itself: $lines in the width of the cited node', () => {
    const errors = validateComponent(
      file({
        type: 'frame',
        children: [text('msg', { width: { $mul: [{ $lines: 'msg' }, 10] } })],
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\$lines: the node cannot depend on its own lines$/);
  });

  it('v4 only: the new key in a formatVersion 3 asks for 4', () => {
    const errors = validateComponent(file(root([text('msg')]), {}, 3));
    expect(errors.some((e) => e.endsWith(V4))).toBe(true);
  });

  it('the name must be non-empty text', () => {
    expect(
      validateComponent(file(root([text('msg')], { minHeight: { $lines: '' } }))),
    ).toEqual([
      'template.minHeight.$lines: expected the name of a text node (non-empty text)',
    ]);
  });

  it('sizing accepts an expression that gives a number, fill or hug (v4)', () => {
    const sizing = {
      width: 'fill',
      height: { $switch: 'style', cases: { small: 64, medium: 112, large: 152 } },
    };
    expect(validateComponent(file({ type: 'frame' }, { sizing }))).toEqual([]);
    expect(
      validateComponent(
        file(
          { type: 'frame' },
          { sizing: { height: { $if: { $has: 'x' }, then: 'hug', else: 48 } } },
        ),
      ),
    ).toEqual([]);
  });

  it('sizing by expression in a formatVersion 3 asks for 4', () => {
    expect(
      validateComponent(
        file({ type: 'frame' }, { sizing: { height: { $field: 'h', default: 10 } } }, 3),
      ),
    ).toEqual([`sizing.height: ${V4}`]);
  });

  it('$size inside sizing is an error', () => {
    expect(
      validateComponent(
        file({ type: 'frame' }, { sizing: { height: { $size: 'width' } } }),
      ),
    ).toEqual(['sizing.height: $size is not valid in sizing']);
    expect(
      validateComponent(
        file(
          { type: 'frame' },
          { sizing: { width: { $add: [{ $size: 'height' }, 4] } } },
        ),
      ),
    ).toEqual(['sizing.width: $size is not valid in sizing']);
  });

  it('$lines inside sizing is an error', () => {
    expect(
      validateComponent(
        file(root([text('msg')], { minHeight: 1 }), {
          sizing: { height: { $lines: 'msg' } },
        }),
      ),
    ).toEqual(['sizing.height: $lines is not valid in sizing']);
  });

  it('the invalid literal value is still an error', () => {
    expect(
      validateComponent(file({ type: 'frame' }, { sizing: { height: -1 } })),
    ).toEqual([
      'sizing.height: expected a number greater than or equal to 0, "fill", "hug", "min-content" or "max-content"',
    ]);
  });
});

describe('parseComponent: none aligned and clip (L2, format 4)', () => {
  const V4 = 'only allowed with formatVersion 4';
  const file = (template: Record<string, unknown>, version = 4): unknown => ({
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  });
  const frame = (layout: Record<string, unknown>, version = 4): string[] =>
    validateComponent(file({ type: 'frame', layout }, version));
  const withSlot = (slot: Record<string, unknown>, version = 4): string[] =>
    validateComponent(
      file({ type: 'frame', children: [{ type: 'slot', ...slot }] }, version),
    );

  it('none accepts align and justify with start, center, end and stretch (literal or expression)', () => {
    for (const value of ['start', 'center', 'end', 'stretch'])
      expect(frame({ type: 'none', align: value, justify: value })).toEqual([]);
    expect(
      frame({
        type: 'none',
        align: { $field: 'a', default: 'center' },
        justify: { $field: 'j' },
      }),
    ).toEqual([]);
  });

  it('none rejects baseline and space-*', () => {
    expect(frame({ type: 'none', align: 'baseline' })).toHaveLength(1);
    expect(frame({ type: 'none', justify: 'space-between' })).toHaveLength(1);
    expect(frame({ type: 'none', justify: 'space-around' })).toHaveLength(1);
    expect(frame({ type: 'none', justify: 'space-evenly' })).toHaveLength(1);
  });

  it('none still has no gap, padding, reverse and wrap', () => {
    for (const key of ['gap', 'padding', 'reverse', 'wrap'])
      expect(frame({ type: 'none', [key]: 1 })).toEqual([
        `template.layout.${key}: unknown key: ${key}`,
      ]);
  });

  it('justify stretch in row and column is still an error', () => {
    expect(frame({ type: 'row', justify: 'stretch' })).toHaveLength(1);
    expect(frame({ type: 'column', justify: 'stretch' })).toHaveLength(1);
  });

  it('align and justify of none in a version 1 to 3: only with formatVersion 4, at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(frame({ type: 'none', align: 'center' }, version)).toEqual([
        `template.layout.align: ${V4}`,
      ]);
      expect(frame({ type: 'none', justify: 'end' }, version)).toEqual([
        `template.layout.justify: ${V4}`,
      ]);
    }
    expect(frame({ type: 'row', align: 'center', justify: 'end' }, 1)).toEqual([]);
  });

  it('frame clip: literal in every version, expression only in 4', () => {
    expect(validateComponent(file({ type: 'frame', clip: true }, 1))).toEqual([]);
    expect(validateComponent(file({ type: 'frame', clip: { $field: 'c' } }))).toEqual([]);
    expect(validateComponent(file({ type: 'frame', clip: { $has: 'c' } }))).toEqual([]);
    expect(validateComponent(file({ type: 'frame', clip: { $field: 'c' } }, 3))).toEqual([
      `template.clip: ${V4}`,
    ]);
  });

  it('frame clip with a value that is not a boolean is an error', () => {
    expect(validateComponent(file({ type: 'frame', clip: 'yes' }))).toHaveLength(1);
    expect(validateComponent(file({ type: 'frame', clip: 3 }))).toHaveLength(1);
  });

  it('slot accepts a boolean clip or an expression in v4; in 1 to 3 it is v4 only, at the clip path', () => {
    expect(withSlot({ clip: true })).toEqual([]);
    expect(withSlot({ clip: { $field: 'c' } })).toEqual([]);
    expect(withSlot({ clip: 'yes' })).toHaveLength(1);
    for (const version of [1, 2, 3]) {
      expect(withSlot({ clip: true }, version)).toEqual([
        `template.children[0].clip: ${V4}`,
      ]);
      expect(withSlot({ clip: { $field: 'c' } }, version)).toEqual([
        `template.children[0].clip: ${V4}`,
      ]);
    }
  });
});
