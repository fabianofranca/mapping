// FN2: `$tokenNamed` (a token named by a field value, format 4) — validator.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';
const WRONG_PLACE = '$tokenNamed is only valid where a color or font family is expected';

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

const named = (extra: Record<string, unknown> = {}) => ({
  $tokenNamed: { $field: 'cor' },
  ...extra,
});
const text = (extra: Record<string, unknown>) => ({ type: 'text', text: 'x', ...extra });
const rect = (extra: Record<string, unknown>) => ({ type: 'rect', ...extra });

describe('$tokenNamed: where it is valid (decision 8)', () => {
  it('is valid in the color positions', () => {
    const d = { default: { $token: 'primary' } };
    for (const child of [
      rect({ fill: named(d) }),
      text({ color: named() }),
      rect({ fill: '#fff', stroke: { color: named(d), width: 1 } }),
      rect({ fill: '#fff', shadow: { x: 0, y: 1, blur: 2, color: named() } }),
      rect({
        fill: {
          type: 'linear',
          angle: 90,
          stops: [
            { offset: 0, color: named() },
            { offset: 1, color: '#000' },
          ],
        },
      }),
    ])
      expect(validateComponent(withChild(child))).toEqual([]);
  });

  it('is valid in a run color and family, and in font.family', () => {
    const run = { text: 'a', color: named(), family: named() };
    expect(validateComponent(withChild({ type: 'text', runs: [run] }))).toEqual([]);
    expect(
      validateComponent(
        withChild(
          text({
            font: { family: named({ default: { $token: 'font-sans' } }), size: 14 },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('is the error of decision 8 in font.size, text and visible', () => {
    expect(validateComponent(withChild(text({ font: { size: named() } })))).toEqual([
      `template.children[0].font.size: ${WRONG_PLACE}`,
    ]);
    expect(validateComponent(withChild({ type: 'text', text: named() }))).toEqual([
      `template.children[0].text: ${WRONG_PLACE}`,
    ]);
    expect(validateComponent(withChild(text({ visible: named() })))).toEqual([
      `template.children[0].visible: ${WRONG_PLACE}`,
    ]);
  });
});

describe('$tokenNamed: shape', () => {
  it('a third key is an unknown key', () => {
    expect(validateComponent(withChild(text({ color: named({ alpha: 0.5 }) })))).toEqual([
      'template.children[0].color.alpha: unknown key: alpha',
    ]);
  });

  it('the name is a text expression and default is an expression', () => {
    expect(
      validateComponent(
        withChild(
          text({
            color: {
              $tokenNamed: { $concat: ['on-', { $field: 'cor' }] },
              default: { $field: 'fallback', default: '#111' },
            },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it('does not count as a reference to a token: nothing is checked against the library', () => {
    const file = validateComponent(withChild(text({ color: named() })));
    expect(file).toEqual([]);
  });
});

describe('$tokenNamed: version', () => {
  it('in v1 to v3 it is only allowed with formatVersion 4, at the key path', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(text({ color: named() }), version))).toEqual([
        `template.children[0].color.$tokenNamed: ${V4}`,
      ]);
  });
});
