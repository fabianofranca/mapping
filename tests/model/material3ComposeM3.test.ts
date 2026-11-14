// M3 of the "faithful Material 3" stage: the 9 selection and input components in format 4.
// The values of each component against the `.kt` files live in the `material3ComposeM3*.test.ts` files.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  SPEC_FILE,
  unknownWarnings,
  drawIn,
  files,
  text,
  v1Preview,
  v1WithEstados,
  COMPOSE_SIZES,
} from '../support/material3Library';
import v1 from '../fixtures/material3-m3-v1.json';

const M3 = [
  'checkbox',
  'radio-button',
  'switch',
  'slider',
  'text-field',
  'secure-text-field',
  'search-bar',
  'segmented-button',
  'progress-indicator',
];
const BAD_WARNING =
  // pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
  /não cabe|text larger than the box|unknown icon|stretched icon|does not exist in the specialization tokens/i;

type Rec = Record<string, unknown>;
const rawSpec = JSON.parse(text(SPEC_FILE)) as { layers: { annotationTypes: Rec[] }[] };
const rawTypes: Record<string, Rec> = Object.fromEntries(
  rawSpec.layers.flatMap((l) => l.annotationTypes).map((t) => [t.id as string, t]),
);
const component = (id: string): Rec => JSON.parse(text(`components/${id}.json`)) as Rec;

/** The catalog is built once, at collection: building it inside the test took over 5 s with coverage on in CI. */
const shared = buildCatalog(files);

describe('M3 — selection and input in format 4', () => {
  it.each(M3)('%s is format 4, with no literal color and no literal family', (id) => {
    const raw = text(`components/${id}.json`);
    expect(component(id).formatVersion).toBe(4);
    expect(raw).not.toMatch(/"family"/);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
  });

  it.each(M3)('%s does not repeat the SVG path of a chosen icon', (id) => {
    expect(text(`components/${id}.json`)).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it.each(M3)('%s: fields, examples, preview, minSize and size equal to those of v1', (id) => {
    const before = (v1.components as Record<string, Rec>)[id]!;
    const type = rawTypes[id]!;
    const now = component(id);
    const { actual, expected } = v1WithEstados(id, type, before);
    expect(actual).toEqual(expected);
    expect(now.preview).toEqual(v1Preview(id, before.preview));
    expect(now.minSize).toEqual(before.minSize);
    // #863: text-field and secure-text-field go from 76 (v1) to 84, which fits the outlined style with supporting text.
    const heightFixed = id === 'text-field' || id === 'secure-text-field';
    expect(now.size).toEqual(
      COMPOSE_SIZES[id] ??
        (heightFixed ? { ...(before.size as object), height: 84 } : before.size),
    );
  });

  it.each(M3)('%s: the default and the examples draw without warnings in light and dark', (id) => {
    const catalog = shared;
    const entry = findEntry(catalog, id)!;
    const cases = [{}, ...(entry.examples ?? []).map((e) => e.values)];
    for (const mode of ['light', 'dark'] as const) {
      for (const values of cases) {
        const drawing = drawIn(catalog, entry, values ?? {}, mode);
        expect(drawing.warnings.filter((w) => BAD_WARNING.test(w))).toEqual([]);
      }
    }
  });

  it('the library validates with 0 errors and only the known warnings (provisional, #1774)', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
  }, 30_000);
});
