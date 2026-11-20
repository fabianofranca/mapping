// Example library `composition` (CC5): component nodes (`component`, `values`, `provide`) and the
// corner alignment of the anchor, in a small icon-button package.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/composition');
const SPEC_FILE = 'composition.spec.json';

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

describe('example library composition', () => {
  it('has the specialization, one component and one document per type', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        ...['glyph', 'spinner', 'badge', 'icon-button'].flatMap((t) => [
          `components/${t}.json`,
          `docs/${t}.md`,
        ]),
      ].sort(),
    );
  });

  it('validates without errors on the three levels and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 4, components: 4, docs: 4 });
  });
});
