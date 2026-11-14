// MF4 (stage #899): Material 3 (Compose) adopts the engine — inherited content color, two shadows per level,
// opaque disabled state, rounded gap in the outline, justified text and number under the time-picker handle.
// pt-BR kept: node names ('texto', 'trilho', 'contorno', 'alça', 'marca', 'rótulo minimizado', 'número sob a alça', 'relógio', …)
// and the example names 'Primário' and 'Parágrafo justificado' are the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { Spec } from '../../src/model/spec';
import { diffSpecs, missingMigrations } from '../../src/model/specVersions';
import { validateLibrary } from '../../src/model/library';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import { SPEC_FILE, drawIn, files, spec, text } from '../support/material3Library';

const catalog = buildCatalog(files);
type Mode = 'light' | 'dark';
type Values = Record<string, unknown>;

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined || entry.component === null) throw new Error(`missing ${id}`);
  return entry;
}

/** Draws the type with the values and, if given, what the ancestor offered (inherited color). */
function draw(id: string, values: Values, mode: Mode = 'light', provided?: Values) {
  const entry = entryOf(id);
  if (provided === undefined) return drawIn(catalog, entry, values as never, mode);
  const library = catalog.library;
  if (library === null || entry.component === null) throw new Error('no library');
  const box = { x: 0, y: 0, ...entry.component.size };
  return instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values, ...provided } as never,
    box,
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
      provided: provided as never,
    },
  );
}

function find(node: SceneNode, name: string): SceneNode | undefined {
  if (node.name === name) return node;
  if ('children' in node)
    for (const child of node.children) {
      const found = find(child, name);
      if (found !== undefined) return found;
    }
  return undefined;
}
function findAll(node: SceneNode, name: string, out: SceneNode[] = []): SceneNode[] {
  if (node.name === name) out.push(node);
  if ('children' in node) for (const child of node.children) findAll(child, name, out);
  return out;
}
/**
 * The position of `target` inside `root` (the sum of the frame offsets between the two, without that of `root`); `undefined`
 * if `target` is not under `root`. In L2 (#1078) the copy of the numbers under the handle sits under shifted `posição` frames.
 */
function offsetIn(
  root: SceneNode,
  target: SceneNode,
): { x: number; y: number } | undefined {
  const visit = (
    node: SceneNode,
    x: number,
    y: number,
  ): { x: number; y: number } | undefined => {
    const at = { x: x + node.transform[4], y: y + node.transform[5] };
    if (node === target) return at;
    if ('children' in node)
      for (const child of node.children) {
        const found = visit(child, at.x, at.y);
        if (found !== undefined) return found;
      }
    return undefined;
  };
  if (!('children' in root)) return undefined;
  for (const child of root.children) {
    const found = visit(child, 0, 0);
    if (found !== undefined) return found;
  }
  return undefined;
}
/** The color of a solid fill; `#rrggbbff` (full alpha) counts as `#rrggbb`. */
const rgb = (color: string | undefined): string | undefined =>
  color !== undefined && /^#[0-9a-f]{8}$/i.test(color) && color.endsWith('ff')
    ? color.slice(0, 7)
    : color;
const solidOf = (node: SceneNode | undefined): string | undefined => {
  const p = node?.fills[0];
  return p?.type === 'solid' ? rgb(p.color) : undefined;
};
const tokens = (mode: Mode) => resolveTokens(catalog.library!.tokens, {}, mode);

describe('MF4: version and additive update', () => {
  it('it is version 7 and the update from 6 is additive (no break and no missing migration)', () => {
    expect(spec.version).toBe(14);
    // Version 6, the one on `main` at the start of the epic, without the two-shadow elevation tokens.
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 6;
    const values = previous.tokens?.values as Record<string, unknown>;
    for (const key of Object.keys(values))
      if (/^elevation-\d-(point|ambient)-|^elevation-(point|ambient)-shadow$/.test(key))
        delete values[key];
    const changes = diffSpecs(previous, spec);
    expect(changes.filter((c) => c.kind === 'breaking')).toEqual([]);
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(validateLibrary({ files, specPath: SPEC_FILE, previous }).errors).toEqual([]);
  }, 30_000);
});

