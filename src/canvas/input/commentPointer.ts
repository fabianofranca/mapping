// O clique do botão Comentar, o clique no pino das conversas e o menu de contexto do canvas com os
// itens Comentar e Comentar aqui (etapa Comentários, CM4, decisões 24 e 25). Fora do `PointerInput`
// para ele não crescer: funções que leem o estado do editor e escrevem só no estado da UI.
import {
  threadSubject,
  type MarkingVisibility,
  type Project,
  type Rect,
  type Thread,
} from '../../model';
import { t } from '../../i18n';
import type { EditorDerived } from '../../store/derived';
import { activatePin, cancelComment, placeComment } from '../../store/threadUi';
import type { CanvasMenu, EditorUi } from '../../store/ui';
import type { PinPlace } from '../commentPins';
import type { Point } from '../viewport';
import { commentAnchorAt, pointAnchorAt, type ArrowHit, type HitItem } from './intents';

/** As conversas de um pino, na ordem das conversas carregadas. */
export function pinThreads(derived: EditorDerived, pin: PinPlace): readonly Thread[] {
  const ids = new Set(pin.group.threadIds);
  return derived.threads.entries
    .peek()
    .map((entry) => entry.thread)
    .filter((thread) => ids.has(thread.id));
}

/** A dica do pino (ao passar o mouse): o assunto da conversa, ou a contagem de várias. */
export function pinTitle(derived: EditorDerived, pin: PinPlace): string {
  const threads = pinThreads(derived, pin);
  const [first] = threads;
  if (threads.length !== 1 || !first) {
    return t('comments.pin.many', { count: String(pin.group.count) });
  }
  return threadSubject(first);
}

export interface CommentTap {
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  readonly project: Project | null;
  /** Somente leitura ou revisão: não dá para comentar. */
  readonly blocked: boolean;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  readonly arrows: ArrowHit;
  readonly titles: ReadonlyMap<string, Rect> | undefined;
  readonly pin: PinPlace | null;
}

/** O clique do Comentar armado: abre o rascunho no item ou no ponto (ou desarma, se bloqueado). */
function placeAt(tap: CommentTap, c: Point): void {
  const { ui, project } = tap;
  if (!project || tap.blocked) {
    cancelComment(ui);
    return;
  }
  placeComment(
    ui,
    project,
    commentAnchorAt(project, tap.visibility, c, tap.arrows, tap.titles),
  );
}

/**
 * O clique em `c` (canvas) no modo Comentar ou sobre um pino. Armado: abre o rascunho (decisão 25);
 * sobre um pino: seleciona o item e abre a conversa ou a lista (decisão 24). `true` se consumiu o
 * clique.
 */
export function tapComment(tap: CommentTap, c: Point): boolean {
  if (tap.ui.commentArm.peek() !== null) {
    placeAt(tap, c);
    return true;
  }
  if (!tap.pin || !tap.project) return false;
  activatePin(tap.ui, tap.project, pinThreads(tap.derived, tap.pin));
  return true;
}

/**
 * O menu de contexto do canvas (botão direito): o item sob o cursor, o Comentar dele e, num lugar
 * vazio ou dentro de um container, o Comentar aqui. Sem projeto e sem item, não há menu.
 */
export function canvasMenuAt(
  project: Project | null,
  picked: HitItem | null,
  c: Point,
  at: { readonly x: number; readonly y: number },
): CanvasMenu | null {
  const here =
    project && (!picked || picked.kind === 'image') ? pointAnchorAt(project, c) : null;
  if (!picked) return here ? { ...at, target: null, comment: null, here } : null;
  return {
    ...at,
    target: {
      kind: picked.kind === 'image' ? 'i' : picked.kind === 'arrow' ? 'arrow' : 'm',
      id: picked.id,
    },
    comment: { kind: picked.kind === 'image' ? 'container' : picked.kind, id: picked.id },
    here,
  };
}
