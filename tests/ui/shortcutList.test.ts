import { describe, expect, it } from 'vitest';
import { reviewShortcutFor, shortcutFor } from '../../src/app/shortcuts';
import { t } from '../../src/i18n';
import { TOOL_WINDOWS, WINDOW_NUMBER } from '../../src/store/toolWindows';
import { comboText, shortcutGroups } from '../../src/ui/shortcutList';

describe('Help shortcut list (P10)', () => {
  const groups = shortcutGroups();

  it('has one row per tool window, with Ctrl+Shift+N and Alt+N', () => {
    const windows = groups.find((g) => g.id === 'windows');
    for (const id of TOOL_WINDOWS) {
      const n = WINDOW_NUMBER[id];
      const row = windows?.rows.find((r) =>
        r.combos.some((c) => comboText(c) === `Ctrl + Shift + ${n}`),
      );
      expect(row, `window ${id}`).toBeDefined();
      expect(row?.combos.map(comboText)).toContain(`Alt + ${n}`);
    }
  });

  it('the listed Ctrl+Shift+N really triggers the window', () => {
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

  it('lists "View" with Alt+H, and it really triggers', () => {
    const rows = groups.flatMap((g) => g.rows);
    const row = rows.find((r) => r.combos.some((c) => comboText(c) === 'Alt + H'));
    expect(row?.label).toBe(t('shortcuts.viewMode'));
  });

  it('lists the Alt+L lock in the edit section, and it really triggers', () => {
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

  it('lists the Alt+Shift+A arrange, and it really triggers', () => {
    const edit = groups.find((g) => g.id === 'edit');
    const row = edit?.rows.find((r) =>
      r.combos.some((c) => comboText(c) === 'Alt + Shift + A'),
    );
    expect(row?.label).toBe(t('shortcuts.arrange'));
    expect(
      shortcutFor({
        key: 'A',
        code: 'KeyA',
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        altKey: true,
      }),
    ).toEqual({ kind: 'arrange' });
  });

  it('the listed review shortcuts really trigger', () => {
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

  it('lists the Shift+drag rectangle selection in the edit section', () => {
    const edit = groups.find((g) => g.id === 'edit');
    const row = edit?.rows.find((r) =>
      r.combos.some((c) => comboText(c) === `Shift + ${t('shortcuts.key.drag')}`),
    );
    expect(row).toBeDefined();
    expect(row?.label).toBe(t('shortcuts.selectRect'));
  });

  it('lists the Esc that closes Details or Comments, right after the selection Esc', () => {
    const edit = groups.find((g) => g.id === 'edit');
    const labels = edit?.rows.map((r) => r.label) ?? [];
    const at = labels.indexOf(t('shortcuts.escape'));
    expect(labels[at + 1]).toBe(t('shortcuts.escapeWindow'));
    expect(edit?.rows[at + 1]?.combos.map(comboText)).toEqual(['Esc']);
  });

  it('no empty row and no repeated text', () => {
    const labels = groups.flatMap((g) => g.rows.map((r) => r.label));
    expect(new Set(labels).size).toBe(labels.length);
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(row.label.trim()).not.toBe('');
      expect(row.combos.length).toBeGreaterThan(0);
    }
  });
});
