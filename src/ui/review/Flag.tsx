import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from '../icons';

// Pílula de 18px (20px no celular) com um fato sobre a linha (HANDOFF-PROPOSALS 2.1):
// Conflito, Trancado, junto, Envolvida, o status da proposta. Não é interativa (o `Chip`
// é que é); o texto aparece sempre, nunca só o ícone.

export type FlagTone = 'neutral' | 'warn' | 'danger' | 'ok' | 'new';

export function Flag({
  tone = 'neutral',
  icon,
  title,
  children,
}: {
  readonly tone?: FlagTone;
  readonly icon?: IconName;
  /** Dica com a explicação (ex.: "Rejeitada junto com a criação do item"). */
  readonly title?: string;
  readonly children: ComponentChildren;
}) {
  return (
    <span class={tone === 'neutral' ? 'flag' : `flag flag-${tone}`} title={title}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
