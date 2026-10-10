import { describe, expect, it } from 'vitest';
import { reviewShortcutFor, shortcutFor } from '../../src/app/shortcuts';
import { t } from '../../src/i18n';
import { TOOL_WINDOWS, WINDOW_NUMBER } from '../../src/store/toolWindows';
import { comboText, shortcutGroups } from '../../src/ui/shortcutList';

describe('lista de atalhos da Ajuda (P10)', () => {
  const groups = shortcutGroups();

  it('tem uma linha por janela de ferramenta, com Ctrl+Shift+N e Alt+N', () => {
    const windows = groups.find((g) => g.id === 'windows');
    for (const id of TOOL_WINDOWS) {
      const n = WINDOW_NUMBER[id];
      const row = windows?.rows.find((r) =>
        r.combos.some((c) => comboText(c) === `Ctrl + Shift + ${n}`),
      );
      expect(row, `janela ${id}`).toBeDefined();
      expect(row?.combos.map(comboText)).toContain(`Alt + ${n}`);
    }
  });

  it('o Ctrl+Shift+N listado dispara a janela de verdade', () => {
    for (const id of TOOL_WINDOWS) {
      const n = WINDOW_NUMBER[id];
      expect(
        shortcutFor({
          key: String(n),
          code: `Digit${n}`,
          ctrlKey: true,
          metaKey: false,
          shiftKey: true,
          altKey: false,
        }),
      ).toEqual({ kind: 'toggle-window', window: id });
    }
  });

  it('lista o Alt+L de trancar na seção de edição, e ele dispara de verdade', () => {
    const edit = groups.find((g) => g.id === 'edit');
    const row = edit?.rows.find((r) => r.combos.some((c) => comboText(c) === 'Alt + L'));
    expect(row).toBeDefined();
    expect(row?.label).toBe(t('shortcuts.toggleLock'));
    expect(
      shortcutFor({
        key: 'l',
        code: 'KeyL',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: true,
      }),
    ).toEqual({ kind: 'toggle-lock' });
  });

  it('os atalhos da revisão listados disparam de verdade', () => {
    const review = groups.find((g) => g.id === 'review');
    const keys = (c: readonly string[]) => {
      const key = c.at(-1) ?? '';
      return {
        key: key.length === 1 ? key.toLowerCase() : key,
        code: key.length === 1 ? `Key${key}` : key,
        ctrlKey: c.includes('Ctrl'),
        metaKey: false,
        shiftKey: c.includes('Shift'),
        altKey: false,
      };
    };
    const combos = review?.rows.flatMap((r) => r.combos) ?? [];
    expect(combos.length).toBe(10);
    for (const c of combos) {
      expect(reviewShortcutFor(keys(c)), comboText(c)).not.toBeNull();
    }
  });

  it('nenhuma linha vazia e nenhum texto repetido', () => {
    const labels = groups.flatMap((g) => g.rows.map((r) => r.label));
    expect(new Set(labels).size).toBe(labels.length);
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(row.label.trim()).not.toBe('');
      expect(row.combos.length).toBeGreaterThan(0);
    }
  });
});
