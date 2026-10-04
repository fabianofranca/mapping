import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import {
  isToolWindowOpen,
  toggleToolWindow,
  type ToolWindowId,
} from '../store/toolWindows';
import { IconButton } from './controls';
import { toolWindowMeta, toolWindowShortcut, windowsOfSide } from './toolWindowMeta';

// Faixas de 40px nas laterais: um botão por janela de ferramenta, com o atalho na
// dica. Na esquerda, as janelas laterais ficam em cima e as da janela inferior
// embaixo (seção Layouts do DS 2.0).

function StripButton({ id }: { readonly id: ToolWindowId }) {
  const { icon, title } = toolWindowMeta(id);
  const name = title();
  const open = isToolWindowOpen(id);
  // Erro novo no registro e a janela Diagnóstico fechada: ponto de alerta (B4).
  const alert = id === 'diagnostics' && diagnosticsUnseen.value && !open;
  const label = t(open ? 'window.hide' : 'window.show', { name });
  return (
    <IconButton
      icon={icon}
      label={alert ? `${label} (${t('diagnostics.unseen')})` : label}
      alert={alert}
      tooltip={name}
      shortcut={toolWindowShortcut(id)}
      pressed={open}
      onClick={() => toggleToolWindow(id)}
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
