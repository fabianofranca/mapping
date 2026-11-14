// @vitest-environment node
// Stage #323 (FC1): showToolWindow/hideToolWindow/toggleToolWindow of the store are only imported
// in src/ui and src/app by src/ui/toolWindowLayout.ts. The rule must not take down the Konva one.
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

describe('tool windows: store commands only in toolWindowLayout.ts', () => {
  it('a new import in src/ui/ is an error', async () => {
    const messages = await restricted(raw, 'src/ui/review/Novo.tsx');
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain('toolWindowLayout');
  });

  it('a new import in src/app/ is an error', async () => {
    expect((await restricted(raw, 'src/app/Novo.tsx')).length).toBeGreaterThan(0);
  });

  it('toolWindowLayout.ts pode', async () => {
    expect(await restricted(raw, 'src/ui/toolWindowLayout.ts')).toEqual([]);
  });

  it('other names from the store are still free', async () => {
    expect(await restricted(allowed, 'src/ui/Novo.tsx')).toEqual([]);
  });

  it('the Konva rule still applies in src/ui/', async () => {
    const messages = await restricted(konva, 'src/ui/Novo.tsx');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Konva');
  });
});
