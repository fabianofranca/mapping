// Conteúdo do zoom semântico, sem Konva: textos e linhas do cartão de cada
// marcação (montados sob demanda e guardados por versão do projeto) e a área
// em que o cartão aparece. Os nós ficam em `semanticCard.ts`.
import { t } from '../../i18n';
import {
  annotationTitle,
  projectIndex,
  rawValueLines,
  type Annotation,
  type Layer,
  type Marking,
  type MarkingVisibility,
  type Placement,
  type Project,
  type Rect,
} from '../../model';
import { annotationLabel, markingLabel } from '../../ui/labels';
import { annotationDisplayName, displayLines, issuesOf } from '../../ui/typedText';
import { largestFreeRect } from '../freeArea';
import {
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  cardRows,
  cardSections,
  semanticMode,
  type CardInherited,
  type CardLabels,
  type CardRow,
  type SemanticMode,
} from '../semanticText';
import { ALERT_GLYPH } from './metrics';

/** Textos do cartão do zoom semântico, no idioma atual. */
export function cardLabels(project: Project | null): CardLabels {
  return {
    untitled: (n) => t('canvas.card.untitled', { n }),
    linkedTo: (owner) =>
      t('annotation.linkedTo', {
        name: project ? annotationDisplayName(project, owner) : annotationLabel(owner),
      }),
    inheritedFrom: (source) =>
      t('canvas.card.inheritedFrom', { name: markingLabel(source) }),
    describe: (a) => {
      if (!project || !a.type) return null;
      const known = displayLines(project, a, 'summary');
      const lines =
        known.length > 0 || a.values === null
          ? known.map((l) => ({
              text: `${l.label}: ${l.kind === 'value' ? l.text : ''}`,
              alert: l.alert,
            }))
          : rawValueLines(a).map((l) => ({ text: `${l.key}: ${l.text}`, alert: false }));
      const alert = issuesOf(project, a.id).length > 0;
      const title = annotationTitle(project, a) ?? '';
      return { title: alert ? `${ALERT_GLYPH} ${title}` : title, alert, lines };
    },
  };
}

/**
 * Herdadas pela marcação: as `inherit: true` dos ancestrais, da raiz até o pai
 * (como `getInheritedAnnotations`, mas com os índices já montados).
 */
export function inheritedOf(
  marking: Marking,
  byId: ReadonlyMap<string, Marking>,
  byMarking: ReadonlyMap<string, readonly Annotation[]>,
): CardInherited[] {
  const ancestors: Marking[] = [];
  let parent = marking.parentId === null ? undefined : byId.get(marking.parentId);
  while (parent && ancestors.length <= byId.size) {
    ancestors.unshift(parent);
    parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
  }
  return ancestors.flatMap((source) =>
    (byMarking.get(source.id) ?? [])
      .filter((a) => a.inherit)
      .map((annotation) => ({ annotation, source })),
  );
}

/** Conteúdo do cartão do zoom semântico de uma marcação. */
export interface MarkingCard {
  readonly rows: readonly CardRow[];
  /** Camada de cada seção, na ordem das seções. */
  readonly layers: readonly Layer[];
}

export const NO_CARD: MarkingCard = { rows: [], layers: [] };

/**
 * Cartões montados sob demanda e guardados enquanto o projeto, as camadas
 * visíveis e o idioma não mudam: pan e zoom reaproveitam todos.
 */
export function cardCache(
  project: Project | null,
  shown: readonly Layer[],
  byMarking: ReadonlyMap<string, readonly Annotation[]>,
): (marking: Marking) => MarkingCard {
  if (!project) return () => NO_CARD;
  const index = projectIndex(project);
  const labels = cardLabels(project);
  const cache = new Map<string, MarkingCard>();
  return (marking) => {
    let card = cache.get(marking.id);
    if (!card) {
      const sections = cardSections(
        shown,
        byMarking.get(marking.id) ?? [],
        inheritedOf(marking, index.markings, byMarking),
      );
      card = {
        rows: cardRows(sections, index.annotations, labels),
        layers: sections.map((section) => section.layer),
      };
      cache.set(marking.id, card);
    }
    return card;
  };
}

/** Onde e quanto do zoom semântico aparece numa marcação. */
export interface SemanticPlacement {
  readonly mode: SemanticMode;
  /** Área do cartão em pixels da imagem (o retângulo ou a maior área livre das filhas). */
  readonly area: Rect | null;
}

/**
 * Escolhe a área do cartão. Com filhas, ele vai na maior área livre delas (as
 * ocultas não ocupam espaço); entre as áreas em que o cartão cabe, a maior.
 */
export function semanticPlacement(
  marking: Marking,
  placement: Placement,
  zoom: number,
  enabled: boolean,
  children: readonly Marking[],
  visibility: ReadonlyMap<string, MarkingVisibility>,
): SemanticPlacement {
  const pxPerUnit = placement.scale * zoom;
  const screenWidth = marking.rect.width * pxPerUnit;
  const screenHeight = marking.rect.height * pxPerUnit;
  const bigEnough =
    enabled && screenWidth >= SEMANTIC_MIN_WIDTH && screenHeight >= SEMANTIC_MIN_HEIGHT;
  const kids = bigEnough ? children.filter((k) => visibility.get(k.id) !== 'hidden') : [];
  const area = !bigEnough
    ? null
    : kids.length === 0
      ? marking.rect
      : largestFreeRect(
          marking.rect,
          kids.map((k) => k.rect),
          {
            minWidth: SEMANTIC_MIN_WIDTH / pxPerUnit,
            minHeight: SEMANTIC_MIN_HEIGHT / pxPerUnit,
          },
        );
  const mode = semanticMode({
    enabled,
    screenWidth,
    screenHeight,
    areaWidth: area ? area.width * pxPerUnit : null,
    areaHeight: area ? area.height * pxPerUnit : null,
  });
  return { mode, area };
}
