import { t } from '../i18n';
import { perspectiveRootOf, perspectiveRootSet } from '../model';
import { principalOnly, type PrincipalOnlyCommand } from '../store/perspectiveGestures';
import { Section } from './DetailsSection';
import { useEditor } from './EditorContext';
import { PerspectiveSendMenu } from './PerspectiveSendMenu';

// Seção "Perspectivas" dos Detalhes (etapa #659, PE3): em quais perspectivas a RAIZ do item
// aparece (a Principal sempre) e o botão "Enviar para perspectiva…". Para um item que não é raiz,
// mostra onde a raiz dele aparece.

/** O comando só vale na Principal e há uma perspectiva aberta? (a interface o desabilita) */
export function usePrincipalOnly(
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  const { session, store } = useEditor();
  const project = store.project.value;
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
  const project = store.project.value;
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
