import { useLayoutEffect, useRef } from 'preact/hooks';
import { captureFocusOrigin, restoreFocusAfterRender, type FocusOrigin } from './focus';
import { t } from '../i18n';
import { canCopyItems, type CopyTarget } from '../app/itemClipboard';
import { ARROW_STYLES, canEditArrow, projectIndex, type ArrowStyle } from '../model';
import { arrangeMarking, canArrangeMarking } from './arrange';
import { CopyMenuItems } from './CopyActions';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';

/** Folga mínima entre o menu e a borda da janela do navegador. */
const EDGE = 8;

const ARROW_STYLE_LABELS: Readonly<
  Record<
    ArrowStyle,
    'arrow.canvasMenu.straight' | 'arrow.canvasMenu.curve' | 'arrow.canvasMenu.elbow'
  >
> = {
  straight: 'arrow.canvasMenu.straight',
  curve: 'arrow.canvasMenu.curve',
  elbow: 'arrow.canvasMenu.elbow',
};

/**
 * Itens do menu de uma seta (ME4): o estilo do traço (Reta, Curva, Canto; o atual marcado) e
 * Excluir. Cada escolha é uma entrada do histórico. Trancada (ou o projeto somente leitura), os
 * itens ficam desabilitados.
 */
function ArrowMenuItems({
  arrowId,
  close,
}: {
  readonly arrowId: string;
  readonly close: () => void;
}) {
  const { actions, store, review } = useEditor();
  const project = review.derived.shownProject.value;
  const arrow = project ? projectIndex(project).arrows.get(arrowId) : undefined;
  if (!project || !arrow) return null;
  const editable = !store.locked.value && canEditArrow(project, arrowId);
  return (
    <div class="menu-items">
      {ARROW_STYLES.map((style) => (
        <Button
          key={style}
          role="menuitemradio"
          aria-checked={arrow.style === style}
          disabled={!editable}
          onClick={() => {
            close();
            actions.setArrowStyle(arrowId, style);
          }}
        >
          {arrow.style === style && <Icon name="check" />}
          {t(ARROW_STYLE_LABELS[style])}
        </Button>
      ))}
      <Button
        role="menuitem"
        variant="danger"
        disabled={!editable}
        onClick={() => {
          close();
          actions.removeArrow(arrowId);
        }}
      >
        {t('arrow.canvasMenu.delete')}
      </Button>
    </div>
  );
}

/**
 * Menu de contexto do canvas (botão direito do mouse): copiar a referência e o recorte do
 * item sob o cursor, que o clique direito seleciona; numa seta, o estilo e Excluir. Aberto por
 * `ui.canvasMenu`; fecha com Esc, clique fora, rolagem ou ao escolher um item.
 */
export function CanvasContextMenu() {
  const editor = useEditor();
  const { ui } = editor;
  const menu = ui.canvasMenu.value;
  const panel = useRef<HTMLDivElement>(null);
  // Quem tinha o foco antes de o menu abrir (não há gatilho: abre pelo botão direito) e o
  // painel aberto: ao fechar (Esc, escolha, clique fora), o foco que estava no menu volta
  // para lá em vez de cair no `body` (etapa 8, F6).
  const origin = useRef<FocusOrigin | null>(null);
  const shown = useRef<HTMLElement | null>(null);
  const close = () => {
    ui.canvasMenu.value = null;
  };

  // Ancora no cursor, sem sair da janela.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!menu || !el) {
      if (origin.current && shown.current) {
        restoreFocusAfterRender(shown.current, origin.current, { current: undefined });
      }
      origin.current = null;
      shown.current = null;
      return;
    }
    origin.current ??= captureFocusOrigin();
    shown.current = el;
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

  const copyable = canCopyItems(editor);
  const target = menu?.target;
  const arrowId = target?.kind === 'arrow' ? target.id : null;
  const copyTarget: CopyTarget | null =
    target && target.kind !== 'arrow' ? { kind: target.kind, id: target.id } : null;
  const arrangeId =
    target?.kind === 'm' &&
    !editor.store.locked.value &&
    canArrangeMarking(editor, target.id)
      ? target.id
      : null;
  const selectable = target?.kind === 'm';
  if (!menu || !(copyable || arrangeId !== null || selectable || arrowId !== null)) {
    return null;
  }
  return (
    <div
      class="popover"
      role="menu"
      aria-label={t('copy.canvasMenu')}
      ref={panel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {copyTarget && (copyable || selectable) && (
        <CopyMenuItems target={copyTarget} close={close} copyable={copyable} />
      )}
      {arrowId !== null && <ArrowMenuItems arrowId={arrowId} close={close} />}
      {arrangeId !== null && (
        <div class="menu-items">
          <Button
            role="menuitem"
            onClick={() => {
              close();
              arrangeMarking(editor, arrangeId);
            }}
          >
            {t('arrange.action')}
          </Button>
        </div>
      )}
    </div>
  );
}
