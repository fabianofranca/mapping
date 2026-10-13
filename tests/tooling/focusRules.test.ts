// @vitest-environment node
// Etapa 8 (8.3): as regras automáticas do foco e do teclado (`docs/ARCHITECTURE.md`,
// "Foco e teclado"). Este arquivo é a prova permanente de que elas pegam o padrão antigo.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax');
}

describe('ESLint: consulta global ao DOM em src/ui e src/app (F4)', () => {
  // O retorno do Exportar da `main` antes da 8.3: o botão achado pelo texto do atalho.
  const oldExportButton = `
const exportButton = () =>
  document.querySelector<HTMLElement>(
    \`.main-bar button[aria-keyshortcuts="Ctrl+E"]\`,
  );
export { exportButton };
`;

  it.each(['src/app/ExportProbe.tsx', 'src/ui/ExportProbe.tsx'])(
    'o exportButton por seletor global é recusado em %s',
    async (file) => {
      const found = await messages(oldExportButton, file);
      expect(found.map((m) => m.message).join('\n')).toMatch(/consulta global ao DOM/i);
      expect(found.map((m) => m.message).join('\n')).toMatch(/seletor por classe/i);
    },
  );

  it.each([
    "document.querySelector('dialog[open]');",
    "document.querySelectorAll('button');",
    "document.getElementById('help-x');",
  ])('%s é recusado', async (code) => {
    const found = await messages(`export const f = () => ${code}\n`, 'src/app/Probe.ts');
    expect(found).toHaveLength(1);
  });

  it('seletor por classe dentro de um ref também (atravessa componentes)', async () => {
    const code = `
export function f(root: HTMLElement) {
  root.querySelector<HTMLElement>('.icon-button')?.focus();
  root.querySelector(\`.grid-cell-menu \${'x'}\`);
}
`;
    const found = await messages(code, 'src/ui/Probe.tsx');
    expect(found).toHaveLength(2);
    expect(found[0]?.message).toMatch(/seletor por classe/i);
  });

  it('data-* e role dentro de um ref passam', async () => {
    const code = `
export function f(root: HTMLElement) {
  root.querySelector('[data-grip]');
  root.querySelectorAll('[role="menuitem"]:not(:disabled)');
}
`;
    expect(await messages(code, 'src/ui/Probe.tsx')).toEqual([]);
  });

  // Etapa 8 (8.7), resíduo 5: `closest('.classe')` também atravessa componentes (o atalho de
  // redimensionar achava a janela e a coluna pelas classes do ToolWindow e do EditorWindows).
  const oldFocusedWindow = `
export function focusedWindow(el: Element) {
  const win = document.activeElement?.closest('.tool-window');
  const column = el.closest(\`.tool-column\`);
  return { win, column };
}
`;

  it.each(['src/app/Probe.ts', 'src/ui/Probe.tsx', 'src/ui/toolWindowLayout.ts'])(
    'closest por classe é recusado em %s (literal e template)',
    async (file) => {
      const found = await messages(oldFocusedWindow, file);
      expect(found).toHaveLength(2);
      expect(found.every((m) => /seletor por classe/i.test(m.message))).toBe(true);
    },
  );

  it('closest por data-* e por tag passa', async () => {
    const code = `
export function f(el: Element) {
  el.closest('[data-window]');
  el.closest('[data-tool-column]');
  el.closest('button');
}
`;
    expect(await messages(code, 'src/app/Probe.ts')).toEqual([]);
  });

  it('fora de src/ui e src/app a regra não vale', async () => {
    const code = "export const f = () => document.querySelector('.x');\n";
    expect(await messages(code, 'src/storage/Probe.ts')).toEqual([]);
  });

  // No flat config o último bloco de `no-restricted-syntax` vence: os blocos do foco juntam
  // os seletores da sessão (8.1), e nenhum dos dois conjuntos some em src/ui e src/app.
  it.each(['src/app/Probe.tsx', 'src/ui/Probe.tsx', 'src/ui/focus.ts'])(
    'a regra da sessão (8.1) continua valendo em %s',
    async (file) => {
      const code = 'export const f = (s: { saveMapping(): void }) => s.saveMapping();\n';
      const found = await messages(code, file);
      expect(found.map((m) => m.message).join('\n')).toMatch(/Só a sessão/);
    },
  );

  it('no controller valem a exceção da sessão e a regra do foco', async () => {
    const code = `
export function other(s: { saveMapping(): void }) {
  s.saveMapping();
  return document.querySelector('dialog[open]');
}
`;
    const found = (await messages(code, 'src/app/controller.ts')).map((m) => m.message);
    expect(found.join('\n')).toMatch(/createFolderProject/);
    expect(found.join('\n')).toMatch(/consulta global ao DOM/i);
  });
});

/** Todos os `.tsx` de `src/`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Sintaxe de `aria-keyshortcuts` (WAI-ARIA): modificadores + uma tecla, separados por "+". */
const ARIA_KEYS =
  /^(?:(?:Control|Alt|Shift|Meta)\+)*(?:[A-Z0-9,.=\-/[\]\\;'`]|Plus|Space|Enter|Escape|Backspace|Delete|Tab|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F\d{1,2})(?: (?:(?:Control|Alt|Shift|Meta)\+)*(?:[A-Z0-9,.=\-/[\]\\;'`]|Plus|Space|Enter|Escape|Backspace|Delete|Tab|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|F\d{1,2}))*$/;

describe('aria-keyshortcuts sempre na sintaxe ARIA (F5)', () => {
  const uses = sources('src').flatMap((file) =>
    [
      ...readFileSync(file, 'utf8').matchAll(/aria-keyshortcuts=(\{[^}\n]*\}?|"[^"]*")/g),
    ].map((m) => ({ file, value: m[1] ?? '' })),
  );

  it('há usos para conferir', () => {
    expect(uses.length).toBeGreaterThan(5);
  });

  it('todo uso é um literal ARIA ou passa por ariaKeys()', () => {
    const wrong = uses.filter(({ value }) => {
      if (value.startsWith('"')) return !ARIA_KEYS.test(value.slice(1, -1));
      return !/^\{ariaKeys\(/.test(value);
    });
    expect(wrong).toEqual([]);
  });
});
