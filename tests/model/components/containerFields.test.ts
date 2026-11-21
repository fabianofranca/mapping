// CX4 (#2039, decision 17 of #1901): the `$container.*` pseudo-fields in the engine (expressions, instance,
// `sizing`, the `component` node), the values a container gives the instance (`containerValues`) and the
// version gate of the parser.
import { describe, expect, it } from 'vitest';
import { containerValues } from '../../../src/model/componentValues';
import {
  containerFieldValues,
  readsContainer,
  type InstanceContainer,
} from '../../../src/model/components/container';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  evaluate,
  evaluateBoolean,
  referencedFields,
} from '../../../src/model/components/expressions';
import { approximateMeasurer, instantiate } from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import { resolveSizing } from '../../../src/model/components/sizing';
import { walk } from '../../../src/model/components/scene';
import { setContainerClass } from '../../../src/model';
import { validateLibrary } from '../../../src/model/library';
import {
  CX_COMPONENTS,
  CX_SPEC_JSON,
  PADDING_BY_WINDOW,
  cxCatalog,
  cxProject,
} from '../containerContextFixtures';

const compact: InstanceContainer = {
  width: 360,
  height: 533,
  classes: { window: 'compact' },
};
const expanded: InstanceContainer = {
  width: 840,
  height: 533,
  classes: { window: 'expanded', platform: 'web' },
};

const component = (id: string): ComponentFile => {
  const parsed = parseComponent(CX_COMPONENTS[id]);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.component;
};

/** The width of the `bar` rect the fixtures draw. */
function barWidth(file: ComponentFile, container?: InstanceContainer): number {
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, ...file.size },
    { measure: approximateMeasurer, ...(container === undefined ? {} : { container }) },
  );
  const found = [...walk(root)].find((n) => n.name === 'bar');
  if (found === undefined) throw new Error('no bar');
  return found.width;
}

describe('the values a container gives the instance', () => {
  it('$container.width and .height are in units: 1080 px at density 3 is 360', () => {
    const p = cxProject();
    const given = containerValues(p, 'I1');
    expect(given).toMatchObject({ width: 360, height: 1600 / 3 });
    expect(containerFieldValues(given)).toMatchObject({
      '$container.width': 360,
      '$container.height': 1600 / 3,
    });
  });

  it('carries the effective classes: computed by the width in units and chosen by the container', () => {
    const p = setContainerClass(cxProject(), 'I2', 'platform', 'web');
    expect(containerValues(p, 'I1')?.classes).toEqual({ window: 'compact' });
    expect(containerValues(p, 'I2')?.classes).toEqual({
      window: 'expanded',
      platform: 'web',
    });
    expect(containerFieldValues(containerValues(p, 'I2'))).toMatchObject({
      '$container.window': 'expanded',
      '$container.platform': 'web',
    });
  });

  it('a chosen set without a choice gives no field', () => {
    const fields = containerFieldValues(containerValues(cxProject(), 'I1'));
    expect(Object.keys(fields)).not.toContain('$container.platform');
  });

  it('is empty on the canvas and for an unknown container', () => {
    const p = cxProject();
    expect(containerValues(p, null)).toBeUndefined();
    expect(containerValues(p, 'nope')).toBeUndefined();
    expect(containerFieldValues(undefined)).toEqual({});
  });
});

