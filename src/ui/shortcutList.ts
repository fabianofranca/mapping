import { SHORTCUT_LABELS } from '../app/shortcuts';
import { t, type TranslationKey } from '../i18n';
import { TOOL_WINDOWS, WINDOW_NUMBER } from '../store/toolWindows';
import { toolWindowMeta, toolWindowShortcut } from './toolWindowMeta';

// Lista de atalhos da seção Atalhos da Ajuda (P10). As janelas saem de `TOOL_WINDOWS`,
// então as que chegam nas fases R6 e R7 aparecem aqui sozinhas.

/** Uma combinação de teclas, de cada tecla na ordem em que se aperta (`['Ctrl', 'Z']`). */
export type KeyCombo = readonly string[];

export interface ShortcutRow {
  readonly label: string;
  /** Combinações equivalentes (Ctrl+Shift+Z ou Ctrl+Y). */
  readonly combos: readonly KeyCombo[];
}

export interface ShortcutGroup {
  readonly id: 'windows' | 'edit' | 'view' | 'project';
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

const combo = (label: string): KeyCombo => label.split('+');

const row = (key: TranslationKey, ...combos: KeyCombo[]): ShortcutRow => ({
  label: t(key),
  combos,
});

/** Atalhos do editor do desktop, por grupo, no idioma atual. */
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
        row('shortcuts.selectParent', ['Alt', '↑']),
        row('shortcuts.selectChild', ['Alt', '↓']),
      ],
    },
    {
      id: 'view',
      title: t('shortcuts.group.view'),
      rows: [
        row('shortcuts.zoomIn', ['Ctrl', '=']),
        row('shortcuts.zoomOut', ['Ctrl', '−']),
        row('shortcuts.zoomReset', ['Ctrl', '0']),
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

/** Texto das combinações, para a busca da Ajuda (`Ctrl + Shift + 1`). */
export function comboText(c: KeyCombo): string {
  return c.join(' + ');
}
