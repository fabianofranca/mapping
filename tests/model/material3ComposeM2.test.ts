// M2 of the "faithful Material 3" stage: the 19 layout and action components in format 4.
// The values of each component against the `.kt` files live in the `material3ComposeM2*.test.ts` files.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import {
  SPEC_FILE,
  unknownWarnings,
  drawIn,
  files,
  text,
  V1_NO_DEFAULT,
  v1WithEstados,
  COMPOSE_SIZES,
} from '../support/material3Library';
import v1 from '../fixtures/material3-m2-v1.json';

const M2 = [
  'scaffold',
  'box',
  'row',
  'column',
  'lazy-column',
  'lazy-row',
  'lazy-vertical-grid',
  'flow-row',
  'spacer',
  'horizontal-pager',
  'button',
  'fab',
  'extended-fab',
  'icon-button',
  'icon-toggle-button',
  'chip',
  'badge',
  'card',
  'image',
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

describe('M2 — layout and actions in format 4', () => {
  it.each(M2)('%s is format 4, with no literal color and no literal family', (id) => {
    const raw = text(`components/${id}.json`);
    expect(component(id).formatVersion).toBe(4);
    expect(raw).not.toMatch(/"family"/);
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
  });

  it.each(M2)('%s does not repeat the SVG path of a chosen icon', (id) => {
    expect(text(`components/${id}.json`)).not.toMatch(/"M\d[^"]{40,}"/);
  });

  it.each(M2)('%s: fields, examples, preview, minSize and size equal to those of v1', (id) => {
    const before = (v1.components as Record<string, Rec>)[id]!;
    const type = rawTypes[id]!;
    const now = component(id);
    const { actual, expected } = v1WithEstados(id, type, before);
    expect(actual).toEqual(expected);
    const dropped = V1_NO_DEFAULT[id];
    const previewBefore = { ...(before.preview as Rec) };
    if (dropped !== undefined) delete previewBefore[dropped];
    expect(now.preview).toEqual(previewBefore);
    expect(now.minSize).toEqual(before.minSize);
    expect(now.size).toEqual(COMPOSE_SIZES[id] ?? before.size);
  });

  it.each(M2)('%s: the default and the examples draw without warnings in light and dark', (id) => {
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