describe('expressions with $container.*', () => {
  const VALUES: FieldValues = containerFieldValues(expanded);

  it('$field, $switch, $eq and $has read the pseudo-fields', () => {
    expect(evaluate({ $field: '$container.width' }, VALUES, 0)).toBe(840);
    expect(evaluate({ $div: [{ $field: '$container.width' }, 2] } as never, VALUES, 0)).toBe(
      420,
    );
    expect(
      evaluate(
        { $switch: '$container.window', cases: { compact: 1, expanded: 2 }, default: 9 },
        VALUES,
        0,
      ),
    ).toBe(2);
    expect(evaluateBoolean({ $eq: ['$container.window', 'expanded'] }, VALUES, false)).toBe(
      true,
    );
    expect(evaluateBoolean({ $eq: ['$container.window', 'compact'] }, VALUES, false)).toBe(
      false,
    );
    expect(evaluateBoolean({ $has: '$container.window' }, VALUES, false)).toBe(true);
  });

  it('with no class or no container they are empty: the default, the $switch default and $has false', () => {
    const none: FieldValues = {};
    expect(evaluate({ $field: '$container.width', default: 7 }, none, 0)).toBe(7);
    expect(
      evaluate({ $switch: '$container.window', cases: { compact: 1 }, default: 9 }, none, 0),
    ).toBe(9);
    expect(evaluateBoolean({ $has: '$container.window' }, none, true)).toBe(false);
    expect(
      evaluateBoolean({ $has: '$container.window' }, containerFieldValues({ width: 1, height: 1, classes: {} }), true),
    ).toBe(false);
  });

  it('referencedFields does not count them as fields of the type', () => {
    const tree = {
      a: { $field: '$container.width' },
      b: { $switch: '$container.window', cases: {} },
      c: { $eq: ['$container.window', 'compact'] },
      d: { $has: '$container.height' },
      e: { $field: 'title' },
    };
    expect([...referencedFields(tree)]).toEqual(['title']);
  });
});

describe('the instance reads $container.*', () => {
  it('draws differently in a compact and an expanded container', () => {
    const pad = component('pad');
    expect(barWidth(pad, compact)).toBe(16);
    expect(barWidth(pad, expanded)).toBe(24);
  });

  it('without a container it falls to the default', () => {
    expect(barWidth(component('pad'))).toBe(8);
  });

  it('a field of the type with the same name never sees them (the container wins, and no field has that key)', () => {
    const pad = component('pad');
    const { root } = instantiate(
      pad,
      { '$container.window': 'expanded' },
      { x: 0, y: 0, ...pad.size },
      { measure: approximateMeasurer, container: compact },
    );
    const found = [...walk(root)].find((n) => n.name === 'bar');
    expect(found?.width).toBe(16);
  });

  it('the inner instance of a `component` node receives the same container', () => {
    const holder = {
      ...component('holder'),
      resolvedComponents: {
        pad: { component: component('pad'), fields: [] },
      },
    } as ComponentFile;
    expect(barWidth(holder, compact)).toBe(16);
    expect(barWidth(holder, expanded)).toBe(24);
    expect(barWidth(holder)).toBe(8);
  });

  it('the default content of a slot receives it too', () => {
    const withFallback = parseComponent({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'sheet',
      name: 'Sheet',
      size: { width: 100, height: 40 },
      template: {
        type: 'frame',
        layout: { type: 'none' },
        children: [
          {
            type: 'slot',
            anchors: { left: 0, right: 0, top: 0, bottom: 0 },
            fallback: {
              type: 'frame',
              layout: { type: 'none' },
              children: [
                {
                  type: 'rect',
                  name: 'bar',
                  width: PADDING_BY_WINDOW,
                  height: 10,
                  fill: '#000000',
                },
              ],
            },
          },
        ],
      },
    });
    if (!withFallback.ok) throw new Error(withFallback.errors.join('\n'));
    expect(barWidth(withFallback.component, expanded)).toBe(24);
    expect(barWidth(withFallback.component, compact)).toBe(16);
  });
});

describe('sizing reads $container.*', () => {
  const sized = parseComponent({
    ...CX_COMPONENTS.plain,
    sizing: { width: { $field: '$container.width' } },
  });

  it('is valid in `sizing`: the axis follows the container width in units', () => {
    if (!sized.ok) throw new Error(sized.errors.join('\n'));
    const resolved = resolveSizing(sized.component, {}, undefined, { container: compact });
    expect(resolved.width.spec).toBe(360);
    expect(resolved.messages).toEqual([]);
  });

  it('without a container the expression is empty: the axis keeps the size and warns', () => {
    if (!sized.ok) throw new Error(sized.errors.join('\n'));
    const resolved = resolveSizing(sized.component, {});
    expect(resolved.width).toMatchObject({ source: 'size' });
  });
});

