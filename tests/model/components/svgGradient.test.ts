// SG1 (stage #2847): linear and radial SVG gradients in `userSpaceOnUse`, with `gradientTransform`
// (`svgGradient.ts`, routed by `svgIcon.ts`): the points, the circle, the stops and the refusals.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { svgToIcon, type SvgIconOptions } from '../../../src/model/components/svgIcon';
import { parseIconsFile } from '../../../src/model/components/icons';
import { ptBRText } from '../../support/modelText';

const PAINT = join(__dirname, '../../fixtures/svg-icons/paint');
const fixture = (name: string): string => readFileSync(join(PAINT, name), 'utf8');
const svg = (body: string, attributes = 'viewBox="0 0 24 24"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;

const RED_BLUE = '<stop stop-color="#FF0000"/><stop offset="1" stop-color="#0000FF"/>';
const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];
const PATH = 'd="M0 0h24v24H0z"';

/** A file with one `linearGradient` (`g`, in userSpaceOnUse unless `attrs` says otherwise) on a path. */
function linear(attrs: string, stops = RED_BLUE): string {
  return svg(
    `<path fill="url(#g)" ${PATH}/><defs><linearGradient id="g" ${attrs}>${stops}</linearGradient></defs>`,
  );
}

function radial(attrs: string, stops = RED_BLUE): string {
  return svg(
    `<path fill="url(#g)" ${PATH}/><defs><radialGradient id="g" ${attrs}>${stops}</radialGradient></defs>`,
  );
}

const USER = 'gradientUnits="userSpaceOnUse"';

function fillOf(text: string, options: SvgIconOptions = {}): unknown {
  const result = svgToIcon(text, options);
  if (!result.ok) throw new Error(result.problems.map((p) => p.text).join('; '));
  return result.icon.paths[0]?.fill;
}

const problemsOf = (text: string, options: SvgIconOptions = {}): string[] => {
  const result = svgToIcon(text, options);
  return result.ok ? [] : result.problems.map((p) => p.text);
};

describe('a linear gradient in userSpaceOnUse', () => {
  it('figma form: two points and two stops', () => {
    expect(fillOf(linear(`x1="0" y1="0" x2="24" y2="0" ${USER}`))).toEqual({
      type: 'linear',
      from: [0, 0],
      to: [24, 0],
      stops: STOPS,
    });
  });

  it('a rotation moves both points (rotate(90 12 12) on (0, 12) to (24, 12))', () => {
    const fill = fillOf(
      linear(
        `x1="0" y1="12" x2="24" y2="12" ${USER} gradientTransform="rotate(90 12 12)"`,
      ),
    );
    expect(fill).toMatchObject({ type: 'linear', from: [12, 0], to: [12, 24] });
  });

  it('a non-uniform scale keeps the isolines: scale(2 1) on (0, 0) to (1, 1) gives to (0.8, 1.6)', () => {
    const fill = fillOf(
      linear(`x1="0" y1="0" x2="1" y2="1" ${USER} gradientTransform="scale(2 1)"`),
    );
    expect(fill).toMatchObject({ type: 'linear', from: [0, 0], to: [0.8, 1.6] });
  });

  it('percentages are of the viewBox: x2="50%" on 24 wide is 12, y of its height', () => {
    const fill = fillOf(
      svg(
        `<path fill="url(#g)" d="M0 0h10v10z"/><defs><linearGradient id="g" x1="0" y1="25%" x2="50%" y2="25%" ${USER}>${RED_BLUE}</linearGradient></defs>`,
        'viewBox="0 0 24 40"',
      ),
    );
    expect(fill).toMatchObject({ from: [0, 10], to: [12, 10] });
  });

  it('the defaults are 0%, 0%, 100% and 0%', () => {
    expect(fillOf(linear(USER))).toMatchObject({ from: [0, 0], to: [24, 0] });
  });

  it('a translation moves the points', () => {
    const fill = fillOf(
      linear(`x1="0" y1="0" x2="10" y2="0" ${USER} gradientTransform="translate(2 3)"`),
    );
    expect(fill).toMatchObject({ from: [2, 3], to: [12, 3] });
  });

  it('P1 equal to P2 paints the last stop color', () => {
    const text = linear(`x1="5" y1="5" x2="5" y2="5" ${USER}`);
    expect(fillOf(text, { colors: 'keep' })).toBe('#0000ff');
  });
});

