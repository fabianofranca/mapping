// Texts derived from the project (marking names, paths, errors), always via `t()`.
import { t, type TranslationKey } from '../i18n';
import {
  MAX_CONTAINER_SIZE,
  MIN_MARKING_SIZE,
  ancestorsOf,
  markingTypeName,
  projectIndex,
  type Annotation,
  type Arrow,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../model';
import type { StoreErrorCode } from '../store/history';
import type { ProposalActionError } from '../store/proposalActions';
import type { ProposalNotice } from '../store/proposals';

/** Image name; with no name, the file name (container with no file: "Container"). */
export function imageLabel(image: Pick<ProjectContainer, 'name' | 'file'>): string {
  return image.name ?? image.file ?? t('image.containerUntitled');
}

/** Marking name; with no name, that of the type it draws (an instance is born unnamed). */
export function markingLabel(
  project: Project,
  marking: Pick<Marking, 'id' | 'name'>,
): string {
  return marking.name ?? markingTypeName(project, marking.id) ?? t('marking.unnamed');
}

/** Name of an arrow endpoint; a marking that no longer exists becomes a neutral text. */
export function arrowEndLabel(
  project: Project,
  marking: Pick<Marking, 'id' | 'name'> | null | undefined,
): string {
  return marking ? markingLabel(project, marking) : t('arrow.missingEnd');
}

/** "Origem → Destino" de uma seta (sempre as pontas, sem o nome dela). */
export function arrowEnds(
  project: Project,
  arrow: Pick<Arrow, 'from' | 'to'>,
): { readonly from: string; readonly to: string; readonly text: string } {
  const markings = projectIndex(project).markings;
  const from = arrowEndLabel(project, markings.get(arrow.from));
  const to = arrowEndLabel(project, markings.get(arrow.to));
  return { from, to, text: t('arrow.label', { from, to }) };
}

/** Arrow label: its name; with no name, "Origin → Target". */
export function arrowText(
  project: Project,
  arrow: Pick<Arrow, 'name' | 'from' | 'to'>,
): string {
  return arrow.name ?? arrowEnds(project, arrow).text;
}

/**
 * Short text of the arrow under the origin marking (Tree and List): its name; with no name,
 * "→ Target".
 */
export function arrowShort(
  project: Project,
  arrow: Pick<Arrow, 'name' | 'from' | 'to'>,
): string {
  if (arrow.name !== null) return arrow.name;
  const to = arrowEndLabel(project, projectIndex(project).markings.get(arrow.to));
  return t('arrow.label', { from: '', to }).trim();
}

/** Full path of the marking, from the root to it (e.g. "Door › Handle"). */
export function markingPath(project: Project, marking: Marking): string {
  return [...ancestorsOf(project, marking.id).reverse(), marking]
    .map((m) => markingLabel(project, m))
    .join(t('marking.pathSeparator'));
}

const MARKING_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'rect-not-integer': 'marking.error.rect-not-integer',
  'rect-too-small': 'marking.error.rect-too-small',
  'rect-out-of-image': 'marking.error.rect-out-of-image',
  'rect-outside-parent': 'marking.error.rect-outside-parent',
  'invalid-parent': 'marking.error.invalid-parent',
  'invalid-space': 'marking.error.invalid-space',
  'not-arrangeable': 'marking.error.not-arrangeable',
  'not-fittable': 'marking.error.not-fittable',
  'anchor-missing': 'marking.error.anchor-missing',
  'anchor-self': 'marking.error.anchor-self',
  'anchor-cycle': 'marking.error.anchor-cycle',
  'anchor-other-space': 'marking.error.anchor-other-space',
  'not-anchored': 'marking.error.not-anchored',
  locked: 'marking.error.locked',
  reviewing: 'review.readOnly',
};

const LIBRARY_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'rect-out-of-image': 'library.error.rect-out-of-image',
  'rect-outside-parent': 'library.error.rect-out-of-image',
  locked: 'library.error.locked',
  reviewing: 'review.readOnly',
};

