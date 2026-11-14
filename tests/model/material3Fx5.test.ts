// "Format 4" stage (#896), phase FX5 (#1012): `material3-compose` without the stopgaps of decision 24 —
// `$token` in the shadow and in the per-corner radii, `alpha` in the `carousel` scrim, the `badge` without a fixed height — and the
// focus ring on `interaction: "focused"` of the types that Compose draws with a ring (`FocusIndicatorColor`
// in the `*Tokens.kt` of the pinned commit), by `stroke.offset`. The `version` goes up once (4 → 5), additively.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  findSlot,
  layoutChildren,
  resolveSlotLayout,
} from '../../src/model/components/arrange';
import { defaultValues } from '../../src/model/libraryDrawing';
import type { FrameNode, SceneNode } from '../../src/model/components/scene';
import { validateLibrary } from '../../src/model/library';
import type { Spec } from '../../src/model/spec';
import { missingMigrations } from '../../src/model/specVersions';
import {
  SPEC_FILE,
  drawIn,
  files,
  spec,
  text,
  types,
  unknownWarnings,
} from '../support/material3Library';

type Json = unknown;
type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];
const catalog = buildCatalog(files);
const tokenValues = (spec.tokens?.values ?? {}) as Record<
  string,
  { light: string; dark: string } | number
>;
const secondary = (mode: Mode): string => {
  const v = tokenValues.secondary;
  return typeof v === 'object' ? v[mode].toLowerCase() : '';
};

const components = types.map((t) => ({
  id: t.id,
  json: JSON.parse(text(`components/${t.id}.json`)) as Json,
}));

/** Walks the whole component tree and calls `visit` on each object, with its path. */
function walk(
  value: Json,
  path: string,
  visit: (obj: Record<string, Json>, p: string) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}/${i}`, visit));
  } else if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, Json>;
    visit(obj, path);
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}/${k}`, visit);
  }
}

/** The literal numbers (outside `$token`) inside a value, with the path. */
function literalNumbers(value: Json, path: string, out: string[] = []): string[] {
  if (typeof value === 'number') out.push(`${path}=${value}`);
  else if (Array.isArray(value))
    value.forEach((v, i) => literalNumbers(v, `${path}/${i}`, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, Json>))
      if (k !== '$field' && k !== '$eq') literalNumbers(v, `${path}/${k}`, out);
  }
  return out;
}

describe('Material 3 stopgaps replaced by the new keys (decision 24)', () => {
  it('no shadow with a literal x, y or blur (all have an elevation token)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        const shadow = obj.shadow;
        if (typeof shadow !== 'object' || shadow === null) return;
        for (const key of ['x', 'y', 'blur'] as const) {
          const v = (shadow as Record<string, Json>)[key];
          if (typeof v === 'number') found.push(`${p}/shadow/${key}=${v}`);
        }
      });
    expect(found).toEqual([]);
  });

  it('no literal per-corner radius other than 0 (each value comes from a token)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        if (!('cornerRadius' in obj)) return;
        // only the per-corner radius lists (A2); a uniform radius as a number is another matter
        const lits = literalNumbers(obj.cornerRadius, `${p}/cornerRadius`)
          .filter((s) => /\/cornerRadius(\/[a-z]+)*\/\d+=/.test(s))
          .filter((s) => !s.endsWith('=0'));
        found.push(...lits);
      });
    expect(found).toEqual([]);
  });

  it('no fixed opacity between 0 and 1: the color carries the token `alpha` (the carousel scrim is a gradient)', () => {
    const found: string[] = [];
    for (const c of components)
      walk(c.json, c.id, (obj, p) => {
        const o = obj.opacity;
        if (typeof o === 'number' && o > 0 && o < 1) found.push(`${p}/opacity=${o}`);
      });
    expect(found).toEqual([]);
    const carousel = JSON.stringify(components.find((c) => c.id === 'carousel')?.json);
    expect(carousel).toContain('"alpha":0.55');
    expect(carousel).toContain('"alpha":0');
  });

  it('the badge counter does not fix the height (the drawing proof uses the mode tokens)', () => {
    const badge = JSON.stringify(
      (components.find((c) => c.id === 'badge')?.json as { template: Json }).template,
    );
    expect(badge).not.toMatch(/"height":\s*16/);
  });

  it('validates without errors and only with the known warnings at the three levels, in all modes', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);
});

