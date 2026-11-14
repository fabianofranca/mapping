import { t, type TranslationKey } from '../../i18n';
import {
  annotationTitle,
  fieldLabel,
  fieldOf,
  projectIndex,
  resolveAnchor,
  typeOfAnnotation,
  type Annotation,
  type Project,
  type ThreadAnchor,
  type ThreadMissingKind,
} from '../../model';
import { annotationLabel, arrowText, imageLabel, markingLabel } from '../labels';

// Label of a thread anchor (Comments stage): "Button › variant", "Layer Data",
// "Canvas · loose point", "Deleted marking · orphan". Plain text, no icon; used by the
// Threads section of the Details and by the Anchor column of the Comments window.

const MISSING: Record<ThreadMissingKind, TranslationKey> = {
  marking: 'thread.anchor.missing.marking',
  container: 'thread.anchor.missing.container',
  arrow: 'thread.anchor.missing.arrow',
  layer: 'thread.anchor.missing.layer',
  annotation: 'thread.anchor.missing.annotation',
  entry: 'thread.anchor.missing.entry',
  row: 'thread.anchor.missing.row',
};

type ItemAnchor = Extract<ThreadAnchor, { id: string }>;

function annotationText(project: Project, annotation: Annotation): string {
  return annotationTitle(project, annotation) ?? annotationLabel(annotation);
}

function entryKey(project: Project, annotation: Annotation, entryId: string): string {
  return projectIndex(project).entries.get(annotation.id)?.get(entryId)?.key ?? '';
}

function fieldText(project: Project, annotation: Annotation, key: string): string {
  const type = typeOfAnnotation(project, annotation)?.type;
  const field = type ? fieldOf(type, key) : null;
  return field ? fieldLabel(field) : key;
}

/** "Annotation › field" (field and row) or "Annotation › pair key". */
function partLabel(
  project: Project,
  anchor: Extract<ThreadAnchor, { annotationId: string }>,
): string {
  const annotation = projectIndex(project).annotations.get(anchor.annotationId);
  if (!annotation) return '';
  const part =
    anchor.kind === 'entry'
      ? entryKey(project, annotation, anchor.entryId)
      : fieldText(project, annotation, anchor.key);
  return [annotationText(project, annotation), part].join(t('marking.pathSeparator'));
}

function itemLabel(project: Project, anchor: ItemAnchor): string {
  const idx = projectIndex(project);
  const found = {
    marking: () => {
      const m = idx.markings.get(anchor.id);
      return m ? markingLabel(project, m) : '';
    },
    container: () => {
      const c = idx.containers.get(anchor.id);
      return c ? imageLabel(c) : '';
    },
    arrow: () => {
      const a = idx.arrows.get(anchor.id);
      return a ? arrowText(project, a) : '';
    },
    layer: () =>
      t('thread.anchor.layer', { name: idx.layers.get(anchor.id)?.name ?? '' }),
    annotation: () => {
      const a = idx.annotations.get(anchor.id);
      return a ? annotationText(project, a) : '';
    },
  };
  return found[anchor.kind]();
}

/** Where the thread lives, as text; the orphan says what vanished. */
export function anchorLabel(project: Project, anchor: ThreadAnchor): string {
  const resolved = resolveAnchor(project, anchor);
  if (resolved.orphan) return t(MISSING[resolved.missing]);
  if (anchor.kind === 'point') {
    const container =
      anchor.containerId === null
        ? undefined
        : projectIndex(project).containers.get(anchor.containerId);
    return t('thread.anchor.point', {
      where: container ? imageLabel(container) : t('canvas.name'),
    });
  }
  return 'annotationId' in anchor
    ? partLabel(project, anchor)
    : itemLabel(project, anchor);
}
