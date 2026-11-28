// Format 4, stage #2915 (DG6): `backdropBlur` on `frame` and `rect` (a number >= 0, literal, expression or
// number `$token`). Drawing only: the scene node carries `backdropBlur` (omitted when 0 or absent).
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  type ComponentFile,
  type FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';
import { resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const V4 = 'only allowed with formatVersion 4';
const TOKENS = { modes: ['light'], values: { blur: 12 } };

function file(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

const node = (type: string, extra: Raw = {}): Raw => ({
  type,
  width: 50,
  height: 20,
  ...(type === 'text' ? { text: 'a' } : {}),
  ...extra,
});

const root = (child: Raw): Raw => ({
  type: 'frame',
  layout: { type: 'none' },
  children: [child],
});

function parse(template: Raw): ComponentFile {
  const r = parseComponent(file(template));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

function run(template: Raw, values: FieldValues = {}) {
  const tokens = resolveTokens(TOKENS, {}, 'light');
  const drawn = instantiate(
    parse(template),
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer, tokens },
  );
  const first: SceneNode | undefined = (drawn.root as FrameNode).children[0];
  return { child: first, warnings: drawn.warnings };
}

describe('backdropBlur in the validator', () => {
  it('is valid on a frame and on a rect (literal, expression, $token)', () => {
    for (const type of ['frame', 'rect']) {
      for (const value of [8, 0, { $field: 'amount' }, { $token: 'blur' }]) {
        expect(
          validateComponent(file(root(node(type, { backdropBlur: value })))),
        ).toEqual([]);
      }
    }
  });

  it('is an unknown key on a text', () => {
    expect(validateComponent(file(root(node('text', { backdropBlur: 4 }))))).toEqual([
      'template.children[0].backdropBlur: unknown key: backdropBlur',
    ]);
  });

  it('a negative number fails with the non-negative error', () => {
    const errors = validateComponent(file(root(node('rect', { backdropBlur: -1 }))));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('template.children[0].backdropBlur');
  });

  it('formatVersion 1 to 3 gives the version error at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(
        validateComponent(file(root(node('rect', { backdropBlur: 4 })), version)),
      ).toEqual([`template.children[0].backdropBlur: ${V4}`]);
    }
  });
});

describe('backdropBlur in the scene', () => {
  it('a literal reaches the scene node of a rect and of a frame', () => {
    expect(run(root(node('rect', { backdropBlur: 16 }))).child).toMatchObject({
      type: 'rect',
      backdropBlur: 16,
    });
    expect(run(root(node('frame', { backdropBlur: 6 }))).child).toMatchObject({
      type: 'frame',
      backdropBlur: 6,
    });
  });

  it('a $field expression and a $token resolve', () => {
    const tpl = root(node('rect', { backdropBlur: { $field: 'amount' } }));
    expect(run(tpl, { amount: 9 }).child).toMatchObject({ backdropBlur: 9 });
    expect(
      run(root(node('rect', { backdropBlur: { $token: 'blur' } }))).child,
    ).toMatchObject({ backdropBlur: 12 });
  });

  it('0 or absent omits the field', () => {
    expect(run(root(node('rect', { backdropBlur: 0 }))).child).not.toHaveProperty(
      'backdropBlur',
    );
    expect(run(root(node('rect'))).child).not.toHaveProperty('backdropBlur');
  });

  it('survives a component node scale on the outer node (the field is not rescaled)', () => {
    const { child } = run(root(node('rect', { backdropBlur: 10, scale: 2 })));
    expect(child).toMatchObject({ backdropBlur: 10, scale: 2 });
  });

  it('a negative or text expression warns and drops the field', () => {
    const tpl = root(node('rect', { backdropBlur: { $field: 'amount' } }));
    const negative = run(tpl, { amount: -3 });
    expect(negative.warnings).toContain('invalid value in backdropBlur: -3');
    expect(negative.child).not.toHaveProperty('backdropBlur');
    const textual = run(root(node('frame', { backdropBlur: { $field: 'label' } })), {
      label: 'soft',
    });
    expect(textual.warnings).toContain('invalid value in backdropBlur: soft');
    expect(textual.child).not.toHaveProperty('backdropBlur');
  });
});
