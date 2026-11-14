// Material 3 with interaction states stage (#869), phase ME1 (#912): state tokens, last literals
// as a token, the `interaction` field of the `button` (the pattern of the following phases) and the additive update of the
// library. Reference: Compose `material3` 1.4.0, commit 5113b82a… (`tokens/StateTokens.kt`).
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import type { Spec } from '../../src/model/spec';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { missingMigrations } from '../../src/model/specVersions';
import {
  ROOT,
  SPEC_FILE,
  unknownWarnings,
  drawIn,
  files,
  spec,
  typeOf,
} from '../support/material3Library';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tokenValues = (spec.tokens?.values ?? {}) as Record<string, unknown>;

/** The `interaction` options per type that already received it (decision 2 of #869); grows with each phase. */
const INTERACTION_OPTIONS: Record<string, string[]> = {
  button: ['none', 'hovered', 'focused', 'pressed'],
  fab: ['none', 'hovered', 'focused', 'pressed'],
  'extended-fab': ['none', 'hovered', 'focused', 'pressed'],
  'icon-button': ['none', 'hovered', 'focused', 'pressed'],
  'icon-toggle-button': ['none', 'hovered', 'focused', 'pressed'],
  chip: ['none', 'hovered', 'focused', 'pressed', 'dragged'],
  card: ['none', 'hovered', 'focused', 'pressed', 'dragged'],
  checkbox: ['none', 'hovered', 'focused', 'pressed'],
  'radio-button': ['none', 'hovered', 'focused', 'pressed'],
  switch: ['none', 'hovered', 'focused', 'pressed'],
  slider: ['none', 'hovered', 'focused', 'pressed'],
  'segmented-button': ['none', 'hovered', 'focused', 'pressed'],
  'text-field': ['none', 'hovered', 'focused'],
  'secure-text-field': ['none', 'hovered', 'focused'],
  'search-bar': ['none', 'hovered', 'focused', 'pressed'],
  'dropdown-menu': ['none', 'hovered', 'focused'],
  'list-item': ['none', 'hovered', 'focused', 'pressed', 'dragged'],
  tabs: ['none', 'hovered', 'focused', 'pressed'],
  'navigation-bar': ['none', 'hovered', 'focused', 'pressed'],
  'short-navigation-bar': ['none', 'hovered', 'focused', 'pressed'],
  'navigation-rail': ['none', 'hovered', 'focused', 'pressed'],
  'navigation-drawer': ['none', 'hovered', 'focused', 'pressed'],
  // EX4 of the expressions stage (#897)
  'date-picker': ['none', 'hovered', 'focused', 'pressed'],
  'time-picker': ['none', 'hovered', 'focused', 'pressed'],
};

describe('state tokens (StateTokens.kt)', () => {
  it('has state-hover, state-focus, state-pressed and state-dragged with the values of the commit', () => {
    expect(tokenValues['state-hover']).toBe(0.08);
    expect(tokenValues['state-focus']).toBe(0.1);
    expect(tokenValues['state-pressed']).toBe(0.1);
    expect(tokenValues['state-dragged']).toBe(0.16);
  });
});

type Json = unknown;
function collect(node: Json, key: string, out: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => collect(n, key, out));
  else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, Json>)) {
      if (k === key) out.push(v);
      collect(v, key, out);
    }
  }
  return out;
}
function numbers(node: Json, out: number[] = []): number[] {
  if (typeof node === 'number') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => numbers(n, out));
  else if (node !== null && typeof node === 'object')
    Object.values(node as Record<string, Json>).forEach((n) => numbers(n, out));
  return out;
}

const componentsDir = join(ROOT, 'components');
const templates = readdirSync(componentsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    id: f.replace(/\.json$/, ''),
    template: (
      JSON.parse(readFileSync(join(componentsDir, f), 'utf8')) as { template: Json }
    ).template,
  }));

/** Literals that stay as they are, with the reason (decision 8 of #869 only covers the checkbox and the disabled state). */
const OPACITY_ALLOWED: Record<string, string> = {
  surface: 'tonal elevation table of Surface.kt (one value per level)',
  carousel: '55% veil over the image (no state token in Compose)',
};
const RADIUS_ALLOWED: Record<string, string> = {
  'bottom-sheet': 'four radii per list: the list does not accept a token per item',
  'navigation-drawer': 'four radii per list (the modal rounds only the outer side)',
  slider: 'track with inner radii of 2 and outer radii of 8 (list of four radii)',
};

describe('no literal that Material 3 names', () => {
  it.each(templates)('$id: literal opacity only 0 or 1', ({ id, template }) => {
    if (id in OPACITY_ALLOWED) return;
    const bad = collect(template, 'opacity').flatMap((v) =>
      numbers(v).filter((n) => n !== 0 && n !== 1),
    );
    expect(bad).toEqual([]);
  });

  it.each(templates)(
    '$id: literal cornerRadius does not repeat a named corner-*',
    ({ id, template }) => {
      if (id in RADIUS_ALLOWED) return;
      const named = new Set(
        Object.entries(tokenValues)
          .filter(
            ([k, v]) =>
              k.startsWith('corner-') && typeof v === 'number' && v > 0 && v < 1000,
          )
          .map(([, v]) => v as number),
      );
      const literal = collect(template, 'cornerRadius').flatMap((v) => numbers(v));
      const bad = literal.filter((n) => n > 0 && n < 1000);
      // The 2 radius of the checkbox and the 3 one of the tabs indicator have no name in the shape set, but the
      // checkbox gets its own token (CheckboxTokens.ContainerShape): no positive literal radius is left.
      expect(bad.filter((n) => named.has(n) || id === 'checkbox')).toEqual([]);
    },
  );

  it('the checkbox uses the corner-checkbox token (2) in place of the literal', () => {
    expect(tokenValues['corner-checkbox']).toBe(2);
  });
});

