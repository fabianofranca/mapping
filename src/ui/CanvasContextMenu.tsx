import { useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { canCopyItems } from '../app/itemClipboard';
import { CopyMenuItems } from './CopyActions';
import { useEditor } from './EditorContext';

/** Folga mínima entre o menu e a borda da janela do navegador. */
const EDGE = 8;

/**
 * Menu de contexto do canvas (botão direito do mouse): copiar a referência e o recorte do
 * item sob o cursor, que o clique direito seleciona. Aberto por `ui.canvasMenu`; fecha com
 * Esc, clique fora, rolagem ou ao escolher um item.
 */
export function CanvasContextMenu() {
  const editor = useEditor();
  const { ui } = editor;
  const menu = ui.canvasMenu.value;
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    ui.canvasMenu.value = null;
  };

  // Ancora no cursor, sem sair da janela.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!menu || !el) return;
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    const height = globalThis.innerHeight || document.documentElement.clientHeight;
    el.style.left = `${Math.max(EDGE, Math.min(menu.x, width - el.offsetWidth - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(menu.y, height - el.offsetHeight - EDGE))}px`;
    el.querySelector<HTMLElement>('button')?.focus();
  }, [menu]);

  // Em layout effect: os listeners entram junto com o menu, sem brecha para um clique fora.
  useLayoutEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', close, true);
    globalThis.addEventListener('resize', close);
    globalThis.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', close, true);
      globalThis.removeEventListener('resize', close);
      globalThis.removeEventListener('blur', close);
    };
    // `close` só escreve num signal estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  if (!menu || !canCopyItems(editor)) return null;
  return (
    <div
      class="popover"
      role="menu"
      aria-label={t('copy.canvasMenu')}
      ref={panel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CopyMenuItems target={menu.target} close={close} />
    </div>
  );
}
