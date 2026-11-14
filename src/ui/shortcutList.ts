import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t, type TranslationKey } from '../i18n';
import { TOOL_WINDOWS, WINDOW_NUMBER } from '../store/toolWindows';
import { REVIEW_KEYS } from './review/DecisionControl';
import { toolWindowMeta, toolWindowShortcut } from './toolWindowMeta';

// List of shortcuts for the Shortcuts section of Help (P10). The windows come from `TOOL_WINDOWS`,
// so the ones that arrive in phases R6 and R7 show up here on their own.

/** A key combination, listing each key in the order it is pressed (`['Ctrl', 'Z']`). */
export type KeyCombo = readonly string[];

export interface ShortcutRow {
  readonly label: string;
  /** Equivalent combinations (Ctrl+Shift+Z or Ctrl+Y). */
  readonly combos: readonly KeyCombo[];
}

export interface ShortcutGroup {
  readonly id: 'windows' | 'edit' | 'view' | 'review' | 'project';
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

const combo = (label: string): KeyCombo => label.split('+');

const row = (key: TranslationKey, ...combos: KeyCombo[]): ShortcutRow => ({
  label: t(key),
  combos,
});

/** Desktop editor shortcuts, by group, in the current language. */
export function shortcutGroups(): readonly ShortcutGroup[] {
  const windows = [...TOOL_WINDOWS].sort((a, b) => WINDOW_NUMBER[a] - WINDOW_NUMBER[b]);
  return [
    {
      id: 'windows',
      title: t('shortcuts.group.windows'),
      rows: [
        ...windows.map((id): ShortcutRow => ({
          label: t('shortcuts.toggleWindow', { window: toolWindowMeta(id).title() }),
          combos: [combo(toolWindowShortcut(id)), ['Alt', String(WINDOW_NUMBER[id])]],
        })),
        row('shortcuts.hideWindow', ['Shift', 'Esc']),
        row('shortcuts.resizeWindow', ['Ctrl', 'Shift', '←↑→↓']),
      ],
    },
    {
      id: 'edit',
      title: t('shortcuts.group.edit'),
      rows: [
        row('editor.undo', combo(SHORTCUT_LABELS.undo)),
        row('editor.redo', combo(SHORTCUT_LABELS.redo), ['Ctrl', 'Y']),
        row('shortcuts.delete', ['Delete'], ['Backspace']),
        row('shortcuts.escape', ['Esc']),
        row('shortcuts.escapeWindow', ['Esc']),
        row('shortcuts.escapeToPrimary', ['Esc']),
        row(
          'shortcuts.shiftClick',
          ['Shift', t('shortcuts.key.click')],
          ['Ctrl', t('shortcuts.key.click')],
        ),
        row('shortcuts.selectRect', ['Shift', t('shortcuts.key.drag')]),
        row('shortcuts.nudge', ['←↑→↓'], ['Shift', '←↑→↓']),
        row('shortcuts.doubleClick', [t('shortcuts.key.doubleClick')]),
        row('shortcuts.toggleLock', combo(SHORTCUT_LABELS.toggleLock)),
        row('shortcuts.copyReference', combo(SHORTCUT_LABELS.copyReference)),
        row('shortcuts.copyCrop', combo(SHORTCUT_LABELS.copyCrop)),
        row('shortcuts.arrange', combo(SHORTCUT_LABELS.arrange)),
        row('shortcuts.wrap', combo(SHORTCUT_LABELS.wrap)),
        row('shortcuts.selectParent', ['Alt', '↑']),
        row('shortcuts.selectChild', ['Alt', '↓']),
      ],
    },
    {
      id: 'view',
      title: t('shortcuts.group.view'),
      rows: [
        row('shortcuts.viewMode', combo(SHORTCUT_LABELS.viewMode)),
        row('shortcuts.zoomIn', ['Ctrl', '=']),
        row('shortcuts.zoomOut', ['Ctrl', '−']),
        row('shortcuts.zoomReset', ['Ctrl', '0']),
        row('shortcuts.fitAll', combo(SHORTCUT_LABELS.fitAll)),
        row('shortcuts.fitSelection', combo(SHORTCUT_LABELS.fitSelection)),
      ],
    },
    {
      // They only apply in review mode (stage 4); the keys come from the same constants as the buttons.
      id: 'review',
      title: t('shortcuts.group.review'),
      rows: [
        row('shortcuts.review.accept', combo(REVIEW_KEYS.accept)),
        row('shortcuts.review.reject', combo(REVIEW_KEYS.reject)),
        row('shortcuts.review.clear', combo(REVIEW_KEYS.clear)),
        row(
          'shortcuts.review.pending',
          combo(REVIEW_KEYS.nextPending),
          combo(REVIEW_KEYS.previousPending),
        ),
        row(
          'shortcuts.review.conflict',
          combo(REVIEW_KEYS.nextConflict),
          combo(REVIEW_KEYS.previousConflict),
        ),
        row('shortcuts.review.view', combo(REVIEW_KEYS.toggleView)),
        row('shortcuts.review.legend', combo(REVIEW_KEYS.legend)),
        row('shortcuts.review.apply', combo(REVIEW_KEYS.apply)),
      ],
    },
    {
      id: 'project',
      title: t('shortcuts.group.project'),
      rows: [
        row('shortcuts.export', combo(SHORTCUT_LABELS.export)),
        row('shortcuts.layers', combo(SHORTCUT_LABELS.layers)),
        row('shortcuts.help', combo(SHORTCUT_LABELS.help)),
        row('shortcuts.settings', ['Ctrl', ',']),
      ],
    },
  ];
}

/** Text of the combinations, for the Help search (`Ctrl + Shift + 1`). */
export function comboText(c: KeyCombo): string {
  return c.join(' + ');
}
