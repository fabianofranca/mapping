import { t } from '../i18n';
import { arrivalHasReference, projectIndex, rootFootprint, type Project } from '../model';
import type { ArrivalInfo } from '../store/perspectives';
import { selectItems } from '../store/ui';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { imageLabel, markingLabel } from './labels';
import { Notice } from './Notice';

// Aviso da marca "Veio de…" no topo dos Detalhes de uma raiz (etapa #659, PE3, decisão 8): só na
// Principal. Depois de recarregar só existe `project.arrivals` ("Veio de X."); na sessão em que a
// raiz foi criada a explicação diz onde ela ficou.

function referenceLabel(project: Project, id: string | null): string {
  if (id === null) return '';
  const index = projectIndex(project);
  const container = index.containers.get(id);
  if (container) return imageLabel(container);
  const marking = index.markings.get(id);
  return marking ? markingLabel(project, marking) : '';
}

/**
 * A explicação: sem referência (deduzida das setas de agora, também depois de recarregar), "foi
 * para a área de chegada"; com referência, "perto de"/"ocupado" só na sessão em que chegou.
 */
function whyText(
  project: Project,
  itemId: string,
  sessionInfo: readonly ArrivalInfo[],
): string | null {
  if (!arrivalHasReference(project, itemId)) return t('perspective.arrival.area');
  const info = sessionInfo.find((a) => a.root === itemId);
  if (!info || info.kind === 'arrival-area') return null;
  const reference = referenceLabel(project, info.referenceId);
  return t(
    info.kind === 'near' ? 'perspective.arrival.near' : 'perspective.arrival.occupied',
    { reference },
  );
}

export function ArrivalNotice({ itemId }: { readonly itemId: string }) {
  const { session, store, ui, canvas } = useEditor();
  const project = store.committed.value;
  const { perspective, perspectiveActions } = session;
  if (!project || perspective.id.value !== null) return null;
  const arrival = project.arrivals.find((a) => a.root === itemId);
  if (!arrival) return null;
  const why = whyText(project, itemId, perspective.arrivals.value);

  const { arrivals } = project;
  const goNext = () => {
    const at = arrivals.findIndex((a) => a.root === itemId);
    const next = arrivals[(at + 1) % arrivals.length];
    if (!next) return;
    selectItems(ui, [
      {
        kind: projectIndex(project).containers.has(next.root) ? 'image' : 'marking',
        id: next.root,
      },
    ]);
    const box = rootFootprint(project, next.root);
    if (box) {
      canvas.current?.centerOnPoint({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
    }
  };

  return (
    <Notice
      tone="info"
      size="sm"
      class="arrival-notice"
      actions={
        <>
          <Button size="sm" onClick={() => perspectiveActions.dismissArrival(itemId)}>
            {t('perspective.arrival.dismiss')}
          </Button>
          {arrivals.length > 1 && (
            <Button size="sm" onClick={goNext}>
              {t('perspective.arrival.next', { count: arrivals.length })}
            </Button>
          )}
        </>
      }
    >
      <strong>{t('perspective.arrival.cameFrom', { name: arrival.fromName })}</strong>
      {why && <> {why}</>}
    </Notice>
  );
}
