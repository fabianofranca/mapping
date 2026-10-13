// @vitest-environment node
// Fase 8.1: só a sessão lê e grava o `mapping.json` de um projeto aberto. A regra ESLint
// (`sessionStorageSyntaxRules` em eslint.config.js) impede a regressão; este teste prova que
// ela pega o padrão antigo em `src/app/` e `src/ui/` (onde a fase 8.3 também usa
// `no-restricted-syntax`: se um bloco substituir o outro no merge, este teste quebra).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Mensagens de `no-restricted-syntax` ao lintar `code` como se fosse o arquivo `filePath`. */
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

describe('loadMapping/saveMapping fora da sessão (regra da fase 8.1)', () => {
  it('ler o mapping.json em src/app/ é erro', async () => {
    const messages = await restricted(read, 'src/app/useExternalChanges.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('session.ts');
  });

  it('gravar o mapping.json em src/ui/ é erro', async () => {
    expect(await restricted(write, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('gravar em src/storage/ (fora das implementações) é erro', async () => {
    expect(await restricted(write, 'src/storage/share.ts')).toHaveLength(1);
  });

  it('em session.ts, saveMapping só dentro de writeProject e loadMapping só dentro de readMapping', async () => {
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

  it('em controller.ts, saveMapping só dentro de createFolderProject; loadMapping é livre', async () => {
    const outside = `declare const storage: { saveMapping(t: string): Promise<void>; loadMapping(): Promise<string | null> };
export async function other() {
  await storage.saveMapping('{}');
  return storage.loadMapping();
}
`;
    expect(await restricted(outside, 'src/app/controller.ts')).toHaveLength(1);
    const inside = `declare const storage: { saveMapping(t: string): Promise<void> };
export function createFolderProject() {
  return storage.saveMapping('{}');
}
`;
    expect(await restricted(inside, 'src/app/controller.ts')).toEqual([]);
  });

  it('loadProject.ts pode ler o mapping.json', async () => {
    expect(await restricted(read, 'src/storage/loadProject.ts')).toEqual([]);
  });
});
