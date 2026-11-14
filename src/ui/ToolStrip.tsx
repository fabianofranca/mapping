import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { isToolWindowOpen, type ToolWindowId } from '../store/toolWindows';
import { IconButton } from './controls';
import { useEditor } from './EditorContext';
import { openCountText } from './comments/commentsText';
import { toggleToolWindowFocus } from './toolWindowLayout';
import { toolWindowMeta, toolWindowShortcut, windowsOfSide } from './toolWindowMeta';

// 40px strips on the sides: one button per tool window, with the shortcut in the
// hint. The accessible name is fixed (the window title, plus the informative suffix); the
// open/closed state lives only in `aria-pressed`. On the left, the side windows sit on top and those of the bottom window
// below (Layouts section of DS 2.0).

/** Extra accessible text of the button: new error, new proposals or open threads. */
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
  // New error in the log and the Diagnostics window closed: alert dot (B4).
  const alert = id === 'diagnostics' && diagnosticsUnseen.value && !open;
  // New proposals: informative numeric badge (`mp-sb__badge--info`).
  const fresh = id === 'proposals' ? review.derived.freshIds.value.length : 0;
  // Open threads: numeric badge on the Comments window.
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

/** Strip of one side. The left one also opens the bottom strip's windows. */
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