describe('MF4: inherited content color (decision 14)', () => {
  it('the surface and the scaffold offer the contentColorFor (ColorScheme.kt, 1064 to 1092) through the content-color', () => {
    const t = tokens('light');
    const cases: [string, string, string][] = [
      ['primary', 'on-primary', 'surface'],
      ['primaryContainer', 'on-primary-container', 'surface'],
      ['inverseSurface', 'inverse-on-surface', 'surface'],
      ['surfaceVariant', 'on-surface-variant', 'surface'],
      ['surfaceContainerHigh', 'on-surface', 'surface'],
      ['error', 'on-error', 'surface'],
    ];
    for (const [color, on] of cases)
      expect(draw('surface', { color }).provides, color).toEqual({
        'content-color': t[on],
      });
    expect(draw('scaffold', { containerColor: 'primary' }).provides).toEqual({
      'content-color': t['on-primary'],
    });
    // Without containerColor, the Scaffold default is `background` → `on-background`.
    expect(draw('scaffold', {}).provides).toEqual({
      'content-color': t['on-background'],
    });
  });

  it('a color without a pair (contentColorFor returns Unspecified) inherits what the parent offered, and without a parent it is on-surface', () => {
    const t = tokens('light');
    expect(draw('surface', { color: 'outline' }).provides).toEqual({
      'content-color': t['on-surface'],
    });
    expect(
      draw('surface', { color: 'outline' }, 'light', { 'content-color': '#123456' })
        .provides,
    ).toEqual({ 'content-color': '#123456' });
  });

  it.each(['light', 'dark'] as const)(
    'a text without color inside a primary surface comes out in on-primary (%s)',
    (mode) => {
      const t = tokens(mode);
      const offered = draw('surface', { color: 'primary' }, mode).provides ?? {};
      expect(offered['content-color']).toBe(t['on-primary']);
      const inherited = draw('text', { text: 'Hello' }, mode, offered);
      expect(solidOf(find(inherited.root, 'texto'))).toBe(t['on-primary']);
      // The own `color` wins over the inheritance.
      const own = draw('text', { text: 'Hello', color: 'error' }, mode, offered);
      expect(solidOf(find(own.root, 'texto'))).toBe(t['error']);
      // Without an ancestor that offers one, the usual default (on-surface).
      const alone = draw('text', { text: 'Hello' }, mode);
      expect(solidOf(find(alone.root, 'texto'))).toBe(t['on-surface']);
    },
  );

  it('the icon without tint reads the inherited color; so do the standard icon-button and the standard and outlined (unchecked) icon-toggle-button', () => {
    const t = tokens('light');
    const provided = { 'content-color': t['on-primary'] };
    const icon = draw('icon', { imageVector: 'Home' }, 'light', provided);
    const iconNode = (root: SceneNode) => {
      const all: SceneNode[] = [];
      const visit = (n: SceneNode) => {
        if (n.type === 'path') all.push(n);
        if ('children' in n) n.children.forEach(visit);
      };
      visit(root);
      return all;
    };
    const colors = (root: SceneNode) =>
      iconNode(root).map((n) => solidOf(n) ?? n.stroke?.paints[0]?.type);
    expect(new Set(colors(icon.root))).toEqual(new Set([t['on-primary']]));
    for (const [id, values] of [
      ['icon-button', { icon: 'Edit', style: 'standard' }],
      ['icon-button', { icon: 'Edit', style: 'outlined' }],
      ['icon-toggle-button', { icon: 'Edit', style: 'standard', checked: 'false' }],
      ['icon-toggle-button', { icon: 'Edit', style: 'outlined', checked: 'false' }],
    ] as [string, Values][]) {
      const drawn = draw(id, values, 'light', provided);
      expect(new Set(colors(drawn.root)), `${id} ${String(values.style)}`).toEqual(
        new Set([t['on-primary']]),
      );
      const alone = draw(id, values, 'light');
      expect(colors(alone.root), `${id} without inheritance`).not.toContain(t['on-primary']);
    }
    // The filled style has its own content (on-primary / on-surface-variant): it does not inherit.
    const filled = draw('icon-button', { icon: 'Edit', style: 'filled' }, 'light', {
      'content-color': '#123456',
    });
    expect(colors(filled.root)).not.toContain('#123456');
  });
});