/** Error of "Add" in the Library. */
export function libraryErrorMessage(code: StoreErrorCode): string {
  return t(LIBRARY_ERRORS[code] ?? 'library.error.generic');
}

const CONTAINER_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'invalid-dimensions': 'container.error.size',
  'invalid-color': 'container.error.color',
  'rect-out-of-image': 'container.error.rect-out-of-image',
  locked: 'container.error.locked',
  reviewing: 'review.readOnly',
};

/** Error of editing the container with no file (size and background color). */
export function containerErrorMessage(code: StoreErrorCode): string {
  return t(CONTAINER_ERRORS[code] ?? 'container.error.generic', {
    max: MAX_CONTAINER_SIZE,
  });
}

const PERSPECTIVE_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'perspective-name-empty': 'perspective.error.name-empty',
  'perspective-name-taken': 'perspective.error.name-taken',
  'not-root': 'perspective.error.not-root',
  reviewing: 'review.readOnly',
};

/** Error of creating, renaming or changing a perspective. */
export function perspectiveErrorMessage(code: StoreErrorCode): string {
  return t(PERSPECTIVE_ERRORS[code] ?? 'perspective.error.generic');
}

/**
 * `min` is the marking's effective minimum (8 px for a regular one; 1 px or the `minSize` for one
 * that draws a component).
 */
export function markingErrorMessage(
  code: StoreErrorCode,
  min: number = MIN_MARKING_SIZE,
): string {
  return t(MARKING_ERRORS[code] ?? 'marking.error.generic', { min });
}

/** Annotation name; with no name, the first pair as `key: value`. */
export function annotationLabel(
  annotation: Pick<Annotation, 'name' | 'entries'>,
): string {
  const first = annotation.entries[0];
  return (
    annotation.name ?? (first ? `${first.key}: ${first.value}` : t('annotation.unnamed'))
  );
}

export function annotationErrorMessage(code: StoreErrorCode): string {
  if (code === 'empty-key') return t('annotation.error.empty-key');
  if (code === 'duplicate-key') return t('annotation.error.duplicate-key');
  return t('annotation.error.generic');
}

const PROPOSAL_ERRORS: Record<ProposalActionError, TranslationKey> = {
  'unknown-proposal': 'proposal.error.unknown',
  gone: 'proposal.error.gone',
  unreadable: 'proposal.error.unreadable',
  'write-failed': 'proposal.error.writeFailed',
  'not-open': 'proposal.error.notOpen',
  'unknown-target': 'proposal.error.noTarget',
  'unknown-note': 'proposal.error.noTarget',
  'empty-note': 'proposal.error.emptyNote',
  'no-project': 'proposal.error.generic',
  'read-only': 'proposal.error.readOnly',
  blocked: 'proposal.error.blocked',
  stale: 'proposal.error.stale',
  'image-missing': 'proposal.error.imageMissing',
  'image-exists': 'proposal.error.imageExists',
  'package-missing': 'proposal.error.packageMissing',
  'package-invalid': 'proposal.error.packageInvalid',
  'save-failed': 'proposal.error.saveFailed',
  failed: 'proposal.error.generic',
  reviewing: 'proposal.error.reviewing',
  'not-removable': 'proposal.error.notRemovable',
  'remove-failed': 'proposal.error.removeFailed',
  revised: 'proposal.error.revised',
};

/**
 * Message of an action refused in the review (`path`: the file or folder of `image-missing`,
 * `image-exists`, `package-missing` and `package-invalid`).
 */
export function proposalErrorMessage(code: ProposalActionError, path = ''): string {
  return t(PROPOSAL_ERRORS[code], { path });
}

/** Notice of a proposal that arrived, changed or vanished from outside the app. */
export function proposalNoticeMessage(notice: ProposalNotice): string {
  return t(`proposal.notice.${notice.kind}`, { title: notice.title });
}
