// @vitest-environment node
// Etapa #323 (FC1): showToolWindow/hideToolWindow/toggleToolWindow do store só são importados
// em src/ui e src/app por src/ui/toolWindowLayout.ts. A regra não pode desmontar a do Konva.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message);
}

const raw = `import { showToolWindow, hideToolWindow, toggleToolWindow } from '../store/toolWindows';
export const f = () => [showToolWindow, hideToolWindow, toggleToolWindow];
`;
const allowed = `import { isToolWindowOpen, TOOL_WINDOWS } from '../store/toolWindows';
export const f = () => [isToolWindowOpen, TOOL_WINDOWS];
`;
const konva = `import Konva from 'konva';
export const k = Konva;
`;

describe('janelas de ferramenta: comandos do store só em toolWindowLayout.ts', () => {
  it('import novo em src/ui/ é erro', async () => {
    const messages = await restricted(raw, 'src/ui/review/Novo.tsx');
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain('toolWindowLayout');
  });

  it('import novo em src/app/ é erro', async () => {
    expect((await restricted(raw, 'src/app/Novo.tsx')).length).toBeGreaterThan(0);
  });

  it('toolWindowLayout.ts pode', async () => {
    expect(await restricted(raw, 'src/ui/toolWindowLayout.ts')).toEqual([]);
  });

  it('outros nomes do store continuam livres', async () => {
    expect(await restricted(allowed, 'src/ui/Novo.tsx')).toEqual([]);
  });

  it('a regra do Konva continua valendo em src/ui/', async () => {
    const messages = await restricted(konva, 'src/ui/Novo.tsx');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Konva');
  });
});
