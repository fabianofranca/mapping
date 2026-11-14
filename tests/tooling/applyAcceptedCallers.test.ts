// @vitest-environment node
// Return of the gate of 8.2 (finding 7): ratchet of the "apply in progress". While the
// apply of the accepted ones runs, the review holds the re-evaluation (`derived.hold()`), and the one that
// holds it is `review.apply()` (`src/store/review.ts`). That is why only it calls
// `proposalActions.applyAccepted(`: a new caller would apply without holding and would bring back the
// false "Apply blocked" and "The project changed since your last session" in the
// middle of the apply. The list is exact (`toEqual`): a new caller breaks this test.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PATTERN = /\.applyAccepted\(/;

/** Files (sorted) that call `.applyAccepted(`. */
export function callersOf(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([, text]) => PATTERN.test(text))
    .map(([path]) => path)
    .sort();
}

/** `{ relative path → text }` of every `.ts`/`.tsx` under `dir`. */
function sources(dir: string, root = dir): Map<string, string> {
  const result = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const [k, v] of sources(path, root)) result.set(k, v);
    } else if (/\.tsx?$/.test(name)) {
      result.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
    }
  }
  return result;
}

/** Who may call `.applyAccepted(`: only `review.apply()`, which holds the review. */
const ALLOWED = ['src/store/review.ts'];

describe('apply accepted: only review.apply() calls applyAccepted', () => {
  it('the callers in src/ are exactly the allowed ones', () => {
    const files = sources(join(process.cwd(), 'src'), process.cwd());
    expect(callersOf(files)).toEqual(ALLOWED);
  });

  it('the scan catches a new caller and lets the right one through', () => {
    const files = new Map([
      ['src/store/review.ts', 'return proposalActions.applyAccepted(id);'],
      ['src/ui/review/New.tsx', 'void session.proposalActions.applyAccepted(id);'],
      ['src/ui/review/Right.tsx', 'const result = await review.apply();'],
      // The model function is not the session apply.
      ['src/store/proposalActions.ts', 'const applying = applyAccepted(base, p, now());'],
    ]);
    expect(callersOf(files)).toEqual(['src/store/review.ts', 'src/ui/review/New.tsx']);
  });
});