/** Types with `interaction: "focused"` and `FocusIndicatorColor` in the `*Tokens.kt` of the pinned commit, and the drawing to check. */
const RING: { id: string; values: Record<string, unknown>; node?: string }[] = [
  { id: 'chip', values: { style: 'assist' } },
  { id: 'chip', values: { style: 'filter' } },
  { id: 'chip', values: { style: 'input' } },
  { id: 'chip', values: { style: 'suggestion' } },
  { id: 'card', values: { style: 'filled' } },
  { id: 'card', values: { style: 'elevated' } },
  { id: 'list-item', values: {} },
  { id: 'search-bar', values: { style: 'bar' } },
  { id: 'search-bar', values: { style: 'docked' } },
  { id: 'switch', values: {} },
  {
    id: 'dropdown-menu',
    values: {
      style: 'menu',
      expanded: 'true',
      items: [
        {
          text: 'Edit',
          leadingIcon: 'Edit',
          trailingIcon: '',
          enabled: 'true',
          selected: 'true',
        },
        { text: 'Delete', leadingIcon: 'Delete', trailingIcon: '', enabled: 'true' },
      ],
    },
  },
  { id: 'navigation-drawer', values: { style: 'modal', headline: 'Mapping' } },
];

// pt-BR kept: node names of libraries/material3-compose are Portuguese data
function rings(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  if (!node.visible) return out;
  if (node.name === 'anel de foco') out.push(node);
  if ('children' in node) node.children.forEach((c) => rings(c, out));
  return out;
}
const entryOf = (id: string) => {
  const e = findEntry(catalog, id);
  if (e === undefined) throw new Error(`entry ${id} missing`);
  return e;
};
const rgba = (c: string): string => c.toLowerCase().slice(0, 7);

describe('focus ring on interaction: focused (A15, by stroke.offset)', () => {
  for (const { id, values } of RING) {
    const label = `${id} ${JSON.stringify(values).slice(0, 40)}`;
    it(`${label}: the secondary ring of 3, offset 2, outside the shape in focused, and none in none`, () => {
      for (const mode of MODES) {
        const base = { ...(entryOf(id).previewValues ?? {}), ...values };
        const none = drawIn(catalog, entryOf(id), { ...base, interaction: 'none' }, mode);
        expect(rings(none.root), `${label} ${mode} none`).toEqual([]);
        const focused = drawIn(
          catalog,
          entryOf(id),
          { ...base, interaction: 'focused' },
          mode,
        );
        const found = rings(focused.root);
        expect(found.length, `${label} ${mode} focused`).toBeGreaterThanOrEqual(1);
        for (const ring of found) {
          const stroke = 'stroke' in ring ? ring.stroke : undefined;
          const paint = stroke?.paints[0];
          expect(stroke?.width).toBe(3);
          expect(stroke?.align).toBe('outside');
          expect(stroke?.offset).toBe(2);
          expect(paint?.type === 'solid' ? rgba(paint.color) : undefined).toBe(
            rgba(secondary(mode)),
          );
          expect('fills' in ring ? ring.fills : []).toEqual([]);
        }
      }
    });
  }

  it('the outlined card has no ring (OutlinedCardTokens.kt does not define FocusIndicatorColor)', () => {
    for (const mode of MODES) {
      const drawn = drawIn(
        catalog,
        entryOf('card'),
        {
          ...(entryOf('card').previewValues ?? {}),
          style: 'outlined',
          interaction: 'focused',
        },
        mode,
      );
      expect(rings(drawn.root)).toEqual([]);
    }
  });

  it('the root clip widens 5 on each side in focused when the root clips, and does not widen in none', () => {
    for (const id of ['card', 'list-item']) {
      const none = drawIn(
        catalog,
        entryOf(id),
        { style: 'filled', interaction: 'none' },
        'light',
      );
      const focused = drawIn(
        catalog,
        entryOf(id),
        { style: 'filled', interaction: 'focused' },
        'light',
      );
      const box = (
        n: SceneNode,
      ): { w: number; h: number; clip?: FrameNode['clipBox'] } => ({
        w: n.width,
        h: n.height,
        clip: n.type === 'frame' ? n.clipBox : undefined,
      });
      const a = box(none.root);
      const b = box(focused.root);
      expect(b.clip, id).toBeDefined();
      const clip = b.clip;
      if (clip === undefined) continue;
      expect(clip.x).toBeLessThanOrEqual(-5);
      expect(clip.y).toBeLessThanOrEqual(-5);
      expect(clip.x + clip.width).toBeGreaterThanOrEqual(b.w + 5);
      expect(clip.y + clip.height).toBeGreaterThanOrEqual(b.h + 5);
      if (a.clip !== undefined) expect(a.clip.x).toBeGreaterThan(-5);
    }
  });
});

