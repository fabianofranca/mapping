import { t } from '../../i18n';
import type { ChangeType } from '../../model';
import { Icon, type IconName } from '../icons';

// Selo neutro do tipo de mudança (HANDOFF-PROPOSALS 4.1): a forma diz o tipo, nunca a
// cor (verde e vermelho ficam para aceita e rejeitada). + criada, − removida, ⇄ movida,
// ∿ alterada, duas molduras para imagem trocada.

const ICONS: Readonly<Record<ChangeType, IconName>> = {
  created: 'plus',
  removed: 'minus',
  moved: 'moved',
  changed: 'changed',
  replaced: 'replaced',
};

/** Nome do tipo ("Criada", "Movida"…), para a dica e os filtros. */
export function changeKindLabel(type: ChangeType): string {
  return t(`review.kind.${type}`);
}

export function ChangeKind({
  type,
  size = 'md',
  decorative,
}: {
  readonly type: ChangeType;
  /** `sm`: 18px, nas linhas e cartões. */
  readonly size?: 'md' | 'sm';
  /** O tipo já está escrito ao lado (ex.: nos filtros). */
  readonly decorative?: boolean;
}) {
  const label = changeKindLabel(type);
  return (
    <span
      class={size === 'sm' ? 'change-kind change-kind-sm' : 'change-kind'}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      title={decorative ? undefined : label}
      data-kind={type}
    >
      <Icon name={ICONS[type]} />
    </span>
  );
}
