// @vitest-environment node
// Phase 8.1: only the session reads and writes the `mapping.json` of an open project. The ESLint rule
// (`sessionStorageSyntaxRules` in eslint.config.js) prevents the regression; this test proves that
// it catches the old pattern in `src/app/` and `src/ui/` (where phase 8.3 also uses
// `no-restricted-syntax`: if one block replaces the other in the merge, this test breaks).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Messages of `no-restricted-syntax` when linting `code` as if it were the file `filePath`. */
async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message);
}

const read = `export async function x(storage: { loadMapping(): Promise<string | null> }) {
  return storage.loadMapping();
}
`;
const write = `export async function x(storage: { saveMapping(text: string): Promise<void> }) {
  await storage.saveMapping('{}');
}
`;

describe('loadMapping/saveMapping outside the session (phase 8.1 rule)', () => {
  it('reading mapping.json in src/app/ is an error', async () => {
    const messages = await restricted(read, 'src/app/useExternalChanges.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('session.ts');
  });

  it('writing mapping.json in src/ui/ is an error', async () => {
    expect(await restricted(write, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('writing in src/storage/ (outside the implementations) is an error', async () => {
    expect(await restricted(write, 'src/storage/share.ts')).toHaveLength(1);
  });

  it('in session.ts, saveMapping only inside writeProject and loadMapping only inside readMapping', async () => {
    const outside = `declare const storage: { saveMapping(t: string): Promise<void>; loadMapping(): Promise<string | null> };
const other = async () => {
  await storage.saveMapping('{}');
  return storage.loadMapping();
};
export { other };
`;
    expect(await restricted(outside, 'src/store/session.ts')).toHaveLength(2);
    const inside = `declare const storage: { saveMapping(t: string): Promise<void>; loadMapping(): Promise<string | null> };
const readMapping = () => storage.loadMapping();
const writeProject = async () => {
  await storage.saveMapping('{}');
};
export { readMapping, writeProject };
`;
    expect(await restricted(inside, 'src/store/session.ts')).toEqual([]);
  });

  // Phase 8.4: the controller checks the existence of the project through `hasMappingFile` (folder.ts);
  // `loadMapping` became forbidden in it too (before it was free, for those checks).
  it('in controller.ts, saveMapping only inside createFolderProject; loadMapping is forbidden', async () => {
    const outside = `declare const storage: { saveMapping(t: string): Promise<void>; loadMapping(): Promise<string | null> };
export async function other() {
  await storage.saveMapping('{}');
  return storage.loadMapping();
}
`;
    expect(await restricted(outside, 'src/app/controller.ts')).toHaveLength(2);
    const inside = `declare const storage: { saveMapping(t: string): Promise<void> };
export function createFolderProject() {
  return storage.saveMapping('{}');
}
`;
    expect(await restricted(inside, 'src/app/controller.ts')).toEqual([]);
  });

  it('createFolderProject also does not read mapping.json through the storage', async () => {
    const inside = `declare const storage: { loadMapping(): Promise<string | null> };
export function createFolderProject() {
  return storage.loadMapping();
}
`;
    expect(await restricted(inside, 'src/app/controller.ts')).toHaveLength(1);
  });

  it('the new modules of the split (recents.ts) inherit the rule', async () => {
    expect(await restricted(read, 'src/app/recents.ts')).toHaveLength(1);
  });

  it('loadProject.ts may read mapping.json', async () => {
    expect(await restricted(read, 'src/storage/loadProject.ts')).toEqual([]);
  });
});