describe('reverseLayout turns on layout.reverse: the order is inverted and the block sits at the end of the axis', () => {
  const CASES: [string, 'x' | 'y'][] = [
    ['lazy-column', 'y'],
    ['lazy-row', 'x'],
    ['horizontal-pager', 'x'],
  ];
  for (const [id, axis] of CASES) {
    it(`${id}: with reverseLayout the first child goes to the end, without it to the start`, () => {
      const e = entryOf(id);
      const slot = { x: 0, y: 0, width: 400, height: 400 };
      const kids = [1, 2, 3].map(() => ({ box: { x: 0, y: 0, width: 50, height: 50 } }));
      const place = (reverseLayout: string) => {
        const layout = resolveSlotLayout(findSlot(e.component!)!, {
          ...defaultValues(e.type),
          reverseLayout,
        });
        return { layout, boxes: layoutChildren(slot, layout, kids) };
      };
      const off = place('false');
      const on = place('true');
      expect(on.layout.reverse).toBe(true);
      expect(off.layout.reverse).toBe(false);
      const size = axis === 'x' ? 'width' : 'height';
      const end = (axis === 'x' ? on.layout.padding.right : on.layout.padding.bottom) + 0;
      // the first child sits against the end of the axis and the last one is closer to the start
      expect(on.boxes[0]![axis] + on.boxes[0]![size]).toBe(400 - end);
      expect(on.boxes[0]![axis]).toBeGreaterThan(on.boxes[2]![axis]);
      expect(off.boxes[0]![axis]).toBeLessThan(off.boxes[2]![axis]);
    });
  }
});

describe('library update (version 4 → 5)', () => {
  it('bumps the version once per stage: 5 in FX5, 6 in EX4 of #897, 7 in MF4 of #899, 8 in MC5 of #898, 10 in D3 of #1085 (9 was L5), 11 in VL2 of #1504, 12 in S5 of #1120, 13 in RC1 of #1743 and 14 in R5 of #1110', () => {
    expect(spec.version).toBe(14);
  });

  it('is additive: changes the drawing without changing a field, with no migration steps', () => {
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 4;
    expect(missingMigrations(previous, spec)).toEqual([]);
    // only EX6 (#897) has a migration: the slider went from enum to number (`fill-field`), and the fields
    // these tests compare do not change
    expect(
      (spec.migrations ?? []).flatMap((m) =>
        m.steps.map((s) => `${s.op}:${'type' in s ? s.type : ''}`),
      ),
    ).toEqual(
      Array(5)
        .fill(['fill-field:slider', 'fill-field:slider', 'fill-field:slider'])
        .flat(),
    );
    const report = validateLibrary({ files, specPath: SPEC_FILE, previous });
    expect(report.errors).toEqual([]);
  }, 30_000);
});
