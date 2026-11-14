// Format 4, FX1: `font.verticalAlign: "cap-middle"` (center by the capital height).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { walk, type TextNode } from '../../../src/model/components/scene';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

const V4 = 'only allowed with formatVersion 4';

function component(verticalAlign: unknown, version = 4): Record<string, unknown> {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 30 },
    template: {
      type: 'frame',
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height: 30,
          text: 'Ok',
          font: { size: 13, lineHeight: 1.2, verticalAlign },
        },
      ],
    },
  };
}

describe('font.verticalAlign: "cap-middle"', () => {
  it('is accepted in format 4, literal and in $switch', () => {
    expect(validateComponent(component('cap-middle'))).toEqual([]);
    expect(
      validateComponent(
        component({
          $switch: 'modo',
          cases: { a: 'cap-middle' },
          default: 'middle',
        }),
      ),
    ).toEqual([]);
  });

  it.each([1, 2, 3])(
    'in version %i the literal fails on the font.verticalAlign path',
    (version) => {
      expect(validateComponent(component('cap-middle', version))).toEqual([
        `template.children[0].font.verticalAlign: ${V4}`,
      ]);
    },
  );

  it('the usual values keep applying in any version', () => {
    for (const value of ['top', 'middle', 'bottom'])
      expect(validateComponent(component(value, 3))).toEqual([]);
  });

  it('an unknown value is still a set error', () => {
    expect(validateComponent(component('center'))).toEqual([
      'template.children[0].font.verticalAlign: expected one of: top, middle, bottom, cap-middle',
    ]);
  });

  it('the JSON schema accepts cap-middle, literal and in $switch', () => {
    expect(checkSchema(schema, component('cap-middle'))).toEqual([]);
    expect(
      checkSchema(
        schema,
        component({ $switch: 'modo', cases: { a: 'cap-middle' }, default: 'middle' }),
      ),
    ).toEqual([]);
  });

  it('the scene loads cap-middle, also coming from a $switch', () => {
    const style = (verticalAlign: unknown, values = {}): string | undefined => {
      const { root } = instantiate(
        component(verticalAlign) as never,
        values,
        { x: 0, y: 0, width: 100, height: 30 },
        { measure: approximateMeasurer },
      );
      return [...walk(root)].find((n): n is TextNode => n.type === 'text')?.style
        .verticalAlign;
    };
    expect(style('cap-middle')).toBe('cap-middle');
    expect(
      style(
        { $switch: 'modo', cases: { a: 'cap-middle' }, default: 'top' },
        { modo: 'a' },
      ),
    ).toBe('cap-middle');
    expect(style('middle')).toBe('middle');
  });

  it('in a version 1 to 3, cap-middle coming from an expression falls outside the set and falls to top', () => {
    const { root } = instantiate(
      component(
        { $switch: 'modo', cases: { a: 'cap-middle' }, default: 'top' },
        3,
      ) as never,
      { modo: 'a' },
      { x: 0, y: 0, width: 100, height: 30 },
      { measure: approximateMeasurer },
    );
    const text = [...walk(root)].find((n): n is TextNode => n.type === 'text');
    expect(text?.style.verticalAlign).toBe('top');
  });
});
