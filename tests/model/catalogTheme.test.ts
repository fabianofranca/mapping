// Finding 1 of the #838 report: the Catalog Gallery and Try it draw the examples with the
// tokens and the icon set of the specialization (theme colors, `Add` icon), like the canvas.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { drawEntry, exampleDrawing, findEntry } from '../../src/model/catalog';
import { buildCatalog } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { files, solid } from '../support/material3Library';

const catalog = buildCatalog(files);
const button = findEntry(catalog, 'button')!;

function warningsAndFills(root: SceneNode): string[] {
  const out: string[] = [];
  const visit = (node: SceneNode): void => {
    if ('fills' in node) {
      const c = solid(node.fills);
      if (c !== undefined) out.push(c.toUpperCase());
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  return out;
}

describe('Catalog: Gallery and Try it with the specialization theme', () => {
  it('the Button preview uses the primary color (#6750A4) and not the default gray', () => {
    const drawing = exampleDrawing(catalog, button, undefined, approximateMeasurer)!;
    expect(warningsAndFills(drawing.root)).toContain('#6750A4');
  });

  it('the "Com ícone" example does not warn "unknown icon"', () => {
    // pt-BR kept: the example name comes from the pt-BR library in libraries/material3-compose
    const example = button.examples.find((e) => /ícone/i.test(e.name))!;
    expect(example).toBeDefined();
    const drawing = exampleDrawing(catalog, button, example, approximateMeasurer)!;
    expect(drawing.warnings.filter((w) => /unknown icon/.test(w.text))).toEqual([]);
  });

  it('Try it (drawEntry) also uses the theme', () => {
    const drawing = drawEntry(button, button.previewValues ?? {}, approximateMeasurer)!;
    expect(warningsAndFills(drawing.root)).toContain('#6750A4');
  });
});
