import { t } from '../i18n';
import { perspectiveRootSet, type Perspective, type Project } from '../model';

/** A row of the "Send to perspective" menu: the Main one (`perspective: null`) or one of them. */
export interface PerspectiveRow {
  readonly perspective: Perspective | null;
  readonly checked: boolean;
  readonly locked: boolean;
  readonly note: string | null;
}

/**
 * The rows of the send menu for the roots `roots`: the Main one (always checked and locked) and one
 * per perspective, checked when it has all the roots. The open one is locked and, with
 * `openAlwaysChecked`, checked even without the roots (the right-click submenu); without it, only
 * checked if it has them (the Details menu).
 */
export function perspectiveRows(
  project: Project,
  openId: string | null,
  localIds: ReadonlySet<string>,
  roots: readonly string[],
  openAlwaysChecked: boolean,
): readonly PerspectiveRow[] {
  const rows: PerspectiveRow[] = [
    {
      perspective: null,
      checked: true,
      locked: true,
      note: t('perspective.menu.always'),
    },
  ];
  for (const perspective of project.perspectives) {
    const open = perspective.id === openId;
    const has = perspectiveRootSet(perspective);
    const note = open
      ? t('perspective.menu.current')
      : localIds.has(perspective.id)
        ? t('perspective.menu.mine')
        : null;
    rows.push({
      perspective,
      checked:
        (open && openAlwaysChecked) ||
        (roots.length > 0 && roots.every((r) => has.has(r))),
      locked: open,
      note,
    });
  }
  return rows;
}
