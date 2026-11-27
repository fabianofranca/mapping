// Format 4, stage #2916, phase RT1: `font.fit` and `font.fitSizes` (text that shrinks to fit its
// width) — the validator, the combination with `runs` and `docs/component.schema.json`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { checkSchema } from '../../support/jsonSchema';

const V4 = 'only allowed with formatVersion 4';
const FONT = 'template.children[0].font';
const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

function component(node: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [node] },
  };
}

const withFont = (font: unknown, version = 4) =>
  component({ type: 'text', text: 'x', font }, version);

describe('RT1: font.fit and font.fitSizes — versions', () => {
  it('are valid in formatVersion 4', () => {
    expect(
      validateComponent(withFont({ size: 41, fit: 'shrink', fitSizes: [32, 29] })),
    ).toEqual([]);
    expect(validateComponent(withFont({ size: 41, fit: 'none' }))).toEqual([]);
  });

  it('in versions 1 to 3 give `only allowed with formatVersion 4` at each key', () => {
    for (const version of [1, 2, 3]) {
      const errors = validateComponent(
        withFont({ size: 41, fit: 'shrink', fitSizes: [32, 29] }, version),
      );
      expect(errors, `v${version}`).toEqual(
        expect.arrayContaining([`${FONT}.fit: ${V4}`, `${FONT}.fitSizes: ${V4}`]),
      );
    }
  });
});

describe('RT1: font.fit', () => {
  const errorsOf = (fit: unknown) =>
    validateComponent(withFont({ size: 41, fit, fitSizes: [32] }));

  it('accepts "none", "shrink" and an expression', () => {
    expect(errorsOf('none')).toEqual([]);
    expect(errorsOf('shrink')).toEqual([]);
    expect(errorsOf({ $field: 'fit', default: 'shrink' })).toEqual([]);
    expect(errorsOf({ $if: { $field: 'on' }, then: 'shrink', else: 'none' })).toEqual([]);
  });

  it('refuses another value', () => {
    expect(errorsOf('grow')).toEqual([`${FONT}.fit: expected one of: none, shrink`]);
    expect(errorsOf(true)).toEqual([`${FONT}.fit: expected one of: none, shrink`]);
  });
});

describe('RT1: font.fitSizes', () => {
  const errorsOf = (fitSizes: unknown, fit: unknown = 'shrink') =>
    validateComponent(withFont({ size: 41, fit, fitSizes }));

  it('accepts a list of sizes from the largest to the smallest, and number expressions', () => {
    expect(errorsOf([32])).toEqual([]);
    expect(errorsOf([32, 29, 24.5])).toEqual([]);
    expect(errorsOf([{ $field: 'a' }, 29])).toEqual([]);
    expect(errorsOf([8, 7, 6, 5, 4, 3, 2, 1])).toEqual([]);
  });

  it('`fit: "shrink"` without `fitSizes` is an error', () => {
    expect(validateComponent(withFont({ size: 41, fit: 'shrink' }))).toEqual([
      `${FONT}.fitSizes: required with fit "shrink"`,
    ]);
  });

  it('`fit` from an expression, or "none", does not require `fitSizes`', () => {
    expect(validateComponent(withFont({ size: 41, fit: 'none' }))).toEqual([]);
    expect(
      validateComponent(
        withFont({ size: 41, fit: { $field: 'fit', default: 'shrink' } }),
      ),
    ).toEqual([]);
  });

  it('`fitSizes` without `fit` is valid (it has no effect)', () => {
    expect(validateComponent(withFont({ size: 41, fitSizes: [32, 29] }))).toEqual([]);
  });

  it('[29, 32] is not from the largest to the smallest', () => {
    expect(errorsOf([29, 32])).toEqual([
      `${FONT}.fitSizes: expected sizes from the largest to the smallest`,
    ]);
    expect(errorsOf([32, 32])).toEqual([
      `${FONT}.fitSizes: expected sizes from the largest to the smallest`,
    ]);
  });

  it('an expression item is not compared with the literal ones', () => {
    expect(errorsOf([29, { $field: 'a' }, 32])).toEqual([]);
  });

  it('an empty list, more than 8 items or something that is not a list is an error', () => {
    const LIST = `${FONT}.fitSizes: expected a list of 1 to 8 sizes`;
    expect(errorsOf([], 'none')).toEqual([LIST]);
    expect(errorsOf([9, 8, 7, 6, 5, 4, 3, 2, 1], 'none')).toEqual([LIST]);
    expect(errorsOf(32, 'none')).toEqual([LIST]);
  });

  it('an item that is 0, negative or not a number is an error, at the item path', () => {
    const POSITIVE = 'expected a number greater than 0';
    expect(errorsOf([32, 0])).toEqual([`${FONT}.fitSizes[1]: ${POSITIVE}`]);
    expect(errorsOf([-1])).toEqual([`${FONT}.fitSizes[0]: ${POSITIVE}`]);
    expect(errorsOf(['big'])).toEqual([`${FONT}.fitSizes[0]: ${POSITIVE}`]);
  });
});

describe('RT1: font.fit does not combine with runs', () => {
  const rich = (font: unknown) =>
    component({ type: 'text', runs: [{ text: 'x' }], font });

  it('a literal "shrink" with `runs` is an error', () => {
    expect(validateComponent(rich({ size: 41, fit: 'shrink', fitSizes: [32] }))).toEqual([
      `${FONT}.fit: does not combine with runs`,
    ]);
  });

  it('"none" and an expression are accepted with `runs`', () => {
    expect(validateComponent(rich({ size: 41, fit: 'none' }))).toEqual([]);
    expect(
      validateComponent(
        rich({ size: 41, fit: { $field: 'fit', default: 'shrink' }, fitSizes: [32] }),
      ),
    ).toEqual([]);
  });
});

describe('RT1: docs/component.schema.json', () => {
  it('accepts the valid forms, and the parser agrees', () => {
    for (const font of [
      { size: 41, fit: 'shrink', fitSizes: [32, 29] },
      { size: 41, fit: 'none' },
      {
        size: 41,
        fit: { $field: 'fit', default: 'shrink' },
        fitSizes: [32, { $field: 'a' }],
      },
      { size: 41, fitSizes: [32] },
    ]) {
      const c = withFont(font);
      expect(checkSchema(schema, c), JSON.stringify(font)).toEqual([]);
      expect(parseComponent(c).ok, JSON.stringify(font)).toBe(true);
    }
  });

  it('refuses another `fit`, an empty list, more than 8 items and an item of 0', () => {
    for (const font of [
      { size: 41, fit: 'grow' },
      { size: 41, fit: 'shrink', fitSizes: [] },
      { size: 41, fit: 'shrink', fitSizes: [9, 8, 7, 6, 5, 4, 3, 2, 1] },
      { size: 41, fit: 'shrink', fitSizes: [32, 0] },
    ])
      expect(
        checkSchema(schema, withFont(font)).length,
        JSON.stringify(font),
      ).toBeGreaterThan(0);
  });
});
