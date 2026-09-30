import { useState } from 'preact/hooks';
import { t } from '../i18n';

/** `id` do item (somente leitura) com botão de copiar, para citá-lo numa conversa com um agente. */
export function IdField({ id }: { readonly id: string }) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied('ok');
    } catch {
      // Sem a API (ou sem permissão): seleciona o texto para o usuário copiar à mão.
      setCopied('failed');
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div class="id-field">
      <span class="muted id-label">{t('common.id')}</span>
      <code class="id-value">{id}</code>
      <button type="button" class="button" onClick={() => void copy()}>
        {t('common.copyId')}
      </button>
      <span class="muted" role="status">
        {copied === 'ok'
          ? t('common.copied')
          : copied === 'failed'
            ? t('common.copyFailed')
            : ''}
      </span>
    </div>
  );
}
