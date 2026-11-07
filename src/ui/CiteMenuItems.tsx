import { t } from '../i18n';
import type { CitationTarget, ThreadAnchor } from '../model';
import {
  canCopyItems,
  citationTargetOf,
  copyReference,
  type CopyTarget,
} from '../app/itemClipboard';
import { composerOpen, insertCitation } from '../store/composerBridge';
import { startComposing } from '../store/threadUi';
import type { ActionMenuItem } from './ActionMenu';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { openToolWindow } from './toolWindowLayout';

// "Citar na conversa", "Comentar" e "Copiar referência" nos menus de um alvo (etapa Comentários,
// CM5, decisão 32): campo, par, linha, anotação, item, camada e conversa. Uma só definição de
// cada ação serve aos dois desenhos de menu da app: os botões do `Popover` (`CiteItem`,
// `CommentItem`, `CopyReferenceItem`) e a lista do `ActionMenu` (`useCiteMenuItems`).

/** Uma ação de menu: o rótulo, se vale agora, a dica de quando não vale e o que faz. */
interface MenuAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly title?: string;
  readonly run: () => void;
}

interface CiteActions {
  /** Projeto de pasta: só nele a referência tem um `<projeto>` que o MCP encontra. */
  readonly copyable: boolean;
  /** Insere o alvo no compositor aberto; desabilitado sem um (ou sem gravar: não depende de pasta). */
  cite(target: CitationTarget): MenuAction;
  /** Abre o rascunho de uma conversa ancorada em `anchor`; desabilitado no somente leitura e na revisão. */
  comment(anchor: ThreadAnchor): MenuAction;
  /** Copia a URL do alvo (só em projeto de pasta). */
  copy(target: CopyTarget): MenuAction;
}

/** As ações dos menus, lidas do estado de agora (re-renderiza quando o compositor abre ou fecha). */
export function useCiteActions(): CiteActions {
  const editor = useEditor();
  const { ui, store, review } = editor;
  const composer = composerOpen.value;
  const locked = store.locked.value;
  return {
    copyable: canCopyItems(editor),
    cite: (target) => ({
      label: t('cite.insert'),
      disabled: !composer,
      title: composer ? undefined : t('cite.needComposer'),
      run: () => void insertCitation(target),
    }),
    comment: (anchor) => ({
      label: t('comments.comment'),
      disabled: locked,
      run: () => {
        const project = review.derived.shownProject.peek();
        if (!project) return;
        startComposing(ui, project, anchor);
        openToolWindow('details');
      },
    }),
    copy: (target) => ({
      label: t('copy.reference'),
      disabled: false,
      run: () => void copyReference(editor, target),
    }),
  };
}

function ActionItem({
  action,
  close,
}: {
  readonly action: MenuAction;
  readonly close: () => void;
}) {
  return (
    <Button
      role="menuitem"
      disabled={action.disabled}
      title={action.title}
      onClick={() => {
        close();
        action.run();
      }}
    >
      {action.label}
    </Button>
  );
}

/** "Citar na conversa": habilitado só com um compositor aberto; vale também fora de uma pasta. */
export function CiteItem({
  target,
  close,
}: {
  readonly target: CopyTarget | CitationTarget;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  return <ActionItem action={actions.cite(citationTargetOf(target))} close={close} />;
}

/** "Comentar" no alvo; desabilitado no somente leitura e na revisão. */
export function CommentItem({
  anchor,
  close,
}: {
  readonly anchor: ThreadAnchor;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  return <ActionItem action={actions.comment(anchor)} close={close} />;
}

/** "Copiar referência" da camada, da conversa ou de qualquer alvo; some fora de uma pasta. */
export function CopyReferenceItem({
  target,
  close,
}: {
  readonly target: CopyTarget;
  readonly close: () => void;
}) {
  const actions = useCiteActions();
  if (!actions.copyable) return null;
  return <ActionItem action={actions.copy(target)} close={close} />;
}

function asMenuItem(action: MenuAction): ActionMenuItem {
  return {
    label: action.label,
    disabled: action.disabled,
    title: action.title,
    onSelect: action.run,
  };
}

/**
 * Os itens do `ActionMenu` de uma propriedade: Copiar referência (só em pasta), Citar na
 * conversa e, com `anchor`, Comentar. Chame a função devolvida uma vez por linha.
 */
export function useCiteMenuItems(): (
  target: CopyTarget,
  anchor: ThreadAnchor | null,
) => readonly ActionMenuItem[] {
  const actions = useCiteActions();
  return (target, anchor) => [
    ...(actions.copyable ? [asMenuItem(actions.copy(target))] : []),
    asMenuItem(actions.cite(citationTargetOf(target))),
    ...(anchor === null ? [] : [asMenuItem(actions.comment(anchor))]),
  ];
}
