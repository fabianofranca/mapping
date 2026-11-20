// FG2: the pure SVG converter (`svgShapes.ts` and `svgIcon.ts`): basic shapes as path data, the
// icon entry, the color rule (decision 6) and the name (decision 7).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIconsFile } from '../../../src/model/components/icons';
import {
  iconNameFromFile,
  normalizeColor,
  svgToIcon,
  type SvgIconOptions,
} from '../../../src/model/components/svgIcon';
import { shapePath } from '../../../src/model/components/svgShapes';
import type { ModelMessage } from '../../../src/model/modelMessage';
import { ptBRText } from '../../support/modelText';

const FIXTURES = join(__dirname, '../../fixtures/svg-icons');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
const BOX = '0 0 24 24';
const svg = (body: string, attributes = `viewBox="${BOX}"`): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;

function convert(text: string, options: SvgIconOptions = {}) {
  const result = svgToIcon(text, options);
  if (!result.ok) throw new Error(result.problems.map((p) => p.text).join('; '));
  return result;
}

const problemsOf = (text: string, options: SvgIconOptions = {}): string[] => {
  const result = svgToIcon(text, options);
  return result.ok ? [] : result.problems.map((p) => p.text);
};

const attributes =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

function pathOf(element: string, values: Record<string, string>): string {
  const result = shapePath(element, attributes(values));
  if (result === undefined || !result.ok) throw new Error(`no path for ${element}`);
  return result.d;
}

describe('basic shapes: values', () => {
  it('rect with only rx uses it for ry too, and the other way round', () => {
    const fromRx = pathOf('rect', { width: '20', height: '10', rx: '3' });
    expect(fromRx).toContain('A3 3 0 0 1');
    const fromRy = pathOf('rect', { width: '20', height: '10', ry: '3' });
    expect(fromRy).toBe(fromRx);
  });

  it('rect treats rx="auto" or zero as a square corner', () => {
    const square = pathOf('rect', { width: '10', height: '10' });
    expect(pathOf('rect', { width: '10', height: '10', rx: 'auto' })).toBe(square);
    expect(pathOf('rect', { width: '10', height: '10', rx: '0', ry: '3' })).toBe(square);
  });

  it('numbers in the path data have no noise or exponent', () => {
    const d = pathOf('rect', { x: '0.1', y: '0.2', width: '0.3', height: '1e1' });
    expect(d).toBe('M0.1 0.2H0.4V10.2H0.1Z');
  });

  it('accepts the px unit and refuses any other, naming the attribute', () => {
    expect(pathOf('rect', { width: '10px', height: '5PX' })).toBe('M0 0H10V5H0Z');
    expect(shapePath('rect', attributes({ width: '1em', height: '5' }))).toEqual({
      ok: false,
      attribute: 'width',
      unit: true,
    });
    expect(shapePath('circle', attributes({ r: '50%' }))).toMatchObject({
      attribute: 'r',
      unit: true,
    });
  });

  it.each([
    ['rect', { height: '5' }, 'width'],
    ['rect', { width: '0', height: '5' }, 'width'],
    ['rect', { width: '5', height: '-1' }, 'height'],
    ['rect', { width: '5', height: '5', rx: '-2' }, 'rx'],
    ['rect', { width: 'abc', height: '5' }, 'width'],
    ['circle', {}, 'r'],
    ['circle', { r: '0' }, 'r'],
    ['ellipse', {}, 'rx'],
    ['ellipse', { rx: '3', ry: '0' }, 'ry'],
    ['line', { x1: 'a' }, 'x1'],
    ['polyline', {}, 'points'],
    ['polyline', { points: '1,2' }, 'points'],
    ['polygon', { points: '1,2 3' }, 'points'],
    ['polygon', { points: '1,2 3,4 x' }, 'points'],
  ])('%s %j names %s when it is wrong', (element, values, attribute) => {
    expect(shapePath(element, attributes(values))).toMatchObject({
      ok: false,
      attribute,
    });
  });

  it('is not a shape for any other element', () => {
    expect(shapePath('path', attributes({ d: 'M0 0' }))).toBeUndefined();
  });
});

