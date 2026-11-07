import { t } from '../i18n';
import { perspectiveRootSet, type Perspective, type Project } from '../model';
import { showToast } from '../store/ui';
import type { ActionResult } from '../store/history';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { MenuPopover } from './MenuPopover';

// "Enviar para perspectiva…" dos Detalhes (etapa #659, PE3): um menu com a Principal e as
// perspectivas do projeto em caixas. A Principal e a aberta ficam marcadas e travadas; marcar
// uma outra envia a raiz, desmarcar a tira. Mesmo comportamento do submenu do botão direito.

interface Row {
  readonly id: string | null;
  readonly name: string;
  readonly note: string | null;
  readonly checked: boolean;
  readonly locked: boolean;
}

/** As linhas do menu para a raiz `rootId`: a Principal e uma por perspectiva do projeto. */
export function sendRows(
  project: Project,
  localIds: ReadonlySet<string>,
  openId: string | null,
  rootId: string,
): readonly Row[] {
  const principal: Row = {
    id: null,
    name: t('perspective.principal'),
    note: t('perspective.menu.always'),
    checked: true,
    locked: true,
  };
  return [
    principal,
    ...project.perspectives.map((x: Perspective): Row => {
      const current = x.id === openId;
      return {
        id: x.id,
        name: x.name,
        note: current
          ? t('perspective.menu.current')
          : localIds.has(x.id)
            ? t('perspective.menu.mine')
            : null,
        checked: perspectiveRootSet(x).has(rootId),
        locked: current,
      };
    }),
  ];
}

export function PerspectiveSendMenu({
  rootId,
  disabled,
}: {
  readonly rootId: string;
  readonly disabled: boolean;
}) {
  const { session, store, ui } = useEditor();
  const project = store.project.value;
  const label = t('perspective.section.send');
  if (disabled || !project) {
    return (
      <Button disabled aria-label={label}>
        {label}
      </Button>
    );
  }
  const rows = sendRows(
    project,
    session.perspective.localIds.value,
    session.perspective.id.value,
    rootId,
  );
  const toggle = (row: Row) => {
    if (row.id === null) return;
    const { perspectiveActions } = session;
    const result: ActionResult = row.checked
      ? perspectiveActions.removeRootsFromPerspective(row.id, [rootId])
      : perspectiveActions.sendRootsToPerspective(row.id, [rootId]);
    if (!result.ok) showToast(ui, t('perspective.error'));
  };
  return (
    <MenuPopover label={label} buttonLabel={label}>
      {rows.map((row) => (
        <Button
          key={row.id ?? 'principal'}
          role="menuitemcheckbox"
          aria-checked={row.checked}
          disabled={row.locked}
          onClick={() => toggle(row)}
        >
          <span class="perspective-check" aria-hidden="true">
            {row.checked && <Icon name="check" />}
          </span>
          <span class="perspective-row-name">{row.name}</span>
          {row.note && <span class="perspective-row-note muted">{row.note}</span>}
        </Button>
      ))}
    </MenuPopover>
  );
}
