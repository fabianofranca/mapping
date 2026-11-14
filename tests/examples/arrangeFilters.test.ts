import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  approximateMeasurer,
  arrangeMarking,
  deserialize,
  loadSpecComponents,
  parseSpecText,
  type ComponentCatalog,
} from '../../src/model';
import { readProjectZip } from '../../src/storage/zip';
import { EXAMPLE_ZIP } from '../../scripts/exampleProject.mjs';

// The Arrange of the "Filters" Row of the example (Material 3 chips): each chip keeps the width of
// its label. The chip is a `none` `hug` root whose only content is a frame stretched by anchors
// (no width of its own, so `fill`); measured with no limit it was 0 and Arrange wrote width 1.
// The defect did not depend on the text measurer (it also fails with the approximate one).
describe('full-example: Arrange on the "Filters" Row', () => {
  it('the chips keep the natural width of the label, not 1', async () => {
    const read = await readProjectZip(new Blob([readFileSync(EXAMPLE_ZIP)]));
    if (!read.ok) throw new Error(`unreadable zip: ${read.error}`);
    const parsed = deserialize(read.files.mapping, undefined, read.files.specs);
    if (!parsed.ok) throw new Error(`invalid mapping.json: ${parsed.error.code}`);
    const project = parsed.project;
    const owner = project.specializations.find((s) => s.id === 'material3-compose');
    if (owner === undefined) throw new Error('no material3-compose');
    const spec = parseSpecText(read.files.specs.get(owner.file) ?? '');
    if (!spec.ok) throw new Error('invalid specialization');
    const catalog: ComponentCatalog = new Map([
      [
        owner.id,
        loadSpecComponents(spec.spec, owner.file, owner.version, (path) =>
          read.files.specs.get(path),
        ),
      ],
    ]);
    const row = project.markings.find((m) => m.name === 'Filters');
    if (row === undefined) throw new Error('no Filters Row');

    const arranged = arrangeMarking(project, catalog, row.id, approximateMeasurer);
    const chips = arranged.project.markings.filter((m) => m.parentId === row.id);

    expect(chips).toHaveLength(3);
    for (const chip of chips)
      expect(chip.rect.width, chip.name ?? chip.id).toBeGreaterThan(40);
    // In a row, with no overlap (spacing 8).
    expect(chips[1]?.rect.x).toBe(
      (chips[0]?.rect.x ?? 0) + (chips[0]?.rect.width ?? 0) + 8,
    );
  });
});
