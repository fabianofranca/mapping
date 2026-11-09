import { t } from '../i18n';
import { perspectiveRootSet, type Perspective, type Project } from '../model';

/** Uma linha do menu "Enviar para perspectiva": a Principal (`perspective: null`) ou uma delas. */
export interface PerspectiveRow {
  readonly perspective: Perspective | null;
  readonly checked: boolean;
  readonly locked: boolean;
  readonly note: string | null;
}

/**
 * As linhas do menu de envio para as raízes `roots`: a Principal (sempre marcada e travada) e uma
 * por perspectiva, marcada quando tem todas as raízes. A aberta fica travada e, com
 * `openAlwaysChecked`, marcada mesmo sem as raízes (o submenu do botão direito); sem ele, só
 * marcada se as tem (o menu dos Detalhes).
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
