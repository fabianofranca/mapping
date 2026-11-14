// R1 (#1106, decisions 5 to 7 of #1096): the validation of the direction keys — `anchors.start`/`end`,
// `font.align` `start`/`end`, `direction` per node, `$direction`, `mirror` of `icon` and `path`.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import { validateComponent } from '../../../src/model/components/parseComponent';

const V4 = 'only allowed with formatVersion 4';

function withChild(child: Record<string, unknown>, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [child] },
  };
}

const rect = (extra: Record<string, unknown>) => ({
  type: 'rect',
  width: 10,
  height: 10,
  ...extra,
});

describe('anchors.start and anchors.end', () => {
  it('are valid in v4, with a number or expression', () => {
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, end: { $field: 'x' } } }))),
    ).toEqual([]);
  });

  it('start with left and end with right on the same node are an error', () => {
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, left: 2 } }))),
    ).toEqual(['template.children[0].anchors.start: does not combine with left']);
    expect(validateComponent(withChild(rect({ anchors: { end: 4, right: 2 } })))).toEqual(
      ['template.children[0].anchors.end: does not combine with right'],
    );
    // start with right (and end with left) do not collide in ltr: they are valid
    expect(
      validateComponent(withChild(rect({ anchors: { start: 4, right: 2 } }))),
    ).toEqual([]);
  });

  it('in a version 1 to 3, the version error on the key path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ anchors: { start: 4, end: 5 } }), version)),
      ).toEqual([
        `template.children[0].anchors.start: ${V4}`,
        `template.children[0].anchors.end: ${V4}`,
      ]);
  });
});

describe('font.align start and end', () => {
  const text = (align: unknown) => ({
    type: 'text',
    text: 'a',
    font: { align },
  });

  it('are valid in v4 (literal and by expression)', () => {
    expect(validateComponent(withChild(text('start')))).toEqual([]);
    expect(validateComponent(withChild(text('end')))).toEqual([]);
    expect(validateComponent(withChild(text({ $field: 'a', default: 'start' })))).toEqual(
      [],
    );
  });

  it('a value outside the set is an error', () => {
    expect(validateComponent(withChild(text('meio')))).toEqual([
      'template.children[0].font.align: expected one of: left, center, right, justify, start, end',
    ]);
  });

  it('in a version 1 to 3 the literal start/end gives the version error', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(text('start'), version))).toEqual([
        `template.children[0].font.align: ${V4}`,
      ]);
  });
});

describe('direction per node', () => {
  it('accepts ltr and rtl on any node', () => {
    for (const d of ['ltr', 'rtl'])
      expect(validateComponent(withChild(rect({ direction: d })))).toEqual([]);
  });

  it('a literal outside ltr/rtl is an error (expected one of: ltr, rtl)', () => {
    expect(validateComponent(withChild(rect({ direction: 'auto' })))).toEqual([
      'template.children[0].direction: expected one of: ltr, rtl',
    ]);
  });

  it('in a version 1 to 3, the version error on the key path', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(rect({ direction: 'rtl' }), version))).toEqual([
        `template.children[0].direction: ${V4}`,
      ]);
  });
});

describe('the $direction condition', () => {
  it('is valid in visible, $if, $and, $or and $not', () => {
    const issues = validateComponent(
      withChild(
        rect({
          visible: {
            $and: [{ $direction: 'rtl' }, { $not: { $direction: 'ltr' } }],
          },
          fill: { $if: { $direction: 'rtl' }, then: '#fff', else: '#000' },
          opacity: { $if: { $or: [{ $direction: 'rtl' }] }, then: 1, else: 0.5 },
        }),
      ),
    );
    expect(issues).toEqual([]);
  });

  it('a value outside ltr/rtl is an error', () => {
    expect(
      validateComponent(withChild(rect({ visible: { $direction: 'auto' } }))),
    ).toEqual(['template.children[0].visible.$direction: expected one of: ltr, rtl']);
  });

  it('in a version 1 to 3, the version error on the key path', () => {
    for (const version of [1, 2, 3])
      expect(
        validateComponent(withChild(rect({ visible: { $direction: 'rtl' } }), version)),
      ).toContain(`template.children[0].visible.$direction: ${V4}`);
  });
});

describe('mirror on icon and path', () => {
  const path = (extra: Record<string, unknown>) => ({
    type: 'path',
    d: 'M0 0L1 1',
    viewBox: [10, 10],
    ...extra,
  });

  it('are valid in v4: literal, field and $direction', () => {
    expect(validateComponent(withChild(path({ mirror: true })))).toEqual([]);
    expect(
      validateComponent(
        withChild({ type: 'icon', name: 'back', mirror: { $direction: 'rtl' } }),
      ),
    ).toEqual([]);
    expect(
      validateComponent(
        withChild({ type: 'icon', name: 'back', mirror: { $field: 'm' } }),
      ),
    ).toEqual([]);
  });

  it('mirror is not a rect key (unknown key)', () => {
    expect(validateComponent(withChild(rect({ mirror: true })))).toEqual([
      'template.children[0].mirror: unknown key: mirror',
    ]);
  });

  it('path with mirror in a version 1 to 3 gives the version error', () => {
    for (const version of [1, 2, 3])
      expect(validateComponent(withChild(path({ mirror: true }), version))).toEqual([
        `template.children[0].mirror: ${V4}`,
      ]);
  });
});
