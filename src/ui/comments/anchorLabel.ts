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

// Rótulo de uma âncora de conversa (etapa Comentários): "Button › variante", "Camada Dados",
// "Canvas · ponto solto", "Marcação apagada · órfã". Texto puro, sem ícone; usado pela seção
// Conversas dos Detalhes e pela coluna Âncora da janela Comentários.

const MISSING: Record<ThreadMissingKind, TranslationKey> = {
  marking: 'thread.anchor.missing.marking',
  container: 'thread.anchor.missing.container',
  arrow: 'thread.anchor.missing.arrow',
  layer: 'thread.anchor.missing.layer',
  annotation: 'thread.anchor.missing.annotation',
  entry: 'thread.anchor.missing.entry',
  row: 'thread.anchor.missing.row',
};

function annotationText(project: Project, annotation: Annotation): string {
  return annotationTitle(project, annotation) ?? annotationLabel(annotation);
}

function partLabel(project: Project, anchor: ThreadAnchor): string {
  const idx = projectIndex(project);
  if (anchor.kind !== 'field' && anchor.kind !== 'entry' && anchor.kind !== 'row') {
    return '';
  }
  const annotation = idx.annotations.get(anchor.annotationId);
  if (!annotation) return '';
  const owner = annotationText(project, annotation);
  const sep = t('marking.pathSeparator');
  if (anchor.kind === 'entry') {
    const entry = idx.entries.get(annotation.id)?.get(anchor.entryId);
    return `${owner}${sep}${entry?.key ?? ''}`;
  }
  const type = typeOfAnnotation(project, annotation)?.type;
  const field = type ? fieldOf(type, anchor.key) : null;
  return `${owner}${sep}${field ? fieldLabel(field) : anchor.key}`;
}

function itemLabel(project: Project, anchor: ThreadAnchor): string {
  const idx = projectIndex(project);
  switch (anchor.kind) {
    case 'marking': {
      const m = idx.markings.get(anchor.id);
      return m ? markingLabel(project, m) : '';
    }
    case 'container': {
      const c = idx.containers.get(anchor.id);
      return c ? imageLabel(c) : '';
    }
    case 'arrow': {
      const a = idx.arrows.get(anchor.id);
      return a ? arrowText(project, a) : '';
    }
    case 'layer':
      return t('thread.anchor.layer', { name: idx.layers.get(anchor.id)?.name ?? '' });
    case 'annotation': {
      const a = idx.annotations.get(anchor.id);
      return a ? annotationText(project, a) : '';
    }
    default:
      return partLabel(project, anchor);
  }
}

/** Onde a conversa mora, em texto; a órfã diz o que sumiu. */
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
  return itemLabel(project, anchor);
}