describe('readsContainer', () => {
  it('is true for a template or a sizing that cites it, and for an outer component whose inner one does', () => {
    expect(readsContainer(component('pad'))).toBe(true);
    expect(readsContainer(component('plain'))).toBe(false);
    const sized = parseComponent({
      ...CX_COMPONENTS.plain,
      sizing: { width: { $field: '$container.width' } },
    });
    if (!sized.ok) throw new Error(sized.errors.join('\n'));
    expect(readsContainer(sized.component)).toBe(true);
    const catalog = cxCatalog();
    expect(readsContainer(catalog.get('cx')?.byType.get('holder') as ComponentFile)).toBe(
      true,
    );
    expect(readsContainer(catalog.get('cx')?.byType.get('plain') as ComponentFile)).toBe(
      false,
    );
  });
});

describe('the parser gate', () => {
  // Only the `$container.` citation is new: a v3 text node with a `$field` is valid otherwise.
  const withRead = (formatVersion: number, name = '$container.width') =>
    parseComponent({
      ...CX_COMPONENTS.plain,
      formatVersion,
      template: {
        type: 'frame',
        layout: { type: 'none' },
        children: [
          {
            type: 'text',
            text: { $field: name, default: '' },
            font: { size: 14, lineHeight: 20 },
          },
        ],
      },
    });

  it('in formatVersion 4 the name is accepted', () => {
    expect(withRead(4).ok).toBe(true);
  });

  it('in formatVersion 3 it is only allowed with formatVersion 4', () => {
    const parsed = withRead(3);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors.join('\n')).toContain(
      'only allowed with formatVersion 4',
    );
  });

  it('a `$container.` name that cannot be a width, a height or a set id is field does not exist', () => {
    const parsed = withRead(4, '$container.Foo Bar');
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors.join('\n')).toContain(
      'field does not exist: $container.Foo Bar',
    );
  });
});

describe('the library validator', () => {
  function validate(read: unknown, sets = CX_SPEC_JSON.containerClasses) {
    const spec = {
      ...CX_SPEC_JSON,
      containerClasses: sets,
      layers: [
        {
          id: 'l',
          name: 'L',
          color: '#112233',
          annotationTypes: [
            { id: 'pad', name: 'Pad', component: 'components/pad.json', fields: [] },
          ],
        },
      ],
    };
    const comp = {
      ...CX_COMPONENTS.plain,
      id: 'pad',
      template: {
        type: 'frame',
        layout: { type: 'none' },
        children: [{ type: 'rect', name: 'r', width: read, height: 1, fill: '#000000' }],
      },
    };
    const result = validateLibrary({
      specPath: 'cx.spec.json',
      files: [
        { path: 'cx.spec.json', text: JSON.stringify(spec) },
        { path: 'components/pad.json', text: JSON.stringify(comp) },
      ],
    });
    return [...result.errors, ...result.warnings].map((i) => `${i.path}: ${i.message}`);
  }

  it('accepts width, height and the sets of the component specialization without a type field', () => {
    for (const name of ['width', 'height', 'window', 'platform']) {
      expect(validate({ $field: `$container.${name}`, default: 1 })).toEqual([]);
    }
  });

  it('refuses another name: field does not exist: $container.foo (and no undeclared field)', () => {
    const found = validate({ $field: '$container.foo', default: 1 }).join('\n');
    expect(found).toContain('field does not exist: $container.foo');
    expect(found).not.toContain('does not declare');
  });

  it('a set the specialization does not declare is also unknown', () => {
    expect(validate({ $field: '$container.window', default: 1 }, [])).toEqual([
      expect.stringContaining('field does not exist: $container.window'),
    ]);
  });
});
