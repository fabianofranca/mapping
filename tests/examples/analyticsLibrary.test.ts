// Example analytics library (`examples/libraries/analytics/`, ME4): the package validates without
// errors, the Event draws the `preview` table and the Transition only applies to arrows.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';

const ROOT = join(__dirname, '../../examples/libraries/analytics');
const SPEC_FILE = 'analytics.spec.json';

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
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('example analytics library', () => {
  it('has the specialization, one component, one document per type and the conventions', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/event.json',
        'docs/conventions.md',
        'docs/event.md',
        'docs/transition.md',
      ].sort(),
    );
  });

  it('validates without errors on the three levels and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    // No warning: the preview fits even at the minimum size.
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    // The conventions (`documents`) count with the two documents of the types.
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 1, docs: 3 });
  });

  it('the specialization is formatVersion 21: floating Event with a component and arrow-only Transition', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec).toMatchObject({ formatVersion: 21, id: 'analytics', version: 3 });
    const [layer] = parsed.spec.layers;
    expect(layer).toMatchObject({ id: 'analytics', name: 'Analytics' });
    const [event, transition] = layer?.annotationTypes ?? [];
    expect(event).toMatchObject({
      id: 'event',
      floating: true,
      labelField: 'name',
      component: 'components/event.json',
    });
    expect(event?.appliesTo).toBeUndefined();
    const props = event?.fields.find((f) => f.key === 'properties');
    expect(props?.type === 'table' && props.columns).toMatchObject([
      { key: 'property', type: 'string', required: true },
      { key: 'value', type: 'string' },
    ]);
    expect(transition).toMatchObject({ id: 'transition', appliesTo: ['arrow'] });
    expect(transition?.component).toBeUndefined();
    expect(transition?.floating).toBeUndefined();
    expect(transition?.fields.map((f) => f.key)).toEqual(['condition', 'event']);
  });

  it('declares its conventions as a library document (stage #1901, decision 28)', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.documents).toEqual([
      { id: 'conventions', name: 'Event conventions', doc: 'docs/conventions.md' },
    ]);
    // The `.md` is a cited package file: the validator does not call it unreferenced.
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.warnings.map((w) => w.message)).not.toContain(
      'file not referenced by the specialization',
    );
    expect(findEntry(buildCatalog(files), 'event')).toBeDefined();
    expect(buildCatalog(files).documents.map((d) => [d.id, d.docText])).toEqual([
      ['conventions', text('docs/conventions.md')],
    ]);
    expect(text('docs/conventions.md')).toMatch(/snake_case/);
  });

  it('the documents say how the event and the transition link by arrow', () => {
    expect(text('docs/event.md')).toMatch(/arrow/);
    expect(text('docs/transition.md')).toMatch(/arrow/);
  });

  it('the Event draws the preview: header with the name and one row per property', () => {
    const catalog = buildCatalog(files);
    expect(catalog.report.errors).toEqual([]);
    const entry = findEntry(catalog, 'event');
    expect(entry?.component?.formatVersion).toBe(2);
    expect(entry?.previewValues?.properties).toHaveLength(3);
    const drawing = drawEntry(entry!, entry!.previewValues ?? {}, approximateMeasurer);
    expect(drawing?.warnings).toEqual([]);
    const texts: string[] = [];
    const visit = (node: SceneNode): void => {
      if (node.type === 'text') texts.push(node.text);
      if (node.type === 'frame') node.children.forEach(visit);
    };
    if (drawing) visit(drawing.root);
    expect(texts).toEqual([
      'checkout_started',
      'source',
      'cart',
      'items',
      '3',
      'total',
      '149.90',
    ]);
  });
});
