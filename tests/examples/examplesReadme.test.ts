import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `examples/README.md` says what each example shows. This test keeps it current: every example on
 * disk has a section (a heading with the path in backticks) and every heading path that starts
 * with `libraries/` or `examples/` still exists.
 */

const ROOT = join(__dirname, '..', '..');
const README = join(ROOT, 'examples', 'README.md');

function dirs(parent: string): string[] {
  return readdirSync(join(ROOT, parent))
    .filter((name) => statSync(join(ROOT, parent, name)).isDirectory())
    .sort()
    .map((name) => `${parent}/${name}/`);
}

function files(parent: string, extension: string): string[] {
  return readdirSync(join(ROOT, parent))
    .filter(
      (name) => name.endsWith(extension) && statSync(join(ROOT, parent, name)).isFile(),
    )
    .sort()
    .map((name) => `${parent}/${name}`);
}

/** The examples on disk: library folders, specialization files, zips and projects. */
function diskExamples(): string[] {
  return [
    ...dirs('libraries'),
    ...dirs('examples/libraries'),
    ...files('examples/specs', '.json'),
    ...files('examples', '.zip'),
    'examples/full-example/',
    'examples/workspace/',
  ];
}

/** Paths in backticks in the README headings (lines that start with `#`). */
function headingPaths(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(README, 'utf8').split('\n')) {
    if (!line.startsWith('#')) continue;
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      if (match[1] !== undefined) out.push(match[1]);
    }
  }
  return out;
}

describe('examples/README.md', () => {
  it('exists', () => {
    expect(existsSync(README)).toBe(true);
  });

  it('has a section for every example on disk', () => {
    const titled = new Set(headingPaths());
    const missing = diskExamples().filter((path) => !titled.has(path));
    expect(
      missing,
      `example without a section in examples/README.md (heading with the path in backticks): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('has no section for an example that no longer exists', () => {
    const stale = headingPaths()
      .filter((path) => path.startsWith('libraries/') || path.startsWith('examples/'))
      .filter((path) => !existsSync(join(ROOT, path)));
    expect(
      stale,
      `examples/README.md section points to a path that does not exist: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