describe('button: interaction field', () => {
  const button = typeOf('button');
  const field = button.fields.find((f) => f.key === 'interaction');

  it('is an optional enum with the Compose options, default none, outside the code', () => {
    expect(field).toMatchObject({
      key: 'interaction',
      // pt-BR kept: shared library data (field label of libraries/material3-compose)
      label: 'Interação',
      type: 'enum',
      default: 'none',
      options: INTERACTION_OPTIONS.button,
    });
    expect(field?.required).not.toBe(true);
    // `interactionSource` is the Compose parameter that the `ignore` leaves out (import, #1079 S5): it is not the field.
    const code = JSON.stringify(button.code ?? {}).replaceAll('interactionSource', '');
    expect(code).not.toContain('interaction');
  });

  it('the description says the disabled state wins', () => {
    // pt-BR kept: shared library data (field description of libraries/material3-compose)
    expect(field?.description).toMatch(/habilitado|enabled/i);
    expect(field?.description).toMatch(/desabilitad|false/i);
  });

  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, 'button')!;
  const STYLES = ['filled', 'tonal', 'outlined', 'text', 'elevated'];
  const draw = (values: Record<string, string>, mode: 'light' | 'dark') =>
    drawIn(catalog, entry, { label: 'Save', ...values }, mode);

  it.each(['hovered', 'focused', 'pressed'])(
    'has an example for %s that draws without a warning in both modes',
    (state) => {
      const example = entry.examples.find((e) => e.values?.interaction === state);
      expect(example, `example of ${state}`).toBeDefined();
      for (const mode of ['light', 'dark'] as const) {
        const drawing = drawIn(catalog, entry, example?.values ?? {}, mode);
        expect(drawing.warnings, `${state} ${mode}`).toEqual([]);
      }
    },
  );

  it.each(
    STYLES.flatMap((s) => (['light', 'dark'] as const).map((m) => [s, m] as const)),
  )(
    '%s (%s): hovered, focused and pressed differ from none (the layer exists)',
    (style, mode) => {
      const base = JSON.stringify(draw({ style, interaction: 'none' }, mode).root);
      for (const interaction of ['hovered', 'focused', 'pressed']) {
        const drawing = draw({ style, interaction }, mode);
        expect(drawing.warnings).toEqual([]);
        expect(JSON.stringify(drawing.root), `${style} ${interaction}`).not.toBe(base);
      }
    },
  );

  it.each(STYLES)('%s: with enabled false the interaction draws nothing', (style) => {
    for (const mode of ['light', 'dark'] as const) {
      const off = JSON.stringify(
        draw({ style, enabled: 'false', interaction: 'none' }, mode).root,
      );
      for (const interaction of ['hovered', 'focused', 'pressed']) {
        expect(
          JSON.stringify(draw({ style, enabled: 'false', interaction }, mode).root),
          `${style} ${interaction}`,
        ).toBe(off);
      }
    }
  });

  it('pressed and hovered differ from each other in elevated (the elevation changes per state)', () => {
    const a = JSON.stringify(
      draw({ style: 'elevated', interaction: 'hovered' }, 'light').root,
    );
    const b = JSON.stringify(
      draw({ style: 'elevated', interaction: 'pressed' }, 'light').root,
    );
    expect(a).not.toBe(b);
  });
});

describe('final test: the types with the interaction (ME1 to ME5)', () => {
  const types = spec.layers.flatMap((l) => l.annotationTypes);
  const withField = types.filter((t) => t.fields.some((f) => f.key === 'interaction'));

  it('are the 22 types of the stage and the 2 pickers of #897, each with the options and the default', () => {
    expect(withField.map((t) => t.id).sort()).toEqual(
      Object.keys(INTERACTION_OPTIONS).sort(),
    );
    expect(withField).toHaveLength(24);
    for (const t of withField) {
      const f = t.fields.find((x) => x.key === 'interaction');
      expect(f, t.id).toMatchObject({
        type: 'enum',
        default: 'none',
        options: INTERACTION_OPTIONS[t.id],
      });
      expect(f?.required, t.id).not.toBe(true);
    }
  });

  it('no docs/<type>.md of a type with the interaction says the drawing is static', () => {
    for (const t of withField) {
      const doc = readFileSync(join(ROOT, 'docs', `${t.id}.md`), 'utf8');
      // pt-BR kept: shared library data (the docs/*.md of libraries/material3-compose are Portuguese)
      expect(doc, t.id).not.toMatch(/o desenho é estático/i);
      // pt-BR kept: shared library data (the docs/*.md of libraries/material3-compose are Portuguese)
      expect(doc, t.id).not.toMatch(
        /Sem estados? de pressionado, foco e passar o mouse/i,
      );
    }
  });

  it('the library validates with 0 errors and only the known warnings (provisional, #1774)', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);
});

describe('update from the previous library version to the new one', () => {
  it('is additive: no field changes key, type or options, with no migration steps', () => {
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 3;
    for (const layer of previous.layers)
      for (const type of layer.annotationTypes) {
        if (type.id in INTERACTION_OPTIONS)
          type.fields = type.fields.filter((f) => f.key !== 'interaction');
      }
    // 7 after MF4 of #899 (6 was EX4 of #897; 11 after VL2 of #1504; 12 after S5 of #1120; 13 after RC1 of #1743; 14 after R5 of #1110)
    expect(spec.version).toBe(14);
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
