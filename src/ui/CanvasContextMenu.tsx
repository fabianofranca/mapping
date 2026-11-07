import { useLayoutEffect, useRef } from 'preact/hooks';
import { captureFocusOrigin, restoreFocusAfterRender, type FocusOrigin } from './focus';
import { t } from '../i18n';
import { canCopyItems, type ItemCopyTarget } from '../app/itemClipboard';
import { wrapAvailable } from '../app/wrapSelection';
import {
  ARROW_STYLES,
  canEditArrow,
  projectIndex,
  type ArrowStyle,
  type ThreadAnchor,
} from '../model';
import { arrangeMarking, canArrangeMarking } from './arrange';
import { CiteItem } from './CiteMenuItems';
import { CopyMenuItems } from './CopyActions';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { placeComment } from '../store/threadUi';
import { peekSelectedItems, isItemSelected } from '../store/ui';
import {
  blockedOutsideMain,
  PerspectiveMenuItems,
  PrincipalOnlyItem,
  rootsOf,
} from './PerspectiveMenuItems';

/**
 * ↓/↑ movem o foco entre os itens habilitados do menu (ou do submenu, se o foco está nele), em
 * círculo. → e ← do submenu ficam com `PerspectiveMenuItems`.
 */
function moveFocus(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const current = e.target as HTMLElement;
  const submenu = current.closest<HTMLElement>('[data-submenu]');
  const scope = submenu ?? (e.currentTarget as HTMLElement);
  const items = [
    ...scope.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'),
  ].filter((b) => !b.disabled && (submenu !== null || !b.closest('[data-submenu]')));
  const at = items.indexOf(current as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const step = e.key === 'ArrowDown' ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
}

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
      <CiteItem target={{ kind: 'arrow', id: arrowId }} close={close} />
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
 * Comentar (item sob o cursor) e Comentar aqui (lugar vazio de um container ou do canvas), decisão
 * 25: abrem o rascunho da conversa; nada é gravado antes do Enviar. Somente leitura: desabilitados.
 */
function CommentMenuItems({
  comment,
  here,
  close,
}: {
  readonly comment: ThreadAnchor | null;
  readonly here: ThreadAnchor | null;
  readonly close: () => void;
}) {
  const { ui, store, review, session } = useEditor();
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const openId = session.perspective.id.value;
  const items: readonly (readonly [ThreadAnchor | null, string])[] = [
    [comment, t('comments.comment')],
    [here, t('comments.here')],
  ];
  return (
    <div class="menu-items">
      {items.map(([anchor, label]) =>
        anchor === null ? null : (
          <PrincipalOnlyItem
            key={label}
            // O rascunho de um ponto do canvas aparece fora da Principal, mas o pino final não.
            blocked={
              anchor.kind === 'point' &&
              anchor.containerId === null &&
              blockedOutsideMain(project, openId, 'draw-canvas')
            }
            disabled={store.locked.value}
            onClick={() => {
              close();
              placeComment(ui, project, anchor);
            }}
          >
            {label}
          </PrincipalOnlyItem>
        ),
      )}
    </div>
  );
}

/**
 * Menu de contexto do canvas (botão direito do mouse): copiar a referência e o recorte, Envolver
 * (Ctrl/Cmd+G) do item sob o cursor, que o clique direito seleciona; numa seta, o estilo e Excluir. Aberto por
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
  const copyTarget: ItemCopyTarget | null =
    target && target.kind !== 'arrow' ? { kind: target.kind, id: target.id } : null;
  const arrangeId =
    target?.kind === 'm' &&
    !editor.store.locked.value &&
    canArrangeMarking(editor, target.id)
      ? target.id
      : null;
  const selectable = target?.kind === 'm';
  // Marcação e imagem (container) sempre têm o Envolver, com ou sem pasta (`WrapMenuItem` some
  // sozinho quando ele não existe: somente leitura, revisão).
  const wrappable = copyTarget !== null && wrapAvailable(editor);
  // Os itens do alvo (a seleção, se o item sob o cursor está nela): o Enviar usa a raiz de cada um.
  const picked = peekSelectedItems(ui);
  const perspectiveIds: readonly string[] =
    copyTarget === null
      ? []
      : isItemSelected(picked, {
            kind: copyTarget.kind === 'i' ? 'image' : 'marking',
            id: copyTarget.id,
          })
        ? picked.map((item) => item.id)
        : [copyTarget.id];
  const openId = editor.session.perspective.id.value;
  const real = editor.store.committed.value;
  // Excluir de uma raiz só vale na Principal: fora dela aparece desabilitado, com a dica.
  const deleteBlocked =
    real !== null &&
    perspectiveIds.length > 0 &&
    blockedOutsideMain(real, openId, 'delete', rootsOf(real, perspectiveIds));
  const comment = menu?.comment ?? null;
  const here = menu?.here ?? null;
  const commentable = comment !== null || here !== null;
  if (
    !menu ||
    !(
      // Citar na conversa vale para todo item, com ou sem pasta.
      copyTarget !== null ||
      copyable ||
      arrangeId !== null ||
      selectable ||
      arrowId !== null ||
      wrappable ||
      commentable
    )
  ) {
    return null;
  }
  return (
    <div
      class="popover"
      role="menu"
      aria-label={t('copy.canvasMenu')}
      ref={panel}
      onKeyDown={moveFocus}
      onContextMenu={(e) => e.preventDefault()}
    >
      {copyTarget && (
        <CopyMenuItems
          target={copyTarget}
          close={close}
          copyable={copyable}
          commentable={false}
        />
      )}
      {arrowId !== null && <ArrowMenuItems arrowId={arrowId} close={close} />}
      {commentable && <CommentMenuItems comment={comment} here={here} close={close} />}
      {perspectiveIds.length > 0 && (
        <PerspectiveMenuItems ids={perspectiveIds} close={close} />
      )}
      {arrangeId !== null && (
        <div class="menu-items">
          <PrincipalOnlyItem
            blocked={real !== null && blockedOutsideMain(real, openId, 'arrange')}
            onClick={() => {
              close();
              arrangeMarking(editor, arrangeId);
            }}
          >
            {t('arrange.action')}
          </PrincipalOnlyItem>
        </div>
      )}
      {deleteBlocked && (
        <div class="menu-items menu-items-group">
          <PrincipalOnlyItem blocked variant="danger" onClick={close}>
            {t('common.delete')}
          </PrincipalOnlyItem>
        </div>
      )}
    </div>
  );
}