describe('a radial gradient in userSpaceOnUse', () => {
  it('figma form: center and radius from the transform', () => {
    const fill = fillOf(
      radial(
        `cx="0" cy="0" r="1" ${USER} gradientTransform="translate(12 12) rotate(90) scale(4)"`,
      ),
    );
    expect(fill).toEqual({ type: 'radial', center: [0.5, 0.5], radius: 4, stops: STOPS });
  });

  it('the defaults are 50%, 50% and 50% (of the diagonal measure)', () => {
    expect(fillOf(radial(USER))).toMatchObject({ center: [0.5, 0.5], radius: 12 });
  });

  it('writes center and radius even when they are the defaults', () => {
    const fill = fillOf(radial(`cx="12" cy="12" r="12" ${USER}`)) as object;
    expect(Object.keys(fill)).toEqual(['type', 'center', 'radius', 'stops']);
  });

  it('a different scale per axis is an ellipse', () => {
    expect(
      problemsOf(
        radial(
          `cx="0" cy="0" r="1" ${USER} gradientTransform="translate(12 12) rotate(90) scale(4 2)"`,
        ),
      ),
    ).toEqual([
      'unsupported in SVG: radialGradient g is an ellipse (only a circle converts)',
    ]);
  });

  it('a skew is an ellipse too', () => {
    expect(
      problemsOf(radial(`cx="12" cy="12" r="5" ${USER} gradientTransform="skewX(30)"`)),
    ).toEqual([
      'unsupported in SVG: radialGradient g is an ellipse (only a circle converts)',
    ]);
  });

  it('r = 0 paints the last stop color', () => {
    expect(fillOf(radial(`cx="12" cy="12" r="0" ${USER}`), { colors: 'keep' })).toBe(
      '#0000ff',
    );
  });

  it('the ellipse message is translated', () => {
    const result = svgToIcon(
      radial(`cx="0" cy="0" r="1" ${USER} gradientTransform="scale(4 2)"`),
    );
    if (result.ok) throw new Error('expected a refusal');
    const [problem] = result.problems;
    // portuguese-guard:begin the object of the test is the pt-BR rendering of the model message
    expect(problem && ptBRText(problem)).toBe(
      'sem suporte no SVG: radialGradient g é uma elipse (só um círculo converte)',
    );
    // portuguese-guard:end
  });
});

