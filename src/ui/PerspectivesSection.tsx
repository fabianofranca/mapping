import { t } from '../i18n';
import { perspectiveRootOf, perspectiveRootSet } from '../model';
import { principalOnly, type PrincipalOnlyCommand } from '../store/perspectiveGestures';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { PerspectiveSendMenu } from './PerspectiveSendMenu';

// "Perspectives" section of Details (stage #659, PE3): in which perspectives the item's ROOT
// appears (the Main one always) and the "Send to perspective…" button. For an item that is not a root,
// it shows where its root appears.

/** Does the command apply only on the Main one, with a perspective open? (the interface disables it) */
export function usePrincipalOnly(
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  const { session, store } = useEditor();
  const project = store.committed.value;
  return (
    project !== null &&
    principalOnly(project, session.perspective.id.value, command, targets)
  );
}

export function PerspectivesSection({
  itemId,
  readOnly,
}: {
  readonly itemId: string;
  readonly readOnly: boolean;
}) {
  const { session, store } = useEditor();
  const project = store.committed.value;
  const rootId = project ? perspectiveRootOf(project, itemId) : null;
  if (!project || rootId === null) return null;
  const localIds = session.perspective.localIds.value;
  const shownIn = project.perspectives.filter((x) => perspectiveRootSet(x).has(rootId));
  return (
    <Section
      section={{ kind: 'perspectives' }}
      title={t('perspective.section')}
      count={shownIn.length + 1}
    >
      <div class="perspective-section">
        <span class="perspective-section-label muted">
          {t('perspective.section.shownIn')}
        </span>
        <ul class="perspective-chips">
          <li class="perspective-chip">{t('perspective.principal')}</li>
          {shownIn.map((x) => (
            <li key={x.id} class="perspective-chip">
              {x.name}
              {localIds.has(x.id) && (
                <span class="perspective-chip-note muted">
                  {t('perspective.menu.mine')}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div class="row">
          <PerspectiveSendMenu rootId={rootId} disabled={readOnly} />
        </div>
      </div>
    </Section>
  );
}
