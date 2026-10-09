import { t } from '../../i18n';
import { Button, IconButton } from '../controls';
import { Icon } from '../icons';

// Par ✓ ✕ que decide um nível (HANDOFF-PROPOSALS 2.1): nenhum marcado é "sem decisão";
// apertar o marcado limpa a decisão. Decidir grava na hora, sem confirmação (é
// reversível). Versão de ícone (linhas e cartões, 24px; 44px no celular) e versão com
// texto ("Aceitar item" / "Rejeitar item", nos Detalhes).

export type DecisionValue = 'accepted' | 'rejected' | null;

/** Atalhos da revisão mostrados nas dicas (HANDOFF-PROPOSALS 6). */
export const REVIEW_KEYS = {
  accept: 'A',
  reject: 'R',
  clear: 'Backspace',
  nextPending: 'N',
  previousPending: 'Shift+N',
  nextConflict: 'C',
  previousConflict: 'Shift+C',
  toggleView: 'P',
  legend: 'L',
  apply: 'Ctrl+Enter',
} as const;

interface DecisionControlProps {
  /** Estado marcado (`null`: nenhum; num nível "parcial" também nenhum). */
  readonly value: DecisionValue;
  /** Nome do alvo, para o nome acessível ("Aceitar Botão Pagar"). */
  readonly name: string;
  readonly onDecide: (next: DecisionValue) => void;
  readonly disabled?: boolean;
  /** Conflito: os rótulos dizem o efeito (sobrescreve / mantém o valor atual). */
  readonly conflict?: boolean;
  /** `text`: botões com rótulo (`acceptText`, `rejectText`). */
  readonly variant?: 'icon' | 'text';
  readonly acceptText?: string;
  readonly rejectText?: string;
  /** Dica explicando por que está desabilitado. */
  readonly disabledReason?: string;
}

export function DecisionControl({
  value,
  name,
  onDecide,
  disabled,
  conflict = false,
  variant = 'icon',
  acceptText,
  rejectText,
  disabledReason,
}: DecisionControlProps) {
  const toggle = (state: 'accepted' | 'rejected') =>
    onDecide(value === state ? null : state);
  const acceptLabel = conflict
    ? t('review.decide.acceptConflict', { name })
    : value === 'accepted'
      ? t('review.decide.accepted', { name })
      : t('review.decide.accept', { name });
  const rejectLabel = conflict
    ? t('review.decide.rejectConflict', { name })
    : value === 'rejected'
      ? t('review.decide.rejected', { name })
      : t('review.decide.reject', { name });
  const acceptTip = disabled && disabledReason ? disabledReason : t('review.accept');
  const rejectTip = disabled && disabledReason ? disabledReason : t('review.reject');

  if (variant === 'text') {
    return (
      <div class="decision-control decision-control-text" role="group" aria-label={name}>
        <Button
          variant="accept"
          aria-pressed={value === 'accepted'}
          aria-label={acceptLabel}
          aria-keyshortcuts={REVIEW_KEYS.accept}
          title={`${acceptTip}  ${REVIEW_KEYS.accept}`}
          disabled={disabled}
          onClick={() => toggle('accepted')}
        >
          <Icon name="check" />
          {acceptText ?? t('review.accept')}
        </Button>
        <Button
          variant="reject"
          aria-pressed={value === 'rejected'}
          aria-label={rejectLabel}
          aria-keyshortcuts={REVIEW_KEYS.reject}
          title={`${rejectTip}  ${REVIEW_KEYS.reject}`}
          disabled={disabled}
          onClick={() => toggle('rejected')}
        >
          <Icon name="close" />
          {rejectText ?? t('review.reject')}
        </Button>
      </div>
    );
  }

  return (
    <span class="decision-control" role="group" aria-label={name}>
      <IconButton
        icon="check"
        size="sm"
        variant="accept"
        label={acceptLabel}
        tooltip={acceptTip}
        shortcut={REVIEW_KEYS.accept}
        pressed={value === 'accepted'}
        disabled={disabled}
        onClick={() => toggle('accepted')}
      />
      <IconButton
        icon="close"
        size="sm"
        variant="reject"
        label={rejectLabel}
        tooltip={rejectTip}
        shortcut={REVIEW_KEYS.reject}
        pressed={value === 'rejected'}
        disabled={disabled}
        onClick={() => toggle('rejected')}
      />
    </span>
  );
}
