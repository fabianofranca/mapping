// Textos derivados do projeto (nomes de marcações, caminhos, erros), sempre via `t()`.
import { t, type TranslationKey } from '../i18n';
import { MIN_MARKING_SIZE, ancestorsOf, type Marking, type Project } from '../model';
import type { StoreErrorCode } from '../store/history';

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
};

export function markingErrorMessage(code: StoreErrorCode): string {
  return t(MARKING_ERRORS[code] ?? 'marking.error.generic', { min: MIN_MARKING_SIZE });
}
