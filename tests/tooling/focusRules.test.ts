// @vitest-environment node
// Stage 8 (8.3): the automatic rules for focus and keyboard (`docs/ARCHITECTURE.md`,
// "Focus and keyboard"). This file is the permanent proof that they catch the old pattern.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax');
}

describe('ESLint: global DOM query in src/ui and src/app (F4)', () => {
  // The Export return of `main` before 8.3: the button found by the shortcut text.
  const oldExportButton = `
const exportButton = () =>
  document.querySelector<HTMLElement>(
    \`.main-bar button[aria-keyshortcuts="Ctrl+E"]\`,
  );
export { exportButton };
`;

  it.each(['src/app/ExportProbe.tsx', 'src/ui/ExportProbe.tsx'])(
    'the exportButton by global selector is refused in %s',
    async (file) => {
      const found = await messages(oldExportButton, file);
      expect(found.map((m) => m.message).join('\n')).toMatch(/global DOM query/i);
      expect(found.map((m) => m.message).join('\n')).toMatch(/class selector/i);
    },
  );

  it.each([
    "document.querySelector('dialog[open]');",
    "document.querySelectorAll('button');",
    "document.getElementById('help-x');",
  ])('%s is refused', async (code) => {
    const found = await messages(`export const f = () => ${code}\n`, 'src/app/Probe.ts');
    expect(found).toHaveLength(1);
  });

  it('class selector inside a ref too (crosses components)', async () => {
    const code = `
export function f(root: HTMLElement) {
  root.querySelector<HTMLElement>('.icon-button')?.focus();
  root.querySelector(\`.grid-cell-menu \${'x'}\`);
}
`;
    const found = await messages(code, 'src/ui/Probe.tsx');
    expect(found).toHaveLength(2);
    expect(found[0]?.message).toMatch(/class selector/i);
  });

  it('data-* and role inside a ref pass', async () => {
    const code = `
export function f(root: HTMLElement) {
  root.querySelector('[data-grip]');
  root.querySelectorAll('[role="menuitem"]:not(:disabled)');
}
`;
    expect(await messages(code, 'src/ui/Probe.tsx')).toEqual([]);
  });

  // Stage 8 (8.7), residue 5: `closest('.class')` also crosses components (the resize shortcut
  // found the window and the column by the classes of ToolWindow and EditorWindows).
  const oldFocusedWindow = `
export function focusedWindow(el: Element) {
  const win = document.activeElement?.closest('.tool-window');
  const column = el.closest(\`.tool-column\`);
  return { win, column };
}
`;

  it.each(['src/app/Probe.ts', 'src/ui/Probe.tsx', 'src/ui/toolWindowLayout.ts'])(
    'closest by class is refused in %s (literal and template)',
    async (file) => {
      const found = await messages(oldFocusedWindow, file);
      expect(found).toHaveLength(2);
      expect(found.every((m) => /class selector/i.test(m.message))).toBe(true);
    },
  );

  it('closest by data-* and by tag passes', async () => {
    const code = `
export function f(el: Element) {
  el.closest('[data-window]');
  el.closest('[data-tool-column]');
  el.closest('button');
}
`;
    expect(await messages(code, 'src/app/Probe.ts')).toEqual([]);
  });

  it('outside src/ui and src/app the rule does not apply', async () => {
    const code = "export const f = () => document.querySelector('.x');\n";
    expect(await messages(code, 'src/storage/Probe.ts')).toEqual([]);
  });

  // In the flat config the last `no-restricted-syntax` block wins: the focus blocks join
  // the session selectors (8.1), and neither of the two sets disappears in src/ui and src/app.
  it.each(['src/app/Probe.tsx', 'src/ui/Probe.tsx', 'src/ui/focus.ts'])(
    'the session rule (8.1) still applies in %s',
    async (file) => {
      const code = 'export const f = (s: { saveMapping(): void }) => s.saveMapping();\n';
      const found = await messages(code, file);
      expect(found.map((m) => m.message).join('\n')).toMatch(/Only the session/);
    },
  );

  it('in the controller the session exception and the focus rule apply', async () => {
    const code = `
export function other(s: { saveMapping(): void }) {
  s.saveMapping();
  return document.querySelector('dialog[open]');
}
`;
    const found = (await messages(code, 'src/app/controller.ts')).map((m) => m.message);
    expect(found.join('\n')).toMatch(/createFolderProject/);
    expect(found.join('\n')).toMatch(/global DOM query/i);
  });
});

/** All the `.tsx` of `src/`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** `aria-keyshortcuts` syntax (WAI-ARIA): modifiers + one key, separated by "+". */
const ARIA_KEYS =
  /^(?:(?:Control|Alt|Shift|Meta)\+)*(?:[A-Z0-9,.=\-/[\]\\;'`]|Plus|Space|Enter|Escape|Backspace|Delete|Tab|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F\d{1,2})(?: (?:(?:Control|Alt|Shift|Meta)\+)*(?:[A-Z0-9,.=\-/[\]\\;'`]|Plus|Space|Enter|Escape|Backspace|Delete|Tab|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F\d{1,2}))*$/;

describe('aria-keyshortcuts always in the ARIA syntax (F5)', () => {
  const uses = sources('src').flatMap((file) =>
    [
      ...readFileSync(file, 'utf8').matchAll(/aria-keyshortcuts=(\{[^}\n]*\}?|"[^"]*")/g),
    ].map((m) => ({ file, value: m[1] ?? '' })),
  );

  it('there are uses to check', () => {
    expect(uses.length).toBeGreaterThan(5);
  });

  it('every use is an ARIA literal or goes through ariaKeys()', () => {
    const wrong = uses.filter(({ value }) => {
      if (value.startsWith('"')) return !ARIA_KEYS.test(value.slice(1, -1));
      return !/^\{ariaKeys(?:All)?\(/.test(value);
    });
    expect(wrong).toEqual([]);
  });
});
