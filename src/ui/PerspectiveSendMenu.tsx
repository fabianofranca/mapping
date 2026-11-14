import { t } from '../i18n';
import { showToast } from '../store/ui';
import type { ActionResult } from '../store/history';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { MenuPopover } from './MenuPopover';
import { perspectiveRows, type PerspectiveRow } from './perspectiveRows';

// "Send to perspective…" in the Details (stage #659, PE3): a menu with the Main one and the
// project perspectives as checkboxes. The Main and the open ones are checked and locked; checking
// another sends the root, unchecking removes the strip. Same behavior as the right-click submenu.

export function PerspectiveSendMenu({
  rootId,
  disabled,
}: {
  readonly rootId: string;
  readonly disabled: boolean;
}) {
  const { session, store, ui } = useEditor();
  const project = store.committed.value;
  const label = t('perspective.section.send');
  if (disabled || !project) {
    return (
      <Button disabled aria-label={label}>
        {label}
      </Button>
    );
  }
  const rows = perspectiveRows(
    project,
    session.perspective.id.value,
    session.perspective.localIds.value,
    [rootId],
    false,
  );
  const toggle = (row: PerspectiveRow) => {
    if (!row.perspective) return;
    const { perspectiveActions } = session;
    const result: ActionResult = row.checked
      ? perspectiveActions.removeRootsFromPerspective(row.perspective.id, [rootId])
      : perspectiveActions.sendRootsToPerspective(row.perspective.id, [rootId]);
    if (!result.ok) showToast(ui, t('perspective.error'));
  };
  return (
    <MenuPopover label={label} buttonLabel={label} class="menu-popover-control">
      {rows.map((row) => (
        <Button
          key={row.perspective?.id ?? 'principal'}
          role="menuitemcheckbox"
          aria-checked={row.checked}
          disabled={row.locked}
          onClick={() => toggle(row)}
        >
          <span class="perspective-check" aria-hidden="true">
            {row.checked && <Icon name="check" />}
          </span>
          <span class="perspective-row-name">
            {row.perspective?.name ?? t('perspective.principal')}
          </span>
          {row.note && <span class="perspective-row-note muted">{row.note}</span>}
        </Button>
      ))}
    </MenuPopover>
  );
}
