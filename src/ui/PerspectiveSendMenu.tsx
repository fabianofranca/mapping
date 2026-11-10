import { t } from '../i18n';
import { showToast } from '../store/ui';
import type { ActionResult } from '../store/history';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { MenuPopover } from './MenuPopover';
import { perspectiveRows, type PerspectiveRow } from './perspectiveRows';

// "Enviar para perspectiva…" dos Detalhes (etapa #659, PE3): um menu com a Principal e as
// perspectivas do projeto em caixas. A Principal e a aberta ficam marcadas e travadas; marcar
// uma outra envia a raiz, desmarcar a tira. Mesmo comportamento do submenu do botão direito.

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
