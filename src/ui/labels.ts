// Textos derivados do projeto (nomes de marcações, caminhos, erros), sempre via `t()`.
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

/** Nome da imagem; sem nome, o nome do arquivo (container sem arquivo: "Container"). */
export function imageLabel(image: Pick<ProjectContainer, 'name' | 'file'>): string {
  return image.name ?? image.file ?? t('image.containerUntitled');
}

/** Nome da marcação; sem nome, o do tipo que ela desenha (uma instância nasce sem nome). */
export function markingLabel(
  project: Project,
  marking: Pick<Marking, 'id' | 'name'>,
): string {
  return marking.name ?? markingTypeName(project, marking.id) ?? t('marking.unnamed');
}

/** Nome de uma ponta da seta; a marcação que não existe mais vira um texto neutro. */
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

/** Rótulo da seta: o nome dela; sem nome, "Origem → Destino". */
export function arrowText(
  project: Project,
  arrow: Pick<Arrow, 'name' | 'from' | 'to'>,
): string {
  return arrow.name ?? arrowEnds(project, arrow).text;
}

/**
 * Texto curto da seta sob a marcação de origem (Árvore e Lista): o nome dela; sem nome,
 * "→ Destino".
 */
export function arrowShort(
  project: Project,
  arrow: Pick<Arrow, 'name' | 'from' | 'to'>,
): string {
  if (arrow.name !== null) return arrow.name;
  const to = arrowEndLabel(project, projectIndex(project).markings.get(arrow.to));
  return t('arrow.label', { from: '', to }).trim();
}

/** Caminho completo da marcação, da raiz até ela (ex.: "Porta › Maçaneta"). */
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
  locked: 'marking.error.locked',
  reviewing: 'review.readOnly',
};

const LIBRARY_ERRORS: Partial<Record<StoreErrorCode, TranslationKey>> = {
  'rect-out-of-image': 'library.error.rect-out-of-image',
  'rect-outside-parent': 'library.error.rect-out-of-image',
  locked: 'library.error.locked',
  reviewing: 'review.readOnly',
};

/** Erro de "Adicionar" na Biblioteca. */
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

/** Erro de editar o container sem arquivo (tamanho e cor de fundo). */
export function containerErrorMessage(code: StoreErrorCode): string {
  return t(CONTAINER_ERRORS[code] ?? 'container.error.generic', {
    max: MAX_CONTAINER_SIZE,
  });
}

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
  'package-missing': 'proposal.error.packageMissing',
  'package-invalid': 'proposal.error.packageInvalid',
  'save-failed': 'proposal.error.saveFailed',
  failed: 'proposal.error.generic',
  reviewing: 'proposal.error.reviewing',
  'not-removable': 'proposal.error.notRemovable',
  'remove-failed': 'proposal.error.removeFailed',
};

/** Mensagem de uma ação recusada na revisão (`path`: o arquivo ou a pasta de `image-missing`, `image-exists`, `package-missing` e `package-invalid`). */
export function proposalErrorMessage(code: ProposalActionError, path = ''): string {
  return t(PROPOSAL_ERRORS[code], { path });
}

/** Aviso de uma proposta que chegou, mudou ou sumiu por fora da app. */
export function proposalNoticeMessage(notice: ProposalNotice): string {
  return t(`proposal.notice.${notice.kind}`, { title: notice.title });
}