describe('svgToIcon: the icon entry', () => {
  it('keeps the d of a path as written', () => {
    const d = 'M12 2C6.48 2 2 6.48 2 12 s4.48 10 10 10-10 -4.48-10-10Z';
    const result = convert(svg(`<path d="${d}"/>`));
    expect(result.icon.paths[0]?.d).toBe(d);
    expect(result.viewBox).toEqual([24, 24]);
  });

  it('turns fill-rule into fillRule: "evenodd" and omits nonzero', () => {
    const attribute = convert(svg('<path d="M0 0h4v4z" fill-rule="evenodd"/>'));
    expect(attribute.icon.paths[0]?.fillRule).toBe('evenodd');
    const inline = convert(svg('<path d="M0 0h4v4z" style="fill-rule:evenodd"/>'));
    expect(inline.icon.paths[0]?.fillRule).toBe('evenodd');
    const nonzero = convert(svg('<path d="M0 0h4v4z" fill-rule="nonzero"/>'));
    expect(nonzero.icon.paths[0]).not.toHaveProperty('fillRule');
    const plain = convert(svg('<path d="M0 0h4v4z"/>'));
    expect(plain.icon.paths[0]).not.toHaveProperty('fillRule');
  });

  it('inherits fill-rule from g and from svg, and a nearer value wins', () => {
    const fromGroup = convert(svg('<g fill-rule="evenodd"><path d="M0 0h4v4z"/></g>'));
    expect(fromGroup.icon.paths[0]?.fillRule).toBe('evenodd');
    const fromRoot = convert(
      svg('<g><path d="M0 0h4v4z"/></g>', `viewBox="${BOX}" fill-rule="evenodd"`),
    );
    expect(fromRoot.icon.paths[0]?.fillRule).toBe('evenodd');
    const overridden = convert(
      svg(
        '<g fill-rule="evenodd"><path d="M0 0h4v4z" fill-rule="nonzero"/><path d="M1 1h4v4z"/></g>',
      ),
    );
    expect(overridden.icon.paths[0]).not.toHaveProperty('fillRule');
    expect(overridden.icon.paths[1]?.fillRule).toBe('evenodd');
  });

  it('style wins over the attribute of the same element', () => {
    const result = convert(
      svg('<path d="M0 0h4v4z" fill="#ff0000" style="fill: #00ff00 ; stroke:none"/>'),
      { colors: 'keep' },
    );
    expect(result.icon.paths[0]?.fill).toBe('#00ff00');
  });

  it('fill="none" is fill: false, and without a stroke the path has nothing else', () => {
    const result = convert(svg('<path d="M0 0h4v4z" fill="none"/><path d="M1 1h4v4z"/>'));
    expect(result.icon.paths[0]).toEqual({ d: 'M0 0h4v4z', fill: false });
    expect(result.icon.paths[1]?.fill).toBe(true);
  });

  it('turns the stroke properties into stroke, width, cap and join', () => {
    const result = convert(fixture('icon-stroked.svg'));
    expect(result.icon.paths).toEqual([
      {
        d: 'M5 12l5 5L20 7',
        fill: false,
        stroke: true,
        width: 2,
        cap: 'round',
        join: 'round',
      },
      {
        d: 'M4 20h16',
        fill: false,
        stroke: true,
        width: 1.5,
        cap: 'square',
        join: 'bevel',
      },
    ]);
  });

  it('a path with a stroke and the default fill keeps both', () => {
    const result = convert(svg('<path d="M0 0h4v4z" stroke="#000"/>'));
    expect(result.icon.paths[0]).toEqual({
      d: 'M0 0h4v4z',
      fill: true,
      stroke: true,
      width: 1,
    });
  });

  it('stroke width, cap and join defaults are omitted when they are the SVG defaults', () => {
    const result = convert(
      svg(
        '<path d="M0 0h4" fill="none" stroke="#000" stroke-linecap="butt" stroke-linejoin="miter"/>',
      ),
    );
    expect(result.icon.paths[0]).toEqual({
      d: 'M0 0h4',
      fill: false,
      stroke: true,
      width: 1,
    });
  });

  it('a line has no fill, so its default black does not count as a color', () => {
    const result = convert(svg('<line x2="10" y2="10" stroke="#ff0000"/>'));
    expect(result.icon.paths[0]).toEqual({
      d: 'M0 0L10 10',
      fill: false,
      stroke: true,
      width: 1,
    });
  });

  it('converts the shapes of the fixture, each as path data', () => {
    const result = convert(fixture('icon-shapes.svg'));
    expect(result.icon.paths.map((p) => p.d[0])).toEqual(['M', 'M', 'M', 'M', 'M']);
    expect(result.icon.paths[2]).toMatchObject({ fill: false, stroke: true, width: 2 });
    expect(result.icon.paths[3]).toMatchObject({ fill: false, stroke: true });
    expect(result.icon.paths[4]).toMatchObject({ fill: true });
    expect(result.icon.paths[4]?.d).toMatch(/Z$/);
  });

  it('reads the Figma export: evenodd, the full-viewBox clip and its defs are dropped', () => {
    const result = convert(fixture('icon-figma-evenodd.svg'), {
      defaultViewBox: [24, 24],
    });
    expect(result.icon).toEqual({
      paths: [
        {
          d: expect.stringContaining('M12 2C6.48 2 2 6.48 2 12'),
          fill: true,
          fillRule: 'evenodd',
        },
      ],
    });
  });

  it.each([
    [
      'id, class and version',
      '<path id="a" class="b" d="M0 0h4v4z"/>',
      `viewBox="${BOX}" version="1.1" id="x" class="y"`,
    ],
    [
      'clip-rule and stroke-miterlimit',
      '<path d="M0 0h4v4z" clip-rule="evenodd" stroke-miterlimit="10"/>',
      `viewBox="${BOX}"`,
    ],
    [
      'clip-rule inside style',
      '<path d="M0 0h4v4z" style="clip-rule:evenodd;stroke-miterlimit:4"/>',
      `viewBox="${BOX}"`,
    ],
    [
      'title, desc and metadata',
      '<title>T</title><desc>D</desc><metadata><x:y/></metadata><path d="M0 0h4v4z"/>',
      `viewBox="${BOX}"`,
    ],
    [
      'the width and height of a root with a viewBox',
      '<path d="M0 0h4v4z"/>',
      `viewBox="${BOX}" width="2em" height="100%"`,
    ],
    [
      'xmlns prefixes',
      '<path d="M0 0h4v4z"/>',
      `viewBox="${BOX}" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    ],
    [
      'opacity of 1',
      '<path d="M0 0h4v4z" opacity="1" fill-opacity="1.0" stroke-opacity="1"/>',
      `viewBox="${BOX}"`,
    ],
    [
      'stroke-dasharray none',
      '<path d="M0 0h4v4z" stroke-dasharray="none"/>',
      `viewBox="${BOX}"`,
    ],
  ])('ignores silently: %s', (_label, body, attrs) => {
    const result = convert(svg(body, attrs));
    expect(result.icon.paths).toHaveLength(1);
  });

  it('drops a full-viewBox clip with any id, wherever <defs> is', () => {
    const defs =
      '<defs><clipPath id="a"><rect x="0" y="0" width="24" height="24"/></clipPath></defs>';
    const group = '<g clip-path="url(#a)"><g><path d="M0 0h4v4z"/></g></g>';
    expect(convert(svg(defs + group)).icon.paths).toHaveLength(1);
    expect(convert(svg(group + defs)).icon.paths).toHaveLength(1);
  });

  it('omits the viewBox when it is the file default and carries it otherwise', () => {
    expect(
      convert(svg('<path d="M0 0h4v4z"/>'), { defaultViewBox: [24, 24] }).icon,
    ).not.toHaveProperty('viewBox');
    expect(
      convert(svg('<path d="M0 0h4v4z"/>'), { defaultViewBox: [16, 16] }).icon.viewBox,
    ).toEqual([24, 24]);
    expect(convert(svg('<path d="M0 0h4v4z"/>')).icon.viewBox).toEqual([24, 24]);
  });

  it('sets mirror on the icon when asked', () => {
    expect(convert(svg('<path d="M0 0h4v4z"/>'), { mirror: true }).icon.mirror).toBe(
      true,
    );
    expect(convert(svg('<path d="M0 0h4v4z"/>')).icon).not.toHaveProperty('mirror');
  });
});

describe('svgToIcon: what it refuses', () => {
  it.each([
    [
      'transform on a path',
      '<path transform="translate(1 1)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path transform',
    ],
    [
      'transform on a group',
      '<g transform="scale(2)"><path d="M0 0h4v4z"/></g>',
      'unsupported in SVG: g transform',
    ],
    [
      'an opacity below 1',
      '<path opacity="0.5" d="M0 0h4v4z"/>',
      'unsupported in SVG: path opacity',
    ],
    [
      'a fill-opacity below 1',
      '<path fill-opacity=".5" d="M0 0h4v4z"/>',
      'unsupported in SVG: path fill-opacity',
    ],
    [
      'a stroke-opacity below 1',
      '<path stroke="#000" stroke-opacity="0" d="M0 0h4v4z"/>',
      'unsupported in SVG: path stroke-opacity',
    ],
    [
      'opacity inside style',
      '<path style="opacity:0.2" d="M0 0h4v4z"/>',
      'unsupported in SVG: path opacity',
    ],
    [
      'stroke-dasharray',
      '<path stroke="#000" stroke-dasharray="2 2" d="M0 0h4v4z"/>',
      'unsupported in SVG: path stroke-dasharray',
    ],
    [
      'a gradient paint',
      '<path fill="url(#g)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path fill',
    ],
    [
      'a url stroke',
      '<path stroke="url(#g)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path stroke',
    ],
    [
      'a gradient definition',
      '<defs><linearGradient id="g"/></defs><path d="M0 0h4v4z"/>',
      'unsupported in SVG: linearGradient',
    ],
    [
      'a filter attribute',
      '<path filter="url(#f)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path filter',
    ],
    [
      'a filter element',
      '<filter id="f"/><path d="M0 0h4v4z"/>',
      'unsupported in SVG: filter',
    ],
    [
      'a mask attribute',
      '<path mask="url(#m)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path mask',
    ],
    ['a mask element', '<mask id="m"/><path d="M0 0h4v4z"/>', 'unsupported in SVG: mask'],
    [
      'a clip that is not the viewBox',
      '<defs><clipPath id="a"><rect width="12" height="24"/></clipPath></defs><g clip-path="url(#a)"><path d="M0 0h4v4z"/></g>',
      'unsupported in SVG: g clip-path',
    ],
    [
      'a clipPath that is not the viewBox',
      '<defs><clipPath id="a"><circle r="5"/></clipPath></defs><path d="M0 0h4v4z"/>',
      'unsupported in SVG: clipPath',
    ],
    [
      'a clip with a shifted rect',
      '<defs><clipPath id="a"><rect x="1" width="24" height="24"/></clipPath></defs><g clip-path="url(#a)"><path d="M0 0h4v4z"/></g>',
      'unsupported in SVG: g clip-path',
    ],
    [
      'a clip-path on a path',
      '<path clip-path="url(#a)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path clip-path',
    ],
    ['a use', '<use href="#a"/><path d="M0 0h4v4z"/>', 'unsupported in SVG: use'],
    ['a text', '<text>a</text><path d="M0 0h4v4z"/>', 'unsupported in SVG: text'],
    [
      'an image',
      '<image href="a.png"/><path d="M0 0h4v4z"/>',
      'unsupported in SVG: image',
    ],
    ['a nested svg', '<svg><path d="M0 0h4v4z"/></svg>', 'unsupported in SVG: svg'],
    [
      'a style element',
      '<style>.a{fill:red}</style><path d="M0 0h4v4z"/>',
      'unsupported in SVG: style',
    ],
    [
      'an unknown attribute',
      '<path display="none" d="M0 0h4v4z"/>',
      'unsupported in SVG: path display',
    ],
    [
      'an unknown style property',
      '<path style="mix-blend-mode:multiply" d="M0 0h4v4z"/>',
      'unsupported in SVG: path mix-blend-mode',
    ],
    [
      'an attribute of a shape that does not take it',
      '<circle d="M0 0" r="2"/>',
      'unsupported in SVG: circle d',
    ],
    [
      'a unit on a shape',
      '<rect width="1em" height="4"/>',
      'unsupported in SVG: rect width',
    ],
    ['a percentage on a shape', '<circle r="50%"/>', 'unsupported in SVG: circle r'],
    [
      'a unit on stroke-width',
      '<path stroke="#000" stroke-width="2mm" d="M0 0h4v4z"/>',
      'unsupported in SVG: path stroke-width',
    ],
    [
      'an unknown color',
      '<path fill="hsl(0 0% 0%)" d="M0 0h4v4z"/>',
      'unsupported in SVG: path fill',
    ],
    [
      'a miter-clip join',
      '<path stroke="#000" stroke-linejoin="miter-clip" d="M0 0h4v4z"/>',
      'unsupported in SVG: path stroke-linejoin',
    ],
  ])('refuses %s with the message that names it', (_label, body, message) => {
    expect(problemsOf(svg(body))).toContain(message);
  });

  it('refuses a transform on the root', () => {
    expect(
      problemsOf(svg('<path d="M0 0h4v4z"/>', `viewBox="${BOX}" transform="scale(2)"`)),
    ).toEqual(['unsupported in SVG: svg transform']);
  });

  it('gives the message code and parameters the interface translates', () => {
    const result = svgToIcon(svg('<path transform="x" d="M0 0h4v4z"/>'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const [problem] = result.problems as readonly ModelMessage[];
      expect(problem?.code).toBe('svgIcon.unsupportedAttribute');
      expect(problem?.params).toEqual({ element: 'path', attribute: 'transform' });
      expect(ptBRText(problem as ModelMessage)).toBe(
        'sem suporte no SVG: path transform',
      );
    }
  });

  it('reports every problem of the file, once each', () => {
    const problems = problemsOf(
      svg('<path transform="a" d="M0 0"/><path transform="b" d="M1 1"/><use/><text/>'),
    );
    expect(problems).toEqual([
      'unsupported in SVG: path transform',
      'unsupported in SVG: use',
      'unsupported in SVG: text',
    ]);
  });

  it('refuses a transform fixture', () => {
    expect(problemsOf(fixture('icon-transform.svg'))).toEqual([
      'unsupported in SVG: path transform',
    ]);
  });

  it('says the SVG has no shape', () => {
    expect(problemsOf(svg(''))).toEqual(['the SVG has no shape']);
    expect(problemsOf(svg('<title>x</title><g><g/></g>'))).toEqual([
      'the SVG has no shape',
    ]);
  });

  it('refuses an invalid path or shape value, naming the attribute', () => {
    expect(problemsOf(svg('<path/>'))).toEqual(['invalid value in SVG: path d=""']);
    expect(problemsOf(svg('<rect width="3"/>'))).toEqual([
      'invalid value in SVG: rect height=""',
    ]);
  });

  it('refuses a root that is not svg and text that is not XML', () => {
    expect(problemsOf('<html/>')).toEqual(['the root element is <html>, not <svg>']);
    expect(problemsOf('{"a":1}')[0]).toContain('line 1');
    expect(problemsOf('<svg><g></svg>')[0]).toContain('line 1');
  });

  it('refuses a DOCTYPE and keeps the message of the XML reader', () => {
    const [problem] = problemsOf(
      '<!DOCTYPE svg [<!ENTITY a "b">]>\n<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>',
    );
    expect(problem).toContain('DOCTYPE');
    expect(problem).toContain('line 1');
  });

  it('refuses a text over the size limit', () => {
    const big = svg(`<path d="${'M0 0h1 '.repeat(50_000)}"/>`);
    expect(problemsOf(big)[0]).toContain('256 KB');
  });

  it('never throws', () => {
    for (const text of ['', '<', '<svg', '<svg/>', '\u0000', '<svg viewBox="a b c d"/>'])
      expect(() => svgToIcon(text)).not.toThrow();
  });
});

describe('svgToIcon: the box', () => {
  it('refuses a viewBox with an origin other than 0 0', () => {
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', 'viewBox="2 0 24 24"'))).toEqual([
      'unsupported in SVG: svg viewBox with an origin other than 0 0 (2 0 24 24)',
    ]);
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', 'viewBox="0,-1,24,24"'))[0]).toContain(
      'origin other than 0 0',
    );
  });

  it.each(['0 0 24', '0 0 0 24', '0 0 -1 24', '0 0 a b', ''])(
    'refuses the viewBox "%s"',
    (viewBox) => {
      expect(problemsOf(svg('<path d="M0 0h4v4z"/>', `viewBox="${viewBox}"`))).toEqual([
        `invalid value in SVG: svg viewBox="${viewBox}"`,
      ]);
    },
  );

  it('reads the viewBox with commas, extra spaces and decimals', () => {
    const result = convert(svg('<path d="M0 0h4v4z"/>', 'viewBox=" 0,0 , 16.5  8 "'));
    expect(result.viewBox).toEqual([16.5, 8]);
    expect(result.icon.viewBox).toEqual([16.5, 8]);
  });

  it('without a viewBox, the numeric width and height are the box', () => {
    const result = convert(svg('<path d="M0 0h4v4z"/>', 'width="20" height="10px"'));
    expect(result.viewBox).toEqual([20, 10]);
  });

  it('without a viewBox and with no numeric size, says so', () => {
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', ''))).toEqual([
      'the SVG has no viewBox and no numeric width and height',
    ]);
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', 'width="20"'))).toEqual([
      'the SVG has no viewBox and no numeric width and height',
    ]);
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', 'width="2em" height="2em"'))).toEqual([
      'unsupported in SVG: svg width',
      'unsupported in SVG: svg height',
    ]);
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>', 'width="0" height="2"'))).toEqual([
      'invalid value in SVG: svg width="0"',
    ]);
  });
});

describe('svgToIcon: the color rule (decision 6)', () => {
  it('currentColor is true', () => {
    const result = convert(fixture('icon-current-color.svg'));
    expect(result.icon.paths).toHaveLength(1);
    expect(result.icon.paths[0]?.fill).toBe(true);
  });

  it('currentColor stays true with colors: "keep"', () => {
    const result = convert(svg('<path d="M0 0h4v4z" fill="currentColor"/>'), {
      colors: 'keep',
    });
    expect(result.icon.paths[0]?.fill).toBe(true);
  });

  it('one color becomes true on every path that had it, fill and stroke', () => {
    const result = convert(
      svg(
        '<path d="M0 0h4v4z" fill="#FF0000"/><path d="M5 5h4v4z" fill="none" stroke="#ff0000" stroke-width="2"/>',
      ),
    );
    expect(result.icon.paths[0]?.fill).toBe(true);
    expect(result.icon.paths[1]).toMatchObject({ fill: false, stroke: true, width: 2 });
  });

  it('one color written in different ways is one color', () => {
    const result = convert(
      svg(
        '<path d="M0 0h4v4z" fill="#F00"/><path d="M5 5h4v4z" fill="rgb(255, 0, 0)"/><path d="M9 9h4v4z" fill="red"/>',
      ),
    );
    expect(result.icon.paths.map((p) => p.fill)).toEqual([true, true, true]);
  });

  it('keeps the colors of a flag with three colors, normalized', () => {
    const result = convert(fixture('icon-flag.svg'), { defaultViewBox: [24, 24] });
    expect(result.icon.viewBox).toEqual([24, 16]);
    expect(result.icon.paths.map((p) => p.fill)).toEqual([
      '#ffffff',
      '#0055a4',
      '#ef4135',
    ]);
  });

  it('colors: "keep" keeps the literal of a single-color icon', () => {
    const result = convert(fixture('icon-figma-evenodd.svg'), { colors: 'keep' });
    expect(result.icon.paths[0]?.fill).toBe('#1d1b20');
  });

  it('a shape without fill counts as black', () => {
    const one = convert(svg('<path d="M0 0h4v4z"/><path d="M5 5h4v4z" fill="#000000"/>'));
    expect(one.icon.paths.map((p) => p.fill)).toEqual([true, true]);
    const two = convert(svg('<path d="M0 0h4v4z"/><path d="M5 5h4v4z" fill="#ff0000"/>'));
    expect(two.icon.paths.map((p) => p.fill)).toEqual(['#000000', '#ff0000']);
  });

  it('a color of a stroke-only icon counts, the fill none does not', () => {
    const result = convert(
      svg(
        '<path d="M0 0h4" fill="none" stroke="#123456"/><path d="M0 5h4" fill="none" stroke="#654321"/>',
      ),
    );
    expect(result.icon.paths.map((p) => p.stroke)).toEqual(['#123456', '#654321']);
  });

  it('keeps the alpha of a color that has one', () => {
    const result = convert(
      svg('<path d="M0 0h4v4z" fill="#ff000080"/><path d="M5 5h4v4z" fill="#00ff00"/>'),
    );
    expect(result.icon.paths.map((p) => p.fill)).toEqual(['#ff000080', '#00ff00']);
  });

  it('normalizes the colors', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('#ABCF')).toBe('#aabbcc');
    expect(normalizeColor('#aabbccff')).toBe('#aabbcc');
    expect(normalizeColor('#AABBCC80')).toBe('#aabbcc80');
    expect(normalizeColor('#abc8')).toBe('#aabbcc88');
    expect(normalizeColor('rgb(10, 20, 30)')).toBe('#0a141e');
    expect(normalizeColor('rgb(10 20 30 / 50%)')).toBe('#0a141e80');
    expect(normalizeColor('rgba(100%, 0%, 0%, 1)')).toBe('#ff0000');
    expect(normalizeColor('rgb(300, -5, 0)')).toBe('#ff0000');
    expect(normalizeColor(' White ')).toBe('#ffffff');
    expect(normalizeColor('transparent')).toBe('#00000000');
    for (const bad of [
      '',
      '#12',
      '#12345',
      'rgb(1,2)',
      'rgb(a,b,c)',
      'url(#a)',
      'papayawhip',
      'inherit',
    ])
      expect(normalizeColor(bad), bad).toBeUndefined();
  });
});

describe('the icon name (decision 7)', () => {
  it.each([
    ['Check Circle_Fill.svg', 'check-circle_fill'],
    ['check.svg', 'check'],
    ['CHECK.SVG', 'check'],
    ['icons/ui/Arrow Left (2).svg', 'arrow-left-2'],
    ['C:\\icons\\Arrow--Right.svg', 'arrow-right'],
    ['  --home--  .svg', 'home'],
    ['\u00edcone.svg', 'cone'],
    ['a.b.svg', 'a-b'],
    ['no-extension', 'no-extension'],
    ['___.svg', '___'],
    ['!!!.svg', ''],
  ])('%s → "%s"', (file, name) => {
    expect(iconNameFromFile(file)).toBe(name);
  });

  it('takes the name from the file name', () => {
    expect(
      convert(svg('<path d="M0 0h4v4z"/>'), { file: 'Check Circle_Fill.svg' }).name,
    ).toBe('check-circle_fill');
  });

  it('the name option wins over the file name', () => {
    const result = convert(svg('<path d="M0 0h4v4z"/>'), {
      file: 'a.svg',
      name: 'custom_name',
    });
    expect(result.name).toBe('custom_name');
  });

  it('has no name when neither is given', () => {
    expect(convert(svg('<path d="M0 0h4v4z"/>'))).not.toHaveProperty('name');
  });

  it.each([
    [{ file: '!!!.svg' }, '""'],
    [{ file: '_hidden.svg' }, '"_hidden"'],
    [{ name: 'Not Valid' }, '"Not Valid"'],
    [{ name: '' }, '""'],
  ])('an invalid name is an error: %j', (options, shown) => {
    expect(problemsOf(svg('<path d="M0 0h4v4z"/>'), options)).toEqual([
      `the icon name ${shown} is invalid; use [a-z0-9][a-z0-9-_]*`,
    ]);
  });

  it('reports the name together with the other problems of the file', () => {
    const problems = problemsOf(svg('<use/>'), { file: '!!!.svg' });
    expect(problems).toHaveLength(2);
  });
});

describe('the result is a valid icons file entry', () => {
  const files = readdirSync(FIXTURES)
    .filter((f) => /^icon-.*\.svg$/.test(f))
    .sort();

  it('has the six fixtures of the stage', () => {
    expect(files).toEqual([
      'icon-current-color.svg',
      'icon-figma-evenodd.svg',
      'icon-flag.svg',
      'icon-shapes.svg',
      'icon-stroked.svg',
      'icon-transform.svg',
    ]);
  });

  it.each(files.filter((f) => f !== 'icon-transform.svg'))(
    'parseIconsFile accepts %s inside a version 3 file',
    (file) => {
      const result = convert(fixture(file), { file, defaultViewBox: [24, 24] });
      const parsed = parseIconsFile({
        format: 'mapping-icons',
        formatVersion: 3,
        viewBox: [24, 24],
        icons: { [result.name as string]: result.icon },
      });
      expect(parsed.ok, parsed.ok ? '' : parsed.errors.join('; ')).toBe(true);
    },
  );

  it('the entry survives a JSON round trip unchanged', () => {
    for (const file of files.filter((f) => f !== 'icon-transform.svg')) {
      const { icon } = convert(fixture(file), { file });
      expect(JSON.parse(JSON.stringify(icon))).toEqual(icon);
    }
  });
});
