// @vitest-environment node
// Phase 8.4: `localStorage`, `sessionStorage` and `indexedDB` only in `src/utils/safeStorage.ts`
// (with try/catch and the channel key) and in `src/storage/local.ts` (the databases). This test
// proves that the ESLint rule catches the old pattern and that the `src/model/` rule (the
// architecture one, stricter) still applies: one block does not replace the other.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Messages of the globals rules when linting `code` as if it were the file `filePath`. */
async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter(
      (m) =>
        m.ruleId === 'no-restricted-globals' || m.ruleId === 'no-restricted-properties',
    )
    .map((m) => m.message);
}

const direct = `export const value = localStorage.getItem('x');
`;
const viaWindow = `export const value = window.sessionStorage.getItem('x');
`;
const database = `export const ok = typeof indexedDB !== 'undefined' && globalThis.indexedDB !== null;
`;

describe('browser storage only in safeStorage.ts and local.ts (phase 8.4 rule)', () => {
  it('direct localStorage in src/app/ is an error', async () => {
    const messages = await restricted(direct, 'src/app/recents.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('safeStorage');
  });

  it('window.sessionStorage in src/ui/ is an error', async () => {
    expect(await restricted(viaWindow, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('indexedDB (global and through globalThis) in src/store/ is an error', async () => {
    expect(await restricted(database, 'src/store/review.ts')).toHaveLength(2);
  });

  it('safeStorage.ts and local.ts may', async () => {
    expect(await restricted(direct + viaWindow, 'src/utils/safeStorage.ts')).toEqual([]);
    expect(await restricted(database, 'src/storage/local.ts')).toEqual([]);
  });

  it('in src/model/, the architecture rule still applies: localStorage and document', async () => {
    const code = `export const a = localStorage.getItem('x');
export const b = document.title;
`;
    const messages = await restricted(code, 'src/model/anything.ts');
    expect(messages).toHaveLength(2);
    for (const message of messages) expect(message).toContain('src/model/');
  });
});
