// Example library `drawing-extras`: radial and angular gradients in a node's `fill` and the inner shadow.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/drawing-extras');
const SPEC_FILE = 'drawing-extras.spec.json';

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

describe('example library drawing-extras', () => {
  it('has the specialization, two components and two documents', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/gradients.json',
        'components/inner-shadow.json',
        'docs/gradients.md',
        'docs/inner-shadow.md',
      ].sort(),
    );
  });

  it('validates without errors and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ types: 2, components: 2, docs: 2 });
  });

  it('draws the three gradient types, one of them from a $switch', () => {
    const json = text('components/gradients.json');
    for (const type of ['radial', 'angular', 'linear']) {
      expect(json).toContain(`"type": "${type}"`);
    }
    expect(json).toContain('"$switch": "kind"');
  });

  it('draws a sunken field, a pressed button with two inner shadows and a raised one', () => {
    const json = text('components/inner-shadow.json');
    expect(json.match(/"inner": true/g)).toHaveLength(3);
    expect(json).toContain('"name": "field"');
    expect(json).toContain('"name": "pressed"');
    expect(json).toContain('"name": "raised"');
  });
});
