import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { t } from '../i18n';
import type { SheetHeight } from '../store/ui';
import { IconButton } from './controls';

// Gaveta do celular (B7): três alturas. Recolhida (64px) mostra só o cabeçalho; aberta
// ocupa 72% do corpo do editor; tela cheia é a janela Detalhes em tela cheia (quem a
// abre é `onFull`). Tocar no cabeçalho alterna entre recolhida e aberta; arrastar o
// cabeçalho para cima sobe uma altura, para baixo desce uma.

/** Deslocamento (px) a partir do qual o arrasto no cabeçalho conta como gesto. */
export const SHEET_SWIPE = 24;

interface BottomSheetProps {
  readonly title: string;
  /** Antes do título (bolinhas das camadas). */
  readonly leading?: ComponentChildren;
  /** Depois do título (aviso de pendência). */
  readonly trailing?: ComponentChildren;
  readonly height: SheetHeight;
  readonly onHeightChange: (height: SheetHeight) => void;
  /** Terceira altura: abre o conteúdo em tela cheia. */
  readonly onFull: () => void;
  readonly children: ComponentChildren;
}

/** Botões e campos do cabeçalho não começam o arrasto nem alternam a altura. */
const isControl = (target: EventTarget | null) =>
  target instanceof Element && target.closest('button, a, input, select') !== null;

export function BottomSheet({
  title,
  leading,
  trailing,
  height,
  onHeightChange,
  onFull,
  children,
}: BottomSheetProps) {
  const contentId = useId();
  const open = height === 'open';
  const toggle = () => onHeightChange(open ? 'peek' : 'open');

  /** Arrastar o cabeçalho: para cima sobe uma altura, para baixo desce. */
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || isControl(e.target)) return;
    const header = e.currentTarget as HTMLElement;
    const origin = e.clientY;
    let moved = false;
    try {
      header.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura: o gesto termina se o dedo sair do cabeçalho.
    }
    const onMove = (move: PointerEvent) => {
      if (Math.abs(move.clientY - origin) >= SHEET_SWIPE) moved = true;
    };
    const stop = (end: PointerEvent) => {
      header.removeEventListener('pointermove', onMove);
      header.removeEventListener('pointerup', stop);
      header.removeEventListener('pointercancel', stop);
      if (end.type === 'pointercancel') return;
      const dy = end.clientY - origin;
      if (!moved && Math.abs(dy) < SHEET_SWIPE) {
        toggle();
      } else if (dy < 0) {
        if (open) onFull();
        else onHeightChange('open');
      } else if (open) {
        onHeightChange('peek');
      }
    };
    header.addEventListener('pointermove', onMove);
    header.addEventListener('pointerup', stop);
    header.addEventListener('pointercancel', stop);
  };

  return (
    <section class={open ? 'sheet sheet-open' : 'sheet'} aria-label={t('panel.details')}>
      <div class="sheet-header" onPointerDown={onPointerDown}>
        <span class="sheet-handle" aria-hidden="true" />
        <div class="sheet-bar">
          {leading}
          <span class="sheet-title">{title}</span>
          {trailing}
          {open && (
            <IconButton icon="maximize" label={t('sheet.full')} onClick={onFull} />
          )}
          <IconButton
            icon={open ? 'chevronDown' : 'chevronUp'}
            label={t(open ? 'panel.collapse' : 'panel.expand')}
            aria-expanded={open}
            aria-controls={contentId}
            onClick={toggle}
          />
        </div>
      </div>
      <div id={contentId} class="sheet-content" hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}
