// FG6: `startAngle`/`sweepAngle` on `ellipse` — the validator (v4 only, `ellipse` only) and the
// engine (a scene `path` with the arc, stroke `center`, the ellipse's cap, join and dash).
import { describe, expect, it } from 'vitest';
import { arcPath } from '../../../src/model/components/arc';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import type { FrameNode, GroupNode, PathNode } from '../../../src/model/components/scene';
import { resolveTokens } from '../../../src/model/components/tokens';

const V4 = 'only allowed with formatVersion 4';

function raw(node: Record<string, unknown>, version = 4, extra = {}): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 40, height: 40 },
    template: { type: 'frame', children: [node] },
    ...extra,
  };
}

const ellipse = (extra: Record<string, unknown>, version = 4, file = {}) =>
  raw({ type: 'ellipse', ...extra }, version, file);

describe('FG6 validator', () => {
  it('literal, expression and number $token are valid on ellipse in v4', () => {
    expect(validateComponent(ellipse({ startAngle: -90, sweepAngle: 216 }))).toEqual([]);
    expect(
      validateComponent(
        ellipse({ sweepAngle: { $field: 'pct' }, startAngle: { $token: 'start' } }),
      ),
    ).toEqual([]);
  });

  it('on rect (and every other node) it is an unknown key', () => {
    const errors = validateComponent(raw({ type: 'rect', sweepAngle: 90 }));
    expect(errors.join('\n')).toContain('unknown key: sweepAngle');
    const start = validateComponent(raw({ type: 'rect', startAngle: 90 }));
    expect(start.join('\n')).toContain('unknown key: startAngle');
  });

  it('in v3 it is only allowed with formatVersion 4, at the key path', () => {
    const errors = validateComponent(ellipse({ sweepAngle: 90, startAngle: 0 }, 3));
    expect(errors.join('\n')).toContain(`template.children[0].sweepAngle: ${V4}`);
    expect(errors.join('\n')).toContain(`template.children[0].startAngle: ${V4}`);
  });

  it('a non-number literal is refused', () => {
    const errors = validateComponent(ellipse({ sweepAngle: 'wide' }));
    expect(errors.join('\n')).toContain('sweepAngle');
  });
});

const TOKENS = {
  modes: ['m'],
  values: { sweep: { m: 120 } },
};

function draw(
  node: Record<string, unknown>,
  values: Record<string, string | number> = {},
  tokens = resolveTokens(TOKENS, {}, 'm'),
) {
  const parsed = parseComponent(ellipse(node));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const out = instantiate(
    parsed.component,
    values,
    { x: 0, y: 0, width: 40, height: 40 },
    { measure: approximateMeasurer, tokens },
  );
  const root = out.root as FrameNode;
  return { node: root.children[0]!, messages: out.messages };
}

describe('FG6 engine', () => {
  it('without sweepAngle the ellipse is whole, as before', () => {
    expect(draw({ type: 'ellipse' }).node.type).toBe('ellipse');
    expect(draw({ type: 'ellipse', startAngle: 30 }).node.type).toBe('ellipse');
  });

  it('with sweepAngle it becomes a path with the arc, stroke center, cap, join and dash', () => {
    const { node } = draw({
      type: 'ellipse',
      sweepAngle: 216,
      stroke: {
        color: '#ff0000',
        width: 4,
        align: 'inside',
        cap: 'round',
        join: 'bevel',
        dash: [2, 3],
      },
    });
    expect(node.type).toBe('path');
    const path = node as PathNode;
    expect(path.d.startsWith('M')).toBe(true);
    expect(path.d).not.toMatch(/z/i);
    expect(path.stroke).toMatchObject({
      width: 4,
      align: 'center',
      cap: 'round',
      join: 'bevel',
      dash: [2, 3],
    });
    expect(path.width).toBe(40);
    expect(path.height).toBe(40);
  });

  it('the stroke align moves the arc inward (the whole ellipse stroke would sit there)', () => {
    const { node } = draw({
      type: 'ellipse',
      sweepAngle: 90,
      stroke: { color: '#000000', width: 4, align: 'inside' },
    });
    expect((node as PathNode).d.startsWith('M38 20')).toBe(true);
  });

  it('keeps the fill, and a $token or $field drives the sweep', () => {
    const { node } = draw({
      type: 'ellipse',
      fill: '#00ff00',
      sweepAngle: { $token: 'sweep' },
    });
    expect(node.fills).toHaveLength(1);
    const field = draw({ type: 'ellipse', sweepAngle: { $field: 'pct' } }, { pct: 360 });
    expect((field.node as PathNode).d.endsWith('Z')).toBe(true);
  });

  it('a zero sweep draws nothing (empty data)', () => {
    expect((draw({ type: 'ellipse', sweepAngle: 0 }).node as PathNode).d).toBe('');
  });

  it('an invalid expression value gives the warning and the default', () => {
    const bad = draw({ type: 'ellipse', sweepAngle: { $field: 'pct' } }, { pct: 'wide' });
    expect(bad.node.type).toBe('ellipse');
    expect(JSON.stringify(bad.messages)).toContain('sweepAngle');
    const start = draw(
      { type: 'ellipse', sweepAngle: 90, startAngle: { $field: 'at' } },
      { at: 'x' },
    );
    expect(JSON.stringify(start.messages)).toContain('startAngle');
    expect((start.node as PathNode).d.startsWith('M40 20')).toBe(true);
  });
});

describe('FG6 engine: the arc fill stays on the box', () => {
  const stroked = {
    type: 'ellipse',
    fill: '#ff0000',
    sweepAngle: 180,
    stroke: { color: '#0000ff', width: 2, align: 'outside', offset: 4 },
  };

  it('a filled arc whose stroke is moved draws the fill at the box and the stroke apart', () => {
    const { node } = draw(stroked);
    expect(node.type).toBe('group');
    const [fill, line] = (node as GroupNode).children as PathNode[];
    expect(fill!.fills).toHaveLength(1);
    expect(fill!.stroke).toBeUndefined();
    expect(fill!.d).toBe(
      arcPath({ width: 40, height: 40, startAngle: 0, sweepAngle: 180 }),
    );
    expect(line!.fills).toHaveLength(0);
    expect(line!.stroke).toMatchObject({ align: 'center', width: 2 });
    expect(line!.d).not.toBe(fill!.d);
  });

  it('without a fill, or with the stroke on the outline, it stays one path', () => {
    expect(draw({ ...stroked, fill: 'none' }).node.type).toBe('path');
    const centered = {
      ...stroked,
      stroke: { color: '#0000ff', width: 2, align: 'center' },
    };
    expect(draw(centered).node.type).toBe('path');
  });
});