/** Every `shadow` of the library components, with the file and the path. */
function shadows(): { file: string; path: string; value: unknown }[] {
  const out: { file: string; path: string; value: unknown }[] = [];
  const walk = (file: string, node: unknown, path: string): void => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(file, v, `${path}/${i}`));
    if (typeof node !== 'object' || node === null) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'shadow') out.push({ file, path, value: v });
      walk(file, v, `${path}/${k}`);
    }
  };
  for (const f of files)
    if (f.path.startsWith('components/') && f.text !== undefined)
      walk(f.path, JSON.parse(f.text), '');
  return out;
}

describe('MF4: two shadows per level (decision 15)', () => {
  it('the tokens carry the point and ambient shadow of the five levels, with y, blur, spread and color', () => {
    const values = spec.tokens?.values as Record<string, unknown>;
    for (let n = 1; n <= 5; n++)
      for (const kind of ['point', 'ambient'])
        for (const key of ['y', 'blur', 'spread'])
          expect(
            typeof values[`elevation-${n}-${kind}-${key}`],
            `elevation-${n}-${kind}-${key}`,
          ).toBe('number');
    // Material 3 elevation values for the web (Material Design 3, elevation shadows 1 to 5).
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-point-y`])).toEqual([
      1, 1, 1, 2, 4,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-ambient-blur`])).toEqual([
      3, 6, 8, 10, 12,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => values[`elevation-${n}-ambient-spread`])).toEqual([
      1, 2, 3, 4, 6,
    ]);
  });

  it('no component has a single shadow: every `shadow` is the point and ambient list of the same level', () => {
    const all = shadows();
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const { file, path, value } of all) {
      expect(Array.isArray(value), `${file}${path}`).toBe(true);
      const list = value as { y: { $token: string }; spread?: unknown }[];
      expect(list, `${file}${path}`).toHaveLength(2);
      const used = JSON.stringify(list);
      const levels = new Set(
        [...used.matchAll(/elevation-(\d)-(point|ambient)-/g)].map((m) => `${m[1]}`),
      );
      expect(levels.size, `${file}${path} mixes levels`).toBe(1);
      expect(used, `${file}${path}`).toContain('elevation-point-shadow');
      expect(used, `${file}${path}`).toContain('elevation-ambient-shadow');
      expect(used, `${file}${path} without the old token`).not.toMatch(
        /elevation-\d-(y|blur)"/,
      );
      expect(used).toContain('spread');
    }
  });

  it('the elevated card draws both shadows, the point one on top, and the outlined one without hover has no color', () => {
    const elevated = draw('card', { style: 'elevated' }).root;
    expect(elevated.effects).toHaveLength(2);
    const t = tokens('light');
    const [point, ambient] = elevated.effects;
    expect(point).toMatchObject({ offset: { x: 0, y: t['elevation-1-point-y'] } });
    expect(ambient).toMatchObject({
      offset: { x: 0, y: t['elevation-1-ambient-y'] },
      blur: t['elevation-1-ambient-blur'],
      spread: t['elevation-1-ambient-spread'],
    });
    expect(point?.color).not.toBe(ambient?.color);
  });
});

