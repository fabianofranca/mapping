// @vitest-environment node
// Fase 8.4: `localStorage`, `sessionStorage` e `indexedDB` só em `src/utils/safeStorage.ts`
// (com try/catch e a chave do canal) e em `src/storage/local.ts` (os bancos). Este teste
// prova que a regra ESLint pega o padrão antigo e que a regra do `src/model/` (a da
// arquitetura, mais estrita) continua valendo: um bloco não substitui o outro.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

/** Mensagens das regras de globais ao lintar `code` como se fosse o arquivo `filePath`. */
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

describe('armazenamento do navegador só em safeStorage.ts e local.ts (regra da fase 8.4)', () => {
  it('localStorage direto em src/app/ é erro', async () => {
    const messages = await restricted(direct, 'src/app/recents.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('safeStorage');
  });

  it('window.sessionStorage em src/ui/ é erro', async () => {
    expect(await restricted(viaWindow, 'src/ui/StatusBar.tsx')).toHaveLength(1);
  });

  it('indexedDB (global e por globalThis) em src/store/ é erro', async () => {
    expect(await restricted(database, 'src/store/review.ts')).toHaveLength(2);
  });

  it('safeStorage.ts e local.ts podem', async () => {
    expect(await restricted(direct + viaWindow, 'src/utils/safeStorage.ts')).toEqual([]);
    expect(await restricted(database, 'src/storage/local.ts')).toEqual([]);
  });

  it('em src/model/, a regra da arquitetura continua: localStorage e document', async () => {
    const code = `export const a = localStorage.getItem('x');
export const b = document.title;
`;
    const messages = await restricted(code, 'src/model/anything.ts');
    expect(messages).toHaveLength(2);
    for (const message of messages) expect(message).toContain('src/model/');
  });
});
