// Format 4, "drawing extras" stage (DX1): the radial and angular gradients in `fill` — validator.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];

function withFill(fill: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      children: [{ type: 'rect', width: 10, height: 10, fill }],
    },
  };
}

const FILL = 'template.children[0].fill';

describe('radial gradient', () => {
  it('is valid without the optional keys', () => {
    expect(validateComponent(withFill({ type: 'radial', stops: STOPS }))).toEqual([]);
  });

  it('is valid with center and radius', () => {
    expect(
      validateComponent(
        withFill({ type: 'radial', center: [0.25, 1], radius: 12.5, stops: STOPS }),
      ),
    ).toEqual([]);
  });

  it('refuses a center that is not two numbers from 0 to 1, at its path', () => {
    for (const center of [
      [0.5],
      [0.5, 2],
      [-0.1, 0.5],
      'middle',
      [0.5, '0.5'],
      [0, 0, 0],
    ]) {
      expect(
        validateComponent(withFill({ type: 'radial', center, stops: STOPS })),
      ).toEqual([`${FILL}.center: expected two numbers from 0 to 1`]);
    }
  });

  it('refuses a radius that is not a number greater than 0, at its path', () => {
    for (const radius of [0, -3, '10', null]) {
      expect(
        validateComponent(withFill({ type: 'radial', radius, stops: STOPS })),
      ).toEqual([`${FILL}.radius: expected a number greater than 0`]);
    }
  });

  it('does not accept the angle (it belongs to the linear and angular ones)', () => {
    expect(
      validateComponent(withFill({ type: 'radial', angle: 90, stops: STOPS })),
    ).toEqual([`${FILL}.angle: unknown key: angle`]);
  });
});

describe('angular gradient', () => {
  it('is valid without the optional keys', () => {
    expect(validateComponent(withFill({ type: 'angular', stops: STOPS }))).toEqual([]);
  });

  it('is valid with center and angle', () => {
    expect(
      validateComponent(
        withFill({ type: 'angular', center: [0.5, 0.5], angle: -90, stops: STOPS }),
      ),
    ).toEqual([]);
  });

  it('refuses an angle that is not a number, at its path', () => {
    expect(
      validateComponent(withFill({ type: 'angular', angle: 'up', stops: STOPS })),
    ).toEqual([`${FILL}.angle: expected a number`]);
  });

  it('refuses a center out of range, at its path', () => {
    expect(
      validateComponent(withFill({ type: 'angular', center: [1.5, 0], stops: STOPS })),
    ).toEqual([`${FILL}.center: expected two numbers from 0 to 1`]);
  });

  it('does not accept the radius', () => {
    expect(
      validateComponent(withFill({ type: 'angular', radius: 4, stops: STOPS })),
    ).toEqual([`${FILL}.radius: unknown key: radius`]);
  });
});

describe('the stops of the three types', () => {
  it('refuse fewer than 2 stops', () => {
    for (const type of ['radial', 'angular']) {
      expect(
        validateComponent(withFill({ type, stops: [{ offset: 0, color: '#000' }] })),
      ).toEqual([`${FILL}.stops: expected at least 2 stops`]);
    }
  });

  it('check the offset and accept an expression as the color', () => {
    expect(
      validateComponent(
        withFill({
          type: 'radial',
          stops: [
            { offset: 2, color: '#000' },
            { offset: 1, color: { $token: 'brand' } },
          ],
        }),
      ),
    ).toEqual([`${FILL}.stops[0].offset: expected a number between 0 and 1`]);
  });

  it('collect the $token references of the stop colors', () => {
    const r = parseComponent(
      withFill({
        type: 'angular',
        stops: [
          { offset: 0, color: { $token: 'a' } },
          { offset: 1, color: { $field: 'c', default: '#000' } },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].map((x) => [x.path, x.name])).toEqual([
      [`${FILL}.stops[0].color`, 'a'],
    ]);
  });
});

describe('the type', () => {
  it('refuses a type outside the set, with the three names', () => {
    expect(validateComponent(withFill({ type: 'conic', stops: STOPS }))).toEqual([
      `${FILL}.type: expected "linear", "radial" or "angular"`,
    ]);
    expect(validateComponent(withFill({ stops: STOPS }))).toEqual([
      `${FILL}.type: expected "linear", "radial" or "angular"`,
    ]);
  });

  it('keeps the linear one valid in every version', () => {
    for (const version of [1, 2, 3, 4]) {
      expect(
        validateComponent(withFill({ type: 'linear', angle: 90, stops: STOPS }, version)),
      ).toEqual([]);
    }
  });
});

describe('versions 1 to 3', () => {
  it('refuse radial and angular at the key path of `type`', () => {
    for (const version of [1, 2, 3]) {
      for (const type of ['radial', 'angular']) {
        expect(validateComponent(withFill({ type, stops: STOPS }, version))).toEqual([
          `${FILL}.type: ${V4}`,
        ]);
      }
    }
  });

  it('refuse them inside a $switch and a $if (each result at its path)', () => {
    const fill = {
      $switch: 'kind',
      cases: { a: { type: 'radial', stops: STOPS }, b: '#fff' },
      default: { type: 'angular', stops: STOPS },
    };
    expect(validateComponent(withFill(fill, 3))).toEqual(
      expect.arrayContaining([
        `${FILL}.cases.a.type: ${V4}`,
        `${FILL}.default.type: ${V4}`,
      ]),
    );
    const cond = {
      $if: { $field: 'on' },
      then: { type: 'radial', stops: STOPS },
      else: '#000',
    };
    expect(validateComponent(withFill(cond, 3))).toContain(`${FILL}.then.type: ${V4}`);
  });
});

describe('a gradient as the result of an expression', () => {
  it('is valid in v4 as a $switch result and as a $if result', () => {
    const sw = {
      $switch: 'kind',
      cases: {
        radial: { type: 'radial', stops: STOPS },
        angular: { type: 'angular', angle: 45, stops: STOPS },
        linear: { type: 'linear', angle: 0, stops: STOPS },
      },
      default: '#ccc',
    };
    expect(validateComponent(withFill(sw))).toEqual([]);
    const cond = {
      $if: { $field: 'on' },
      then: { type: 'angular', stops: STOPS },
      else: { type: 'radial', stops: STOPS },
    };
    expect(validateComponent(withFill(cond))).toEqual([]);
  });

  it('checks the gradient inside the $switch at its own path', () => {
    const sw = {
      $switch: 'kind',
      cases: { radial: { type: 'radial', radius: 0, stops: STOPS } },
    };
    expect(validateComponent(withFill(sw))).toEqual([
      `${FILL}.cases.radial.radius: expected a number greater than 0`,
    ]);
  });
});
