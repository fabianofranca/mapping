// Textos derivados do projeto (nomes de marcações, caminhos, erros), sempre via `t()`.
import { t, type TranslationKey } from '../i18n';
import {
  MIN_MARKING_SIZE,
  ancestorsOf,
  type Annotation,
  type Marking,
  type Project,
  type ProjectImage,
} from '../model';
import type { StoreErrorCode } from '../store/history';
import type { ProposalActionError } from '../store/proposalActions';
import type { ProposalNotice } from '../store/proposals';

/** Nome da imagem; sem nome, o nome do arquivo. */
export function imageLabel(image: Pick<ProjectImage, 'name' | 'file'>): string {
  return image.name ?? image.file;
}

export function markingLabel(marking: Pick<Marking, 'name'>): string {
  return marking.name ?? t('marking.unnamed');
}

/** Caminho completo da marcação, da raiz até ela (ex.: "Porta › Maçaneta"). */
export function markingPath(project: Project, marking: Marking): string {
  return [...ancestorsOf(project, marking.id).reverse(), marking]
    .map(markingLabel)
    .join(t('marking.pathSeparator'));
}

const MARKING_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'rect-not-integer': 'marking.error.rect-not-integer',
  'rect-too-small': 'marking.error.rect-too-small',
  'rect-out-of-image': 'marking.error.rect-out-of-image',
  'rect-outside-parent': 'marking.error.rect-outside-parent',
  'rect-excludes-children': 'marking.error.rect-excludes-children',
  'invalid-parent': 'marking.error.invalid-parent',
  locked: 'marking.error.locked',
  reviewing: 'review.readOnly',
};

export function markingErrorMessage(code: StoreErrorCode): string {
  return t(MARKING_ERRORS[code] ?? 'marking.error.generic', { min: MIN_MARKING_SIZE });
}

/** Nome da anotação; sem nome, o primeiro par como `chave: valor`. */
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
  'save-failed': 'proposal.error.saveFailed',
  failed: 'proposal.error.generic',
};

/** Mensagem de uma ação recusada na revisão (`path`: a imagem de `image-missing` e `image-exists`). */
export function proposalErrorMessage(code: ProposalActionError, path = ''): string {
  return t(PROPOSAL_ERRORS[code], { path });
}

/** Aviso de uma proposta que chegou, mudou ou sumiu por fora da app. */
export function proposalNoticeMessage(notice: ProposalNotice): string {
  return t(`proposal.notice.${notice.kind}`, { title: notice.title });
}
