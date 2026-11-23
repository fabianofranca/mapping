import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FormatRunner } from '../../src/model';
import {
  formatIssuesOf,
  validatePackage,
  validatePackageWithFormats,
} from '../../src/store/packageValidation';
import type { SpecPackageFiles } from '../../src/store/project';
import {
  FORMAT_LIB_DIR,
  FORMAT_LIB_SPEC_FILE,
  behaviorsOf,
  runnerOf,
} from '../support/notesFormat';

// The format checks of a package in the app (stage #2035, AF5, decision 13): after the three levels
// of the library, the formats' plugins run in the app's runner (here the fake of the notes plugin);
// a problem is an error, so `ok` is false and the apply is blocked.

/** The format-library package in memory: the plugin text is a key of the fake runner; the example is a Blob, as a folder or a zip gives it. */
function notesPackage(plugin = 'NOTES'): Map<string, string | Blob> {
  return new Map<string, string | Blob>([
    [
      FORMAT_LIB_SPEC_FILE,
      readFileSync(`${FORMAT_LIB_DIR}/${FORMAT_LIB_SPEC_FILE}`, 'utf8'),
    ],
    ['plugins/notes.js', plugin],
    [
      'examples/notes.txt',
      new Blob([readFileSync(`${FORMAT_LIB_DIR}/examples/notes.txt`)]),
    ],
  ]);
}

function runnerFor(files: SpecPackageFiles): FormatRunner {
  const texts: Record<string, string> = {};
  for (const [path, data] of files) if (typeof data === 'string') texts[path] = data;
  return runnerOf(behaviorsOf(texts));
}

describe('validatePackageWithFormats', () => {
  it('a package whose formats work is valid, as without the format checks', async () => {
    const files = notesPackage();
    const report = await validatePackageWithFormats(files, undefined, undefined, {
      run: runnerFor(files),
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual(validatePackage(files).issues);
  });

  it('a plugin that fails while loading is an error at fileFormats[0] and the report is not ok', async () => {
    const files = notesPackage('THROWS-ON-LOAD');
    const report = await validatePackageWithFormats(files, undefined, undefined, {
      run: runnerFor(files),
    });
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({
      file: FORMAT_LIB_SPEC_FILE,
      path: 'fileFormats[0]',
      severity: 'error',
    });
    expect(report.errors[0]!.message).toMatch(/boom/);
    expect(report.issues).toContain(report.errors[0]);
  });

  it('an example that does not round-trip is an error at fileFormats[0].examples[0]', async () => {
    const files = notesPackage();
    files.set('examples/notes.txt', new Blob(['Alpha\n\n  color=red\nBeta\n']));
    const report = await validatePackageWithFormats(files, undefined, undefined, {
      run: runnerFor(files),
    });
    expect(report.errors.map((e) => e.path)).toEqual(['fileFormats[0].examples[0]']);
    expect(report.errors[0]!.message).toMatch(/round-trip/);
  });

  it('does not run a plugin when a lower level already failed, nor for a package without formats', async () => {
    const run = vi.fn<FormatRunner>();
    const missing = notesPackage();
    missing.delete('plugins/notes.js');
    const lower = await validatePackageWithFormats(missing, undefined, undefined, {
      run,
    });
    expect(lower.ok).toBe(false);
    const bare = notesPackage();
    const spec = JSON.parse(bare.get(FORMAT_LIB_SPEC_FILE) as string) as Record<
      string,
      unknown
    >;
    delete spec['fileFormats'];
    bare.set(FORMAT_LIB_SPEC_FILE, JSON.stringify(spec));
    bare.delete('plugins/notes.js');
    await validatePackageWithFormats(bare, undefined, undefined, { run });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('formatIssuesOf', () => {
  it('gives only the problems the formats add to a report', async () => {
    const files = notesPackage('THROWS-ON-LOAD');
    const base = validatePackage(files);
    const added = await formatIssuesOf(files, base, { run: runnerFor(files) });
    expect(base.ok).toBe(true);
    expect(added.map((i) => i.path)).toEqual(['fileFormats[0]']);
  });
});
