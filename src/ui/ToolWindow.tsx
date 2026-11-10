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

// Janela de ferramenta encaixada (B1 e B2): cabeçalho de 32px com título (ou, na
// inferior, as abas) e ações,
// corpo com rolagem e divisória de arraste de 8px. O tamanho fica no estado de UI
// (`store/toolWindows`), não no projeto. A largura da esquerda é da coluna que reúne
// Árvore e Camadas (`EditorWindows`); a janela Camadas, quando está embaixo da Árvore,
// ganha também uma divisória horizontal e a própria altura.

interface ToolWindowProps {
  readonly id: ToolWindowId;
  /** Ações do cabeçalho, antes do botão de fechar. */
  readonly actions?: ComponentChildren;
  /** Janela empilhada embaixo de outra da mesma coluna: ganha altura e divisória. */
  readonly stacked?: boolean;
  readonly children: ComponentChildren;
}

function windowStyle(side: ToolWindowSide, size: number, stacked: boolean) {
  if (side === 'bottom') return { height: `${size}px` };
  if (side === 'right') return { width: `${size}px` };
  return stacked ? { height: `${layersWindowHeight.value}px` } : undefined;
}

/** Janelas que o Esc fecha quando o foco está dentro delas (etapa #1273, decisão 2). */
const ESC_CLOSES: readonly ToolWindowId[] = ['details', 'comments'];

/**
 * Esc sem modificadores, não consumido por um menu, popover ou dica, sem modal aberto e fora de
 * um campo de texto (o Esc do campo é dele): fecha a janela pelo mesmo caminho do X e não deixa
 * o Esc chegar aos atalhos do editor (não limpa a seleção).
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
          <h2 class="tool-window-title">{title}</h2>
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

/** Pixels que a janela cresce quando o ponteiro anda `delta` no eixo do lado. */
function growth(side: ToolWindowSide, delta: number): number {
  return side === 'left' ? delta : -delta;
}

/**
 * Arrasto de uma divisória com captura de ponteiro (sair da divisória não a solta): só o botão
 * principal; `onMove` recebe o ponteiro a cada movimento até soltar ou cancelar.
 */
function startDrag(e: PointerEvent, onMove: (move: PointerEvent) => void): void {
  if (e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  e.preventDefault();
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // Sem captura: o arrasto termina se o ponteiro sair da divisória.
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
 * Divisória: arrastar redimensiona, duplo clique volta ao padrão. O arrasto usa
 * captura de ponteiro, então sair da janela não solta a divisória.
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

/** Altura da coluna da esquerda, de onde sai o limite da divisória entre as janelas. */
function columnHeight(el: Element): number {
  return el.closest('[data-tool-column]')?.getBoundingClientRect().height || 0;
}

/**
 * Divisória horizontal entre a Árvore e as Camadas: arrastar para cima aumenta as
 * Camadas, duplo clique volta à altura padrão. Mesmo arrasto da divisória lateral.
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
