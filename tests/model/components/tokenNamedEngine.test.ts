// FN2: `$tokenNamed` — evaluation (`evaluate`) and the drawing (`instantiate`): the order of the lookup,
// the kind of each position, literals and defaults.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { evaluate, referencedFields } from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import type { SceneNode } from '../../../src/model/components/scene';
import {
  createTokenTables,
  type NamedTokenLookup,
  type SpecTokens,
} from '../../../src/model/components/tokens';

const box = { x: 0, y: 0, width: 200, height: 60 };

const OWN: SpecTokens = {
  values: { primary: '#112233', 'ui-font': '"Inter", sans-serif', gap: 8 },
};

function component(
  template: Record<string, unknown>,
  tokens: SpecTokens | undefined = OWN,
): ComponentFile {
  const tokenTables = createTokenTables(tokens, {});
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 60 },
    template,
    resolvedTokens: tokenTables.get(undefined),
    tokenTables,
  } as unknown as ComponentFile;
}

function find(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node)
    for (const child of node.children) {
      const found = find(child, name);
      if (found) return found;
    }
  return undefined;
}

const colorText = (color: unknown) => ({
  type: 'frame',
  children: [{ type: 'text', name: 't', text: 'x', color }],
});

function colorOf(
  comp: ComponentFile,
  values: Record<string, string>,
  tokenNamed?: NamedTokenLookup,
) {
  const { root } = instantiate(comp, values, box, {
    measure: approximateMeasurer,
    ...(tokenNamed === undefined ? {} : { tokenNamed }),
  });
  return (find(root, 't') as unknown as { fills?: { color: string }[] }).fills?.[0]
    ?.color;
}

const byName = { $tokenNamed: { $field: 'cor' }, default: '#999999' };

describe('evaluate: $tokenNamed with a lookup', () => {
  const lookup: NamedTokenLookup = (name, kind) =>
    name === 'brand' && kind === 'color' ? '#abcdef' : undefined;
  const expr = { $tokenNamed: { $field: 'cor' }, default: '#999999' };

  it('reads the named token', () => {
    expect(evaluate(expr, { cor: 'brand' }, '', { tokenNamed: lookup })).toBe('#abcdef');
  });

  it('trims the name; an empty name gives the default, and without it the fallback', () => {
    expect(evaluate(expr, { cor: '  brand ' }, '', { tokenNamed: lookup })).toBe(
      '#abcdef',
    );
    expect(evaluate(expr, { cor: '   ' }, '', { tokenNamed: lookup })).toBe('#999999');
    expect(
      evaluate({ $tokenNamed: { $field: 'cor' } }, {}, 'fb', { tokenNamed: lookup }),
    ).toBe('fb');
  });

  it('a literal color is used as is; an unresolved text of the wrong kind gives the default', () => {
    expect(evaluate(expr, { cor: '#FF0000' }, '', { tokenNamed: lookup })).toBe(
      '#FF0000',
    );
    expect(evaluate(expr, { cor: 'banana' }, '', { tokenNamed: lookup })).toBe('#999999');
  });

  it('a family position takes a literal stack as is and asks the lookup for a family', () => {
    const asked: string[] = [];
    const spy: NamedTokenLookup = (name, kind) => {
      asked.push(`${name}:${kind}`);
      return undefined;
    };
    const fam = { $tokenNamed: { $field: 'familia' }, default: 'DEF' };
    expect(
      evaluate(fam, { familia: 'Roboto Mono' }, '', { kind: 'family', tokenNamed: spy }),
    ).toBe('Roboto Mono');
    expect(asked).toEqual(['Roboto Mono:family']);
    // A color is not a family: it gives the default.
    expect(
      evaluate(fam, { familia: '#FF0000' }, '', { kind: 'family', tokenNamed: spy }),
    ).toBe('DEF');
  });
});

describe('instantiate: the own library', () => {
  it('reads a color token of the own library', () => {
    expect(colorOf(component(colorText(byName)), { cor: 'primary' })).toBe('#112233');
  });

  it('a token of the wrong kind (a number, a family) is skipped: the default applies', () => {
    expect(colorOf(component(colorText(byName)), { cor: 'gap' })).toBe('#999999');
    expect(colorOf(component(colorText(byName)), { cor: 'ui-font' })).toBe('#999999');
  });

  it('empty or unresolved gives the default; without it the attribute default', () => {
    expect(colorOf(component(colorText(byName)), { cor: '' })).toBe('#999999');
    expect(colorOf(component(colorText(byName)), { cor: 'nope' })).toBe('#999999');
    expect(
      colorOf(component(colorText({ $tokenNamed: { $field: 'cor' } })), { cor: 'nope' }),
    ).toBe('#000000');
  });

  it('a literal #RRGGBB is used as is', () => {
    expect(colorOf(component(colorText(byName)), { cor: '#FF0000' })).toBe('#FF0000');
  });

  it('font.family: a family token, a literal stack, and font-sans by default', () => {
    const comp = component({
      type: 'frame',
      children: [
        {
          type: 'text',
          name: 't',
          text: 'x',
          font: {
            family: {
              $tokenNamed: { $field: 'familia' },
              default: { $token: 'font-sans' },
            },
          },
        },
      ],
    });
    const familyOf = (familia: string) => {
      const { root } = instantiate(comp, { familia }, box, {
        measure: approximateMeasurer,
      });
      return (find(root, 't') as unknown as { style: { fontFamily: string } }).style
        .fontFamily;
    };
    expect(familyOf('ui-font')).toBe('"Inter", sans-serif');
    expect(familyOf('font-mono')).toBe('"Mapping Mono", monospace');
    expect(familyOf('Roboto Mono')).toBe('Roboto Mono');
    expect(familyOf('')).toBe('"Mapping Sans", sans-serif');
  });
});

describe('instantiate: the project lookup', () => {
  it('uses the lookup option instead of the own table', () => {
    const lookup: NamedTokenLookup = (name, kind) =>
      name === 'other' && kind === 'color' ? '#0a0b0c' : undefined;
    expect(colorOf(component(colorText(byName)), { cor: 'other' }, lookup)).toBe(
      '#0a0b0c',
    );
  });
});

describe('the fields $tokenNamed cites (decision 11)', () => {
  it('count as referenced by the drawing', () => {
    const template = {
      type: 'text',
      text: 'x',
      color: { $tokenNamed: { $field: 'cor' }, default: { $field: 'fallback' } },
      font: { family: { $tokenNamed: { $field: 'familia' } } },
    };
    expect([...referencedFields(template)].sort()).toEqual([
      'cor',
      'fallback',
      'familia',
    ]);
  });
});
