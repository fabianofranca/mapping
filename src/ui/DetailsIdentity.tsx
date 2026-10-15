import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Icon, type IconName } from './icons';

// Bloco de identidade de Detalhes: ícone, nome (15px), caminho e o ID em mono com
// copiar no mesmo bloco (o ID serve para citar o item numa conversa com um agente).

interface DetailsIdentityProps {
  readonly icon: IconName;
  readonly name: string;
  /** Linha de baixo: onde o item está (imagem e caminho, ou arquivo e tamanho). */
  readonly sub: string;
  /** O ID para copiar; sem ele (o grupo Projeto da revisão), não há botão. */
  readonly id?: string;
  /** Botões ao lado do ID (ex.: o cadeado). */
  readonly actions?: ComponentChildren;
  /** Linha de selos embaixo (ex.: "Criada pela proposta", na revisão). */
  readonly flags?: ComponentChildren;
  /** O nome sai riscado (a entidade vai ser removida). */
  readonly struck?: boolean;
}

export function DetailsIdentity({
  icon,
  name,
  sub,
  id,
  actions,
  flags,
  struck,
}: DetailsIdentityProps) {
  return (
    <div class="identity">
      <div class="identity-main">
        <Icon name={icon} />
        {struck ? (
          <del class="identity-name">{name}</del>
        ) : (
          <strong class="identity-name">{name}</strong>
        )}
        {id !== undefined && <CopyIdButton id={id} />}
        {actions}
      </div>
      <span class="identity-sub">{sub}</span>
      {flags && <div class="identity-flags">{flags}</div>}
    </div>
  );
}

function CopyIdButton({ id }: { readonly id: string }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied('ok');
    } catch {
      // Sem a API (ou sem permissão): o ID continua no `title` para copiar à mão.
      setCopied('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <button
        type="button"
        class="identity-id"
        title={`${t('common.copyId')}: ${id}`}
        aria-label={`${t('common.copyId')}: ${id}`}
        onClick={() => void copy()}
      >
        <span class="identity-id-text">{id}</span>
        <Icon name={copied === 'ok' ? 'check' : 'copy'} />
      </button>
      <span class="visually-hidden" role="status">
        {copied === 'ok'
          ? t('common.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
    </>
  );
}
