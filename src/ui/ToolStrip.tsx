import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { isToolWindowOpen, type ToolWindowId } from '../store/toolWindows';
import { IconButton } from './controls';
import { useEditor } from './EditorContext';
import { openCountText } from './comments/commentsText';
import { toggleToolWindowFocus } from './toolWindowLayout';
import { toolWindowMeta, toolWindowShortcut, windowsOfSide } from './toolWindowMeta';

// Faixas de 40px nas laterais: um botão por janela de ferramenta, com o atalho na
// dica. O nome acessível é fixo (o título da janela, mais o sufixo informativo); o estado
// aberto/fechado fica só no `aria-pressed`. Na esquerda, as janelas laterais ficam em cima e as da janela inferior
// embaixo (seção Layouts do DS 2.0).

/** Texto acessível a mais do botão: erro novo, propostas novas ou conversas abertas. */
function stripExtra(alert: boolean, fresh: number, openThreads: number): string {
  if (alert) return ` (${t('diagnostics.unseen')})`;
  if (fresh > 0) return ` (${t('proposals.newCount', { count: fresh })})`;
  return openThreads > 0 ? ` (${openCountText(openThreads)})` : '';
}

function StripButton({ id }: { readonly id: ToolWindowId }) {
  const { review, derived } = useEditor();
  const { icon, title } = toolWindowMeta(id);
  const name = title();
  const open = isToolWindowOpen(id);
  // Erro novo no registro e a janela Diagnóstico fechada: ponto de alerta (B4).
  const alert = id === 'diagnostics' && diagnosticsUnseen.value && !open;
  // Propostas novas: selo numérico informativo (`mp-sb__badge--info`).
  const fresh = id === 'proposals' ? review.derived.freshIds.value.length : 0;
  // Conversas abertas: selo numérico na janela Comentários.
  const openThreads = id === 'comments' ? derived.threads.openCount.value : 0;
  const extra = stripExtra(alert, fresh, openThreads);
  const badge = fresh > 0 ? fresh : openThreads;
  return (
    <IconButton
      icon={icon}
      label={`${name}${extra}`}
      alert={alert}
      badge={badge > 0 ? String(badge) : undefined}
      tooltip={name}
      tooltipPlacement="end"
      shortcut={toolWindowShortcut(id)}
      pressed={open}
      onClick={() => toggleToolWindowFocus(id)}
      data-strip-window={id}
    />
  );
}

/** Faixa de uma lateral. A esquerda também abre as janelas da faixa inferior. */
export function ToolStrip({ side }: { readonly side: 'left' | 'right' }) {
  const windows = windowsOfSide(side);
  const bottom: readonly ToolWindowId[] = side === 'left' ? windowsOfSide('bottom') : [];
  return (
    <nav class={`tool-strip tool-strip-${side}`} aria-label={t('window.stripLabel')}>
      <div class="tool-strip-group">
        {windows.map((id) => (
          <StripButton key={id} id={id} />
        ))}
      </div>
      {bottom.length > 0 && (
        <div class="tool-strip-group tool-strip-end">
          {bottom.map((id) => (
            <StripButton key={id} id={id} />
          ))}
        </div>
      )}
    </nav>
  );
}