describe('MF4: opaque disabled state (decision 16)', () => {
  const over = (top: unknown, alpha: number, base: unknown): string => {
    const c = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [a, b] = [c(String(top)), c(String(base))];
    return `#${a
      .map((v, i) =>
        Math.round(v! * alpha + b[i]! * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  };
  /** Equal within ±1 per channel (the engine rounds the composition differently from the test's `Math.round`). */
  function expectNear(actual: string | undefined, expected: string): void {
    expect(actual).toMatch(/^#[0-9a-f]{6}$/i);
    const c = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    c(actual!).forEach((v, i) =>
      expect(Math.abs(v - c(expected)[i]!)).toBeLessThanOrEqual(1),
    );
  }
  const opaqueHex = /^#[0-9a-f]{6}$/i; // `solidOf` already strips the `ff` of full alpha

  it.each(['light', 'dark'] as const)(
    'the disabled switch leaves the rail, the outline and the handle in an opaque color, without an opacity layer (%s)',
    (mode) => {
      const t = tokens(mode);
      const off = draw('switch', { checked: 'false', enabled: 'false' }, mode).root;
      for (const gone of [
        'trilho desabilitado',
        'contorno desabilitado',
        'alça desabilitada',
      ])
        expect(find(off, gone), gone).toBeUndefined();
      const rail = find(off, 'trilho')!;
      expectNear(
        solidOf(rail),
        over(t['surface-container-highest']!, 0.12, t['surface']!),
      );
      expect(rail.opacity).toBe(1);
      const outline = find(off, 'contorno')!;
      const line = outline.stroke?.paints[0];
      expectNear(
        line?.type === 'solid' ? rgb(line.color) : undefined,
        over(t['on-surface']!, 0.12, t['surface']!),
      );
      expect(outline.opacity).toBe(1);
      const thumb = find(off, 'alça')!;
      expectNear(solidOf(thumb), over(t['on-surface']!, 0.38, t['surface']!));
      expect(thumb.opacity).toBe(1);
      const on = draw('switch', { checked: 'true', enabled: 'false' }, mode).root;
      expectNear(
        solidOf(find(on, 'trilho')),
        over(t['on-surface']!, 0.12, t['surface']!),
      );
      expect(solidOf(find(on, 'alça'))).toBe(t['surface']);
    },
  );

  it.each(['light', 'dark'] as const)(
    'the disabled slider composes the handle, the rail and the marks over the surface: opaque color, without stacking transparency (%s)',
    (mode) => {
      const t = tokens(mode);
      const root = draw(
        'slider',
        { type: 'single', value: 0.5, steps: 4, enabled: 'false' },
        mode,
      ).root;
      const handle = findAll(root, 'alça');
      const tracks = [
        ...findAll(root, 'trilho ativo'),
        ...findAll(root, 'trilho inativo'),
      ];
      const marks = findAll(root, 'marca').filter((n) => n.visible);
      expect(handle.length + tracks.length + marks.length).toBeGreaterThan(3);
      for (const n of [...handle, ...tracks, ...marks]) {
        expect(n.opacity, n.name).toBe(1);
        expect(solidOf(n), n.name).toMatch(opaqueHex);
      }
      for (const n of [
        ...handle,
        ...findAll(root, 'trilho ativo').filter((x) => x.visible),
      ])
        expectNear(solidOf(n), over(t['on-surface']!, 0.38, t['surface']!));
      for (const n of findAll(root, 'trilho inativo'))
        expectNear(solidOf(n), over(t['on-surface']!, 0.12, t['surface']!));
    },
  );
});

describe('MF4: rounded gap in the text-field and secure-text-field outline (decision 17)', () => {
  const textFieldValues: Record<string, Values> = {
    'text-field': { style: 'outlined', label: 'E-mail', value: 'ana@example.com' },
    'secure-text-field': { style: 'outlined', label: 'Password', hasText: 'true' },
  };
  it.each(['text-field', 'secure-text-field'])(
    '%s outlined with a value has a single outline, with stroke.gap over the label (padding 4) and the corner-extra-small radius',
    (id) => {
      const root = draw(id, textFieldValues[id]!).root;
      const outlines = findAll(root, 'contorno').filter((n) => n.visible);
      expect(outlines).toHaveLength(1);
      const outline = outlines[0]!;
      expect(outline).toMatchObject({ type: 'rect', cornerRadius: 4 });
      expect(outline.stroke?.sides).toBeUndefined();
      expect(outline.stroke?.gaps).toHaveLength(1);
      const gap = outline.stroke!.gaps![0]!;
      expect(gap.side).toBe('top');
      expect(gap.to).toBeGreaterThan(gap.from + 8);
      // The gap covers the minimized label plus 4 on each side.
      const label = find(root, 'rótulo minimizado') as TextNode;
      expect(label).toBeDefined();
      expect(find(root, 'contorno (lados)')).toBeUndefined();
      expect(find(root, 'trecho final')).toBeUndefined();
    },
  );
  it.each(['text-field', 'secure-text-field'])(
    '%s outlined without a value or hint, the label stays inside and the outline opens no gap',
    (id) => {
      const root = draw(id, { style: 'outlined', label: 'E-mail' }).root;
      const outline = findAll(root, 'contorno').find((n) => n.visible)!;
      expect(outline.stroke?.gaps ?? []).toEqual([]);
    },
  );
  it('no library component opens the outline with `sides` on three sides (the check of decision 17)', () => {
    for (const f of files) {
      if (!f.path.startsWith('components/') || f.text === undefined) continue;
      for (const m of f.text.matchAll(/"sides":\s*\[([^\]]*)\]/g))
        expect(m[1]!.split(',').length, `${f.path}: ${m[0]}`).toBe(1);
    }
  });
});

describe('MF4: justified text (decision 18)', () => {
  it('textAlign Justify draws with align justify; the others keep the alignment', () => {
    const long =
      'A sentence long enough to break into two or more lines in the box.';
    const justified = draw('text', {
      text: long,
      textAlign: 'Justify',
      width: 'fill',
    }).root;
    expect((find(justified, 'texto') as TextNode).style.align).toBe('justify');
    for (const [align, expected] of [
      ['Start', 'left'],
      ['Center', 'center'],
      ['End', 'right'],
    ] as const)
      expect(
        (find(draw('text', { text: long, textAlign: align }).root, 'texto') as TextNode)
          .style.align,
      ).toBe(expected);
  });
});

describe('MF4: number under the time-picker handle (decision 21)', () => {
  const values: Values = {
    mode: 'picker',
    hour: 10,
    minute: 37,
    is24Hour: 'true',
    selection: 'minute',
  };

  it('the handle is a circular frame with clip and the copy of the numbers in on-primary', () => {
    const t = tokens('light');
    const root = draw('time-picker', values).root;
    const handle = find(root, 'alça')!;
    expect(handle).toMatchObject({ type: 'frame', clip: true });
    expect(handle.width).toBe(48);
    expect((handle as { cornerRadius: unknown }).cornerRadius).toBeGreaterThanOrEqual(24);
    const copies = findAll(handle, 'número sob a alça') as TextNode[];
    expect(copies).toHaveLength(12);
    for (const c of copies) expect(solidOf(c)).toBe(t['on-primary']);
    // The clock numbers stay in on-surface, outside the handle.
    const originals = findAll(find(root, 'relógio')!, 'número') as TextNode[];
    expect(originals).toHaveLength(12);
    for (const o of originals) expect(solidOf(o)).toBe(t['on-surface']);
  });

  it('at 10:37 the number 35 is half covered: the on-primary copy crosses the handle edge (half on-primary, half on-surface)', () => {
    const root = draw('time-picker', values).root;
    const handle = find(root, 'alça')!;
    const copies = findAll(handle, 'número sob a alça') as TextNode[];
    const texts = copies.map((c) => c.text);
    expect(texts).toContain('35');
    expect(texts).toContain('40');
    const partly = (c: TextNode): boolean => {
      // The position in the handle: that of the `posição` frames plus that of the text.
      const { x, y } = offsetIn(handle, c)!;
      const inside = (px: number, py: number) =>
        px >= 0 && px <= 48 && py >= 0 && py <= 48;
      const corners = [
        [x, y],
        [x + c.width, y],
        [x, y + c.height],
        [x + c.width, y + c.height],
      ] as const;
      const count = corners.filter(([px, py]) => inside(px, py)).length;
      return count > 0 && count < 4;
    };
    const covered = copies.filter(partly).map((c) => c.text);
    expect(covered).toEqual(expect.arrayContaining(['35', '40']));
    // The number at the handle center (37 does not exist) does not appear whole: what is seen is from 35 and 40.
    expect(copies.some((c) => c.text === '37')).toBe(false);
  });

  it('with the handle over a number (hour 10), its copy stays whole inside the handle', () => {
    const root = draw('time-picker', {
      mode: 'picker',
      hour: 10,
      is24Hour: 'true',
      selection: 'hour',
    }).root;
    const handle = find(root, 'alça')!;
    const ten = (findAll(handle, 'número sob a alça') as TextNode[]).find(
      (c) => c.text === '10',
    )!;
    const at = offsetIn(handle, ten)!;
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x + ten.width).toBeLessThanOrEqual(48);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y + ten.height).toBeLessThanOrEqual(48);
  });
});

describe('MF4: new examples', () => {
  it('the primary surface and the justified paragraph draw without warnings, in light and dark', () => {
    for (const mode of ['light', 'dark'] as const)
      for (const [id, name] of [
        ['surface', 'Primário'],
        ['text', 'Parágrafo justificado'],
      ] as const) {
        const entry = entryOf(id);
        const example = entry.examples.find((e) => e.name === name);
        expect(example, `${id}: ${name}`).toBeDefined();
        expect(drawIn(catalog, entry, example!.values as never, mode).warnings).toEqual(
          [],
        );
      }
  });
  it('the specialization text is read', () => {
    expect(text(SPEC_FILE).length).toBeGreaterThan(0);
  });
});
