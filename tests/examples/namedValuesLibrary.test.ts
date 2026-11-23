// Example library `named-values` (NV6, stage #1900): axes, aliases, composites, a deprecated token and a
// preset container whose background is a token.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import type { SceneNode } from '../../src/model/components/scene';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { validateLibrary } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/named-values');
const SPEC_FILE = 'named-values.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const catalog = buildCatalog(files);
const library = loadLibrary(files);

type Selection = { theme: 'light' | 'dark'; contrast: 'standard' | 'high' };

function draw(id: string, selection: Selection, values = {}) {
  const entry = findEntry(catalog, id)!;
  const component = entry.component!;
  return instantiate(
    component,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, ...component.size },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, selection),
    },
  );
}

function collect(root: SceneNode, pick: (n: Record<string, unknown>) => unknown[]) {
  const out: unknown[] = [];
  const visit = (node: SceneNode): void => {
    out.push(...pick(node as unknown as Record<string, unknown>));
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  return out;
}

const fillsOf = (root: SceneNode): string[] =>
  collect(root, (n) =>
    Array.isArray(n.fills)
      ? (n.fills as { type: string; color: string }[])
          .filter((p) => p.type === 'solid')
          .map((p) => p.color.toUpperCase())
      : [],
  ) as string[];
const isText = (
  n: Record<string, unknown>,
): n is Record<string, unknown> & {
  style: { fontSize: number; fontWeight: number };
} => n.type === 'text';
const textColors = (root: SceneNode): string[] =>
  collect(root, (n) =>
    isText(n) ? [JSON.stringify(n.fills).toUpperCase()] : [],
  ) as string[];
const sizesOf = (root: SceneNode): number[] =>
  collect(root, (n) => (isText(n) ? [n.style.fontSize] : [])) as number[];
const shadowsOf = (root: SceneNode): unknown[] =>
  collect(root, (n) =>
    Array.isArray(n.effects) && n.effects.length > 0 ? [n.effects] : [],
  );

const LIGHT: Selection = { theme: 'light', contrast: 'standard' };
const DARK_HIGH: Selection = { theme: 'dark', contrast: 'high' };

describe('example library named-values', () => {
  it('has the specialization, two components and their documents', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/card.json',
        'components/badge.json',
        'docs/card.md',
        'docs/badge.md',
      ].sort(),
    );
  });

  it('validates with no error and no warning', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('declares two axes, aliases, two composites and a deprecated token', () => {
    const spec = JSON.parse(files.find((f) => f.path === SPEC_FILE)!.text);
    expect(spec.formatVersion).toBe(23);
    expect(spec.tokens.axes).toEqual({
      theme: ['light', 'dark'],
      contrast: ['standard', 'high'],
    });
    const values = spec.tokens.values;
    expect(values['card-container']).toEqual({ $token: 'surface' });
    expect(values['ink-muted'].alpha).toBe(0.6);
    expect(Object.keys(values.title)).toEqual(['size', 'lineHeight', 'weight', 'family']);
    expect(Object.keys(values.raised)).toEqual(['color', 'x', 'y', 'blur', 'spread']);
    expect(values['old-accent'].$notices[0].kind).toBe('deprecated');
  });

  it('the card draws the title style, the raised shadow and the alias colors in the four combinations', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const contrast of ['standard', 'high'] as const) {
        const drawn = draw('card', { theme, contrast });
        expect(drawn.messages).toEqual([]);
        expect(sizesOf(drawn.root)).toContain(22);
        expect(shadowsOf(drawn.root).length).toBeGreaterThan(0);
        expect(fillsOf(drawn.root).length).toBeGreaterThan(0);
      }
    }
  });

  it('theme=dark, contrast=high draws other colors than theme=light, contrast=standard', () => {
    const light = draw('card', LIGHT);
    const dark = draw('card', DARK_HIGH);
    expect(fillsOf(light.root)).not.toEqual(fillsOf(dark.root));
    expect(textColors(light.root)).not.toEqual(textColors(dark.root));
    expect(JSON.stringify(shadowsOf(light.root))).not.toEqual(
      JSON.stringify(shadowsOf(dark.root)),
    );
    expect(fillsOf(light.root)).toContain('#FAFAFA');
    expect(fillsOf(dark.root)).toContain('#121212');
  });

  it('the contrast axis changes the title weight', () => {
    const weights = (s: Selection) =>
      collect(draw('card', s).root, (n) =>
        isText(n) && n.style.fontSize === 22 ? [n.style.fontWeight] : [],
      );
    expect(weights(LIGHT)).toEqual([500]);
    expect(weights({ theme: 'light', contrast: 'high' })).toEqual([700]);
  });

  it('the badge reads title.size', () => {
    expect(sizesOf(draw('badge', LIGHT).root)).toContain(22);
  });

  it('the screen preset has the surface token as its background, resolved per theme', () => {
    const spec = JSON.parse(files.find((f) => f.path === SPEC_FILE)!.text);
    expect(spec.containers).toEqual([
      {
        id: 'screen',
        name: 'Screen',
        width: 360,
        height: 640,
        background: { $token: 'surface' },
      },
    ]);
    const surface = (theme: 'light' | 'dark') =>
      String(
        resolveTokens(library.tokens, {}, { theme, contrast: 'standard' }).surface,
      ).toUpperCase();
    expect(surface('light')).toBe('#FAFAFA');
    expect(surface('dark')).toBe('#121212');
  });
});
