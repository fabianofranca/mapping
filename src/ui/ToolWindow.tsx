import type { ComponentChildren } from 'preact';
import { isTypingField } from '../app/shortcuts';
import { t } from '../i18n';
import {
  WINDOW_SIDE,
  layersWindowHeight,
  resetLayersWindowHeight,
  resetToolWindowSize,
  resizeLayersWindow,
  resizeToolWindow,
  sideWidth,
  toolWindowSizes,
  type ToolWindowId,
  type ToolWindowSide,
} from '../store/toolWindows';
import { BottomTabs } from './BottomTabs';
import { IconButton } from './controls';
import { modalOpen } from './focus';
import { closeToolWindow, spaceFor } from './toolWindowLayout';
import { toolWindowMeta } from './toolWindowMeta';

// Docked tool window (B1 and B2): 32px header with a title (or, in the
// bottom one, the tabs) and actions,
// scrolling body and an 8px drag divider. The size lives in the UI state
// (`store/toolWindows`), not in the project. The left width belongs to the column that holds
// Tree and Layers (`EditorWindows`); the Layers window, when below the Tree,
// also gets a horizontal divider and its own height.

interface ToolWindowProps {
  readonly id: ToolWindowId;
  /** Header actions, before the close button. */
  readonly actions?: ComponentChildren;
  /** Window stacked below another in the same column: gets a height and a divider. */
  readonly stacked?: boolean;
  readonly children: ComponentChildren;
}

function windowStyle(side: ToolWindowSide, size: number, stacked: boolean) {
  if (side === 'bottom') return { height: `${size}px` };
  if (side === 'right') return { width: `${size}px` };
  return stacked ? { height: `${layersWindowHeight.value}px` } : undefined;
}

/** Windows that Esc closes when the focus is inside them (stage #1273, decision 2). */
const ESC_CLOSES: readonly ToolWindowId[] = ['details', 'comments'];

/**
 * Esc without modifiers, not consumed by a menu, popover or tooltip, with no modal open and outside
 * a text field (the field's Esc is its own): closes the window the same way as the X and does
 * not let Esc reach the editor shortcuts (it does not clear the selection).
 */
function closeOnEscape(id: ToolWindowId, e: KeyboardEvent): void {
  if (!ESC_CLOSES.includes(id) || e.key !== 'Escape') return;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
  if (modalOpen.peek() !== 0 || isTypingField(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  closeToolWindow(id);
}

export function ToolWindow({ id, actions, stacked = false, children }: ToolWindowProps) {
  const side = WINDOW_SIDE[id];
  const title = toolWindowMeta(id).title();
  const size = side === 'bottom' ? toolWindowSizes.value.bottom : sideWidth(side);
  return (
    <section
      class={`tool-window tool-window-${side}${stacked ? ' tool-window-stacked' : ''}`}
      style={windowStyle(side, size, stacked)}
      aria-label={title}
      data-side={side}
      data-window={id}
      tabIndex={-1}
      onKeyDown={(e) => closeOnEscape(id, e)}
    >
      <ToolResizer side={side} name={title} />
      {stacked && <ToolSplitter name={title} />}
      <header class="tool-window-head">
        {side === 'bottom' ? (
          <div class="tool-window-tabs">
            <BottomTabs active={id} />
          </div>
        ) : (
          <h2 class="tool-window-title" title={title}>
            {title}
          </h2>
        )}
        {actions}
        <IconButton
          icon="close"
          label={t('window.closeWindow', { name: title })}
          onClick={() => closeToolWindow(id)}
        />
      </header>
      <div
        class="tool-window-body"
        role={side === 'bottom' ? 'tabpanel' : undefined}
        aria-label={side === 'bottom' ? title : undefined}
      >
        {children}
      </div>
    </section>
  );
}

/** Pixels the window grows when the pointer moves `delta` along the axis of its side. */
function growth(side: ToolWindowSide, delta: number): number {
  return side === 'left' ? delta : -delta;
}

/**
 * Drag of a divider with pointer capture (leaving the divider does not release it): primary
 * button only; `onMove` receives the pointer on every move until release or cancel.
 */
function startDrag(e: PointerEvent, onMove: (move: PointerEvent) => void): void {
  if (e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  e.preventDefault();
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // Without capture: the drag ends if the pointer leaves the divider.
  }
  const stop = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

/**
 * Divider: dragging resizes, double click returns to the default. The drag uses
 * pointer capture, so leaving the window does not release the divider.
 */
function ToolResizer({
  side,
  name,
}: {
  readonly side: ToolWindowSide;
  readonly name: string;
}) {
  const onPointerDown = (e: PointerEvent) => {
    const space = spaceFor(e.currentTarget as HTMLElement, side);
    const from = side === 'bottom' ? toolWindowSizes.peek().bottom : sideWidth(side);
    const origin = side === 'bottom' ? e.clientY : e.clientX;
    startDrag(e, (move) => {
      const delta = (side === 'bottom' ? move.clientY : move.clientX) - origin;
      resizeToolWindow(side, from + growth(side, delta), space);
    });
  };

  return (
    <div
      class="tool-resizer"
      role="separator"
      aria-label={t('window.resize', { name })}
      aria-orientation={side === 'bottom' ? 'horizontal' : 'vertical'}
      onPointerDown={onPointerDown}
      onDblClick={(e) => resetToolWindowSize(side, spaceFor(e.currentTarget, side))}
    />
  );
}

/** Height of the left column, from which the divider limit between the windows comes. */
function columnHeight(el: Element): number {
  return el.closest('[data-tool-column]')?.getBoundingClientRect().height || 0;
}

/**
 * Horizontal divider between the Tree and the Layers: dragging up grows the
 * Layers, double click returns to the default height. Same drag as the side divider.
 */
function ToolSplitter({ name }: { readonly name: string }) {
  const onPointerDown = (e: PointerEvent) => {
    const column = columnHeight(e.currentTarget as HTMLElement);
    const from = layersWindowHeight.peek();
    const origin = e.clientY;
    startDrag(e, (move) => resizeLayersWindow(from - (move.clientY - origin), column));
  };

  return (
    <div
      class="tool-splitter"
      role="separator"
      aria-label={t('window.resize', { name })}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onDblClick={(e) => resetLayersWindowHeight(columnHeight(e.currentTarget))}
    />
  );
}
