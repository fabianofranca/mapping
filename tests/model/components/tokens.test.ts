// Format 4, phase CF5: `{ "$token": "<name>" }`, resolution by mode and default font of the host.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { resolveTokens, tokenKind } from '../../../src/model/components/tokens';

const V4 = 'only allowed with formatVersion 4';

const TOKENS = {
  modes: ['light', 'dark'],
  values: { primary: { light: '#1a73e8', dark: '#8ab4f8' }, radius: 8 },
};

function component(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

const withChild = (child: Record<string, unknown>, version = 4) =>
  component({ type: 'frame', children: [child] }, version);

describe('$token: validation of the file', () => {
  it('applies to color, number, family, $switch, gradient stop, stroke and limits', () => {
    const t = (name: string) => ({ $token: name });
    const issues = validateComponent(
      component({
        type: 'frame',
        fill: t('primary'),
        layout: { type: 'row', gap: t('radius') },
        minWidth: t('radius'),
        children: [
          {
            type: 'rect',
            fill: {
              type: 'linear',
              angle: 0,
              stops: [
                { offset: 0, color: t('primary') },
                { offset: 1, color: '#000' },
              ],
            },
            stroke: { color: t('primary'), width: t('radius') },
            cornerRadius: t('radius'),
          },
          {
            type: 'text',
            text: 'x',
            color: { $switch: 'k', cases: { a: t('primary') }, default: t('primary') },
            font: { size: t('radius'), family: t('font-sans') },
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it('in v3 it fails with the version message, at the path', () => {
    expect(
      validateComponent(withChild({ type: 'rect', fill: { $token: 'primary' } }, 3)),
    ).toContain(`template.children[0].fill: ${V4}`);
  });

  it('on a value that is not a color, number or family it fails', () => {
    const errors = validateComponent(
      withChild({ type: 'frame', layout: { type: 'row', align: { $token: 'x' } } }),
    );
    expect(errors.some((e) => e.includes('layout.align') && e.includes('$token'))).toBe(
      true,
    );
  });

  it('the name must follow the pattern and the object accepts no other key', () => {
    expect(
      validateComponent(withChild({ type: 'rect', fill: { $token: 'Primary' } })).length,
    ).toBeGreaterThan(0);
    expect(
      validateComponent(
        withChild({ type: 'rect', fill: { $token: 'primary', default: '#fff' } }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('the padding of a runs run accepts a number $token', () => {
    const r = parseComponent(
      withChild({
        type: 'text',
        runs: [{ text: 'x', background: '#eee', padding: { $token: 'radius' } }],
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs).toEqual([
      { path: 'template.children[0].runs[0].padding', name: 'radius', kind: 'number' },
    ]);
  });

  it('the result lists the references with path, name and expected type', () => {
    const r = parseComponent(
      withChild({
        type: 'text',
        text: 'x',
        color: { $token: 'primary' },
        font: { size: { $token: 'radius' }, family: { $token: 'font-sans' } },
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect([...r.tokenRefs].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'template.children[0].color', name: 'primary', kind: 'color' },
      { path: 'template.children[0].font.family', name: 'font-sans', kind: 'family' },
      { path: 'template.children[0].font.size', name: 'radius', kind: 'number' },
    ]);
  });
});

const rectComponent = (extra: Record<string, unknown>): ComponentFile => {
  const r = parseComponent(withChild({ type: 'rect', ...extra }));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
};

function solidColor(node: unknown): unknown {
  const fills = (node as { fills?: readonly { type: string; color?: string }[] }).fills;
  return fills?.[0]?.color;
}

function firstFill(file: ComponentFile, mode: string | undefined): unknown {
  const tokens = resolveTokens(TOKENS, {}, mode);
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer, tokens },
  );
  return solidColor(root.children[0]);
}

describe('$token: resolution by mode', () => {
  const file = rectComponent({ fill: { $token: 'primary' } });

  it('in dark mode it returns the dark value', () => {
    expect(firstFill(file, 'dark')).toBe('#8ab4f8');
  });

  it('in an undeclared mode it uses the first mode, without a warning', () => {
    expect(firstFill(file, 'contrast')).toBe('#1a73e8');
    expect(firstFill(file, undefined)).toBe('#1a73e8');
  });

  it('a simple value applies in all modes', () => {
    const tokens = (mode: string) => resolveTokens(TOKENS, {}, mode);
    expect(tokens('light').radius).toBe(8);
    expect(tokens('dark').radius).toBe(8);
  });

  it('$token as the result of $switch', () => {
    const f = rectComponent({
      fill: { $switch: 'k', cases: { a: { $token: 'primary' } } },
    });
    const tokens = resolveTokens(TOKENS, {}, 'dark');
    const { root } = instantiate(
      f,
      { k: 'a' },
      { x: 0, y: 0, width: 10, height: 10 },
      { measure: approximateMeasurer, tokens },
    );
    expect(solidColor(root.children[0])).toBe('#8ab4f8');
  });
});

describe('default font of the host', () => {
  const textFile = (font: Record<string, unknown> = {}): ComponentFile => {
    const r = parseComponent(
      withChild({ type: 'text', text: 'Hey', font: { size: 10, ...font } }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.component;
  };

  function families(
    file: ComponentFile,
    tokens = resolveTokens(undefined, {}),
  ): string[] {
    const seen: string[] = [];
    const measure: TextMeasurer = (text, font, maxWidth) => {
      seen.push(font.family);
      return approximateMeasurer(text, font, maxWidth);
    };
    instantiate(file, {}, { x: 0, y: 0, width: 200, height: 100 }, { measure, tokens });
    return seen;
  }

  it('without family the text uses the font-sans given by the host', () => {
    const tokens = resolveTokens(undefined, { sans: 'Theme Sans, sans-serif' });
    expect(new Set(families(textFile(), tokens))).toEqual(
      new Set(['Theme Sans, sans-serif']),
    );
  });

  it('the specialization that redefines font-sans in the tokens wins', () => {
    const tokens = resolveTokens(
      { modes: ['m'], values: { 'font-sans': 'Spec Sans' } },
      { sans: 'Theme Sans' },
    );
    expect(new Set(families(textFile(), tokens))).toEqual(new Set(['Spec Sans']));
  });

  it('font-mono comes from the host and the specialization redefines it', () => {
    const file = textFile({ family: { $token: 'font-mono' } });
    expect(
      new Set(families(file, resolveTokens(undefined, { mono: 'Theme Mono' }))),
    ).toEqual(new Set(['Theme Mono']));
    const spec = { modes: ['m'], values: { 'font-mono': 'Spec Mono' } };
    expect(new Set(families(file, resolveTokens(spec, { mono: 'Theme Mono' })))).toEqual(
      new Set(['Spec Mono']),
    );
  });

  it('a literal family wins over the default', () => {
    const tokens = resolveTokens(undefined, { sans: 'Theme Sans' });
    expect(new Set(families(textFile({ family: 'Roboto' }), tokens))).toEqual(
      new Set(['Roboto']),
    );
  });

  it('without a host the default is sans-serif', () => {
    expect(new Set(families(textFile()))).toEqual(new Set(['sans-serif']));
  });

  it('width regression: text without family measures with the theme font', () => {
    // The width depends on the family: 10 px per letter in the wide theme font, 6 in the others.
    const measure: TextMeasurer = (text, font) => ({
      width: text.length * (font.family === 'Theme Wide' ? 10 : 6),
      height: font.lineHeight,
    });
    const r = parseComponent(
      component({
        type: 'frame',
        layout: { type: 'row' },
        children: [{ type: 'text', text: 'Hey', width: 'hug', font: { size: 10 } }],
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const size = { width: null, height: 20 };
    const wide = measureComponent(r.component, {}, size, {
      measure,
      tokens: resolveTokens(undefined, { sans: 'Theme Wide' }),
    });
    const plain = measureComponent(r.component, {}, size, { measure });
    expect(wide.width).toBe(30);
    expect(plain.width).toBe(18);
  });

  it("'Inter' no longer appears in the model code", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && readFileSync(path, 'utf8').includes("'Inter'"))
          hits.push(path);
      }
    };
    walk('src/model');
    expect(hits).toEqual([]);
  });
});

describe('tokenKind with a hex of invalid size (epic review)', () => {
  it('only 3, 4, 6 and 8 digits are a color; #12345 and #1234567 do not silently become an opaque color', () => {
    for (const ok of ['#abc', '#abcd', '#aabbcc', '#aabbccdd'])
      expect(tokenKind(ok)).toBe('color');
    for (const bad of ['#12345', '#1234567', '#12'])
      expect(tokenKind(bad)).not.toBe('color');
  });
});
