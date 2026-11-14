import { t } from '../i18n';
import { getBacklinks, projectIndex, type Annotation, type Project } from '../model';
import type { AnnotationLocation } from '../store/ui';
import { markingLabel } from './labels';
import { annotationDisplayName } from './typedText';

// "Referenced by" row of the typed annotation's card (stage #679, CF3): the annotations that
// point to it as a whole (`ref` in the `{ annotationId }` format). Read-only, modeled on the
// "Linked" row; the pointers to a field, row and free pair show up next to their target.

interface ReferencedByProps {
  readonly project: Project;
  readonly annotation: Annotation;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** The origins that point to the whole annotation, once each, in project order. */
function wholeAnnotationSources(project: Project, annotationId: string): Annotation[] {
  const sources = new Map<string, Annotation>();
  for (const backlink of getBacklinks(project, annotationId)) {
    if ('key' in backlink.ref || 'entryId' in backlink.ref) continue;
    sources.set(backlink.source.id, backlink.source);
  }
  return [...sources.values()];
}

export function ReferencedByRow({
  project,
  annotation,
  onGoToAnnotation,
}: ReferencedByProps) {
  if (!annotation.type) return null;
  const sources = wholeAnnotationSources(project, annotation.id);
  if (sources.length === 0) return null;
  const markings = projectIndex(project).markings;
  const heading = t('annotation.referencedByHeading');
  return (
    <div
      class="annotation-linked-summary annotation-referenced"
      role="group"
      aria-label={heading}
    >
      <span class="props-label">{heading}</span>
      {sources.map((source) => {
        const name = annotationDisplayName(project, source);
        const marking = markings.get(source.markingId);
        return (
          /* Exception to Button: text link: item of the "Referenced by" list (docs/DESIGN-SYSTEM.md, "Loose buttons") */
          <button
            key={source.id}
            type="button"
            class="link-button referenced-item"
            title={t('ref.backlinkGo', { source: name })}
            onClick={() => onGoToAnnotation(source)}
          >
            {t('annotation.referencedByItem', {
              source: name,
              marking: marking ? markingLabel(project, marking) : '',
            })}
          </button>
        );
      })}
    </div>
  );
}