describe('the stops', () => {
  const fillWith = (stops: string): unknown =>
    fillOf(linear(`x1="0" y1="0" x2="24" y2="0" ${USER}`, stops));

  it('stop-opacity multiplies into the alpha: 0.5 writes #ff000080', () => {
    const fill = fillWith(
      '<stop stop-color="#FF0000" stop-opacity="0.5"/><stop offset="1" stop-color="#0000FF"/>',
    ) as { stops: unknown[] };
    expect(fill.stops[0]).toEqual({ offset: 0, color: '#ff000080' });
  });

  it('a fully transparent stop stays #rrggbb00', () => {
    const fill = fillWith(
      '<stop stop-color="#FF0000" stop-opacity="0"/><stop offset="1" stop-color="#0000FF"/>',
    ) as { stops: unknown[] };
    expect(fill.stops[0]).toEqual({ offset: 0, color: '#ff000000' });
  });

  it('stop-opacity as a percentage and inside style', () => {
    const fill = fillWith(
      '<stop style="stop-color:#00ff00;stop-opacity:50%"/><stop offset="1"/>',
    ) as { stops: unknown[] };
    expect(fill.stops).toEqual([
      { offset: 0, color: '#00ff0080' },
      { offset: 1, color: '#000000' },
    ]);
  });

  it('offset="50%" is 0.5', () => {
    const fill = fillWith(
      '<stop stop-color="#FF0000"/><stop offset="50%" stop-color="#00FF00"/><stop offset="1" stop-color="#0000FF"/>',
    ) as { stops: { offset: number }[] };
    expect(fill.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it('a smaller offset after a larger one is raised to it, and the range is clamped', () => {
    const fill = fillWith(
      '<stop offset="-1" stop-color="#FF0000"/><stop offset="0.6" stop-color="#00FF00"/><stop offset="0.2" stop-color="#0000FF"/><stop offset="3" stop-color="#FFFFFF"/>',
    ) as { stops: { offset: number }[] };
    expect(fill.stops.map((s) => s.offset)).toEqual([0, 0.6, 0.6, 1]);
  });

  it('currentColor in a stop is unsupported', () => {
    expect(
      problemsOf(
        linear(
          `x1="0" y1="0" x2="24" y2="0" ${USER}`,
          '<stop stop-color="currentColor"/><stop offset="1" stop-color="#000"/>',
        ),
      ),
    ).toEqual(['unsupported in SVG: stop stop-color']);
  });

  it('a color that does not parse is an invalid value', () => {
    expect(
      problemsOf(
        linear(
          `x1="0" y1="0" x2="24" y2="0" ${USER}`,
          '<stop stop-color="papayawhip"/><stop offset="1" stop-color="#000"/>',
        ),
      ),
    ).toEqual(['invalid value in SVG: stop stop-color="papayawhip"']);
  });

  it('a stop attribute, a stop value or a child that is not a stop is named', () => {
    expect(
      problemsOf(
        linear(
          `x1="0" y1="0" x2="24" y2="0" ${USER}`,
          '<stop stop-color="#000" foo="1"/><stop offset="x"/><animate/>',
        ),
      ),
    ).toEqual([
      'unsupported in SVG: stop foo',
      'invalid value in SVG: stop offset="x"',
      'unsupported in SVG: animate',
    ]);
  });

  it('one stop gives that literal color', () => {
    const text = linear(
      `x1="0" y1="0" x2="24" y2="0" ${USER}`,
      '<stop stop-color="#FF0000"/>',
    );
    expect(fillOf(text, { colors: 'keep' })).toBe('#ff0000');
  });

  it('no stop gives fill false', () => {
    const text = svg(
      `<path fill="url(#g)" stroke="#00f" ${PATH}/><defs><linearGradient id="g" ${USER}/></defs>`,
    );
    expect(fillOf(text, { colors: 'keep' })).toBe(false);
  });
});

describe('what a gradient refuses', () => {
  const at = `x1="0" y1="0" x2="24" y2="0"`;

  it.each([
    [
      'spreadMethod="reflect"',
      `${at} ${USER} spreadMethod="reflect"`,
      'linearGradient spreadMethod',
    ],
    [
      'spreadMethod="repeat"',
      `${at} ${USER} spreadMethod="repeat"`,
      'linearGradient spreadMethod',
    ],
    ['href', `${at} ${USER} href="#other"`, 'linearGradient href'],
    ['xlink:href', `${at} ${USER} xlink:href="#other"`, 'linearGradient href'],
    ['an absent gradientUnits (until SG2)', at, 'linearGradient gradientUnits'],
    [
      'objectBoundingBox (until SG2)',
      `${at} gradientUnits="objectBoundingBox"`,
      'linearGradient gradientUnits',
    ],
    [
      'an unknown attribute',
      `${at} ${USER} color-interpolation="linearRGB"`,
      'linearGradient color-interpolation',
    ],
  ])('%s', (_name, attrs, named) => {
    expect(problemsOf(linear(attrs))).toEqual([`unsupported in SVG: ${named}`]);
  });

  it('a pad spreadMethod is accepted', () => {
    expect(fillOf(linear(`${at} ${USER} spreadMethod="pad"`))).toMatchObject({
      type: 'linear',
    });
  });

  it('a singular gradientTransform is an invalid value', () => {
    expect(problemsOf(linear(`${at} ${USER} gradientTransform="scale(0 1)"`))).toEqual([
      'invalid value in SVG: linearGradient gradientTransform="scale(0 1)"',
    ]);
  });

  it('a gradientTransform that does not parse is an invalid value', () => {
    expect(problemsOf(linear(`${at} ${USER} gradientTransform="spin(3)"`))).toEqual([
      'invalid value in SVG: linearGradient gradientTransform="spin(3)"',
    ]);
  });

  it('a coordinate that does not parse is an invalid value', () => {
    expect(problemsOf(linear(`x1="a" y1="0" x2="24" y2="0" ${USER}`))).toEqual([
      'invalid value in SVG: linearGradient x1="a"',
    ]);
  });

  it('a stop-less child other than stop is an unsupported element', () => {
    expect(problemsOf(linear(`${at} ${USER}`, '<stop/><filter id="f"/>'))).toEqual([
      'unsupported in SVG: filter',
    ]);
  });

  it('a focal point different from the center is unsupported', () => {
    expect(problemsOf(radial(`cx="12" cy="12" r="5" fx="10" ${USER}`))).toEqual([
      'unsupported in SVG: radialGradient fx',
    ]);
    expect(problemsOf(radial(`cx="12" cy="12" r="5" fy="10" ${USER}`))).toEqual([
      'unsupported in SVG: radialGradient fy',
    ]);
  });

  it('a focal point equal to the center, or an absent one, is accepted', () => {
    expect(fillOf(radial(`cx="12" cy="12" r="5" fx="12" fy="12" ${USER}`))).toMatchObject(
      {
        type: 'radial',
      },
    );
  });

  it('fr other than 0 is unsupported; fr="0" is accepted', () => {
    expect(problemsOf(radial(`cx="12" cy="12" r="5" fr="1" ${USER}`))).toEqual([
      'unsupported in SVG: radialGradient fr',
    ]);
    expect(fillOf(radial(`cx="12" cy="12" r="5" fr="0" ${USER}`))).toMatchObject({
      type: 'radial',
    });
  });

  it('an absent gradientUnits on a radial gradient names the radial element', () => {
    expect(problemsOf(radial(`cx="12" cy="12" r="5"`))).toEqual([
      'unsupported in SVG: radialGradient gradientUnits',
    ]);
  });

  it('a singular transform on a radial gradient is an invalid value', () => {
    expect(
      problemsOf(radial(`cx="12" cy="12" r="5" ${USER} gradientTransform="scale(1 0)"`)),
    ).toEqual(['invalid value in SVG: radialGradient gradientTransform="scale(1 0)"']);
  });

  it('a negative radius is an invalid value', () => {
    expect(problemsOf(radial(`cx="12" cy="12" r="-1" ${USER}`))).toEqual([
      'invalid value in SVG: radialGradient r="-1"',
    ]);
  });
});

describe('the paints that point at a gradient', () => {
  const def = `<linearGradient id="g" x1="0" y1="0" x2="24" y2="0" ${USER}>${RED_BLUE}</linearGradient>`;

  it('url(#x) with no definition is an invalid value', () => {
    expect(problemsOf(svg(`<path fill="url(#x)" ${PATH}/>`))).toEqual([
      'invalid value in SVG: path fill="url(#x)"',
    ]);
  });

  it('url(#x) that points at another element is the same invalid value', () => {
    expect(problemsOf(svg(`<path fill="url(#x)" ${PATH}/><pattern id="x"/>`))).toContain(
      'invalid value in SVG: path fill="url(#x)"',
    );
  });

  it('url(#x) #fff with no definition falls back to the color rule', () => {
    expect(fillOf(svg(`<path fill="url(#x) #fff" ${PATH}/>`))).toBe(true);
    expect(fillOf(svg(`<path fill="url(#x) #fff" ${PATH}/>`), { colors: 'keep' })).toBe(
      '#ffffff',
    );
  });

  it('url(#g) #fff with the definition uses the gradient', () => {
    expect(
      fillOf(svg(`<path fill="url(#g) #fff" ${PATH}/><defs>${def}</defs>`)),
    ).toMatchObject({ type: 'linear' });
  });

  it('a url written with quotes and spaces is the same paint', () => {
    expect(
      fillOf(svg(`<path fill="url( '#g' )" ${PATH}/><defs>${def}</defs>`)),
    ).toMatchObject({ type: 'linear' });
  });

  it('the id is case sensitive', () => {
    expect(problemsOf(svg(`<path fill="url(#G)" ${PATH}/><defs>${def}</defs>`))).toEqual([
      'invalid value in SVG: path fill="url(#G)"',
    ]);
  });

  it('a stroke that points at a gradient stays unsupported', () => {
    expect(
      problemsOf(svg(`<path stroke="url(#g)" ${PATH}/><defs>${def}</defs>`)),
    ).toEqual(['unsupported in SVG: path stroke']);
  });

  it('a gradient inherited from g or svg is applied to each path', () => {
    const result = svgToIcon(
      svg(
        `<g fill="url(#g)"><path d="M0 0h4v4z"/><rect width="5" height="5"/></g><defs>${def}</defs>`,
      ),
    );
    expect(result.ok && result.icon.paths.map((p) => p.fill)).toEqual([
      expect.objectContaining({ type: 'linear' }),
      expect.objectContaining({ type: 'linear' }),
    ]);
    const root = svgToIcon(
      svg(
        `<path d="M0 0h4v4z"/><defs>${def}</defs>`,
        'viewBox="0 0 24 24" fill="url(#g)"',
      ),
    );
    expect(root.ok && root.icon.paths[0]?.fill).toMatchObject({ type: 'linear' });
  });

  it('a line has no area, so its fill reference is not read', () => {
    const result = svgToIcon(
      svg(`<line x1="0" y1="0" x2="4" y2="4" stroke="#000" fill="url(#x)"/>`),
    );
    expect(result.ok).toBe(true);
  });

  it('the fill of a shape that is also referenced elsewhere is the same gradient', () => {
    const result = svgToIcon(
      svg(
        `<path fill="url(#g)" d="M0 0h4v4z"/><path fill="url(#g)" d="M8 8h4v4z"/><defs>${def}</defs>`,
      ),
    );
    expect(result.ok && result.icon.paths[0]?.fill).toEqual(
      result.ok && result.icon.paths[1]?.fill,
    );
  });
});

describe('the definitions', () => {
  const def = `<linearGradient id="g" x1="0" y1="0" x2="24" y2="0" ${USER}>${RED_BLUE}</linearGradient>`;

  it('an unused gradient is ignored, even an invalid one', () => {
    const text = svg(
      `<defs><linearGradient id="u" spreadMethod="reflect" href="#x"/></defs><path fill="#f00" ${PATH}/>`,
    );
    expect(svgToIcon(text).ok).toBe(true);
  });

  it('a gradient under svg, outside defs, works', () => {
    expect(fillOf(svg(`${def}<path fill="url(#g)" ${PATH}/>`))).toMatchObject({
      type: 'linear',
    });
  });

  it('a gradient under a g works and is never drawn', () => {
    const result = svgToIcon(svg(`<g>${def}<path fill="url(#g)" ${PATH}/></g>`));
    expect(result.ok && result.icon.paths).toHaveLength(1);
  });

  it('a filter inside defs is still unsupported', () => {
    expect(
      problemsOf(
        svg(`<defs><filter id="f"/>${def}</defs><path fill="url(#g)" ${PATH}/>`),
      ),
    ).toEqual(['unsupported in SVG: filter']);
  });

  it('a gradient from the fixtures converts and the icons file accepts it (formatVersion 4)', () => {
    for (const [file, type] of [
      ['gradient-linear.svg', 'linear'],
      ['gradient-radial.svg', 'radial'],
    ] as const) {
      const result = svgToIcon(fixture(file), { file, defaultViewBox: [24, 24] });
      expect(result.ok, file).toBe(true);
      if (!result.ok) continue;
      expect(result.icon.paths[0]?.fill).toMatchObject({ type });
      const parsed = parseIconsFile({
        format: 'mapping-icons',
        formatVersion: 4,
        viewBox: [24, 24],
        icons: { [result.name ?? 'x']: result.icon },
      });
      expect(parsed.ok, file).toBe(true);
    }
  });

  it('the elliptical fixture is an error that names the gradient', () => {
    expect(problemsOf(fixture('radial-ellipse.svg'))).toEqual([
      'unsupported in SVG: radialGradient paint0_radial_1_2 is an ellipse (only a circle converts)',
    ]);
  });
});

describe('the color rule with a gradient', () => {
  it('one solid #000000 path plus a gradient path keeps #000000, not true', () => {
    const text = svg(
      `<path fill="#000000" d="M0 0h4v4z"/><path fill="url(#g)" d="M8 8h4v4z"/><defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="0" ${USER}>${RED_BLUE}</linearGradient></defs>`,
    );
    const result = svgToIcon(text);
    expect(result.ok && result.icon.paths.map((p) => p.fill)).toEqual([
      '#000000',
      expect.objectContaining({ type: 'linear' }),
    ]);
  });

  it('currentColor is still the node color next to a gradient', () => {
    const text = svg(
      `<path fill="currentColor" d="M0 0h4v4z"/><path fill="url(#g)" d="M8 8h4v4z"/><defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="0" ${USER}>${RED_BLUE}</linearGradient></defs>`,
    );
    const result = svgToIcon(text);
    expect(result.ok && result.icon.paths[0]?.fill).toBe(true);
  });
});
