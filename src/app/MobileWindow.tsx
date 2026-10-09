import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { diagnosticsUnseen } from '../store/diagnostics';
import { TOOL_WINDOWS, type ToolWindowId } from '../store/toolWindows';
import { collapseTree, revealInTree, type Selection } from '../store/ui';
import { Tabs, IconButton, type TabItem } from '../ui/controls';
import {
  DiagnosticsActions,
  DiagnosticsView,
  useCopyErrors,
} from '../ui/DiagnosticsView';
import { useEditor } from '../ui/EditorContext';
import { IncompleteView } from '../ui/IncompleteView';
import { LayerActions, LayersPanel } from '../ui/LayersPanel';
import { ListView } from '../ui/ListView';
import { afterPaint, MarkingTree, scrollToSelected } from '../ui/MarkingTree';
import { toolWindowMeta, windowBadge } from '../ui/toolWindowMeta';
import { HELP_PROPOSALS } from '../ui/HelpDialog';
import { ProposalsHeaderActions, ProposalsWindow } from '../ui/review/ProposalsWindow';
import { EditorPanel, type EditorPanelProps } from './EditorPanel';

// Celular (B6): cada janela de ferramenta abre em tela cheia, com cabeçalho (voltar ao
// canvas, título e as ações da janela) e a faixa de abas das seis janelas. O canvas
// continua montado por baixo (escondido), para voltar sem recriar o palco.

interface MobileWindowProps {
  readonly id: ToolWindowId;
  readonly panel: EditorPanelProps;
  /** Escolher um item na Árvore ou na Lista: seleciona e volta ao canvas. */
  readonly onSelect: (selection: NonNullable<Selection>) => void;
  readonly onBack: () => void;
}

/** Faixa de abas: Incompletas mostra quantas pendências; Diagnóstico, o erro novo. */
function WindowStrip({ active }: { readonly active: ToolWindowId }) {
  const { ui, derived, review } = useEditor();
  const incomplete = derived.incompleteCount.value;
  const fresh = review.derived.freshIds.value.length;
  const unseen = diagnosticsUnseen.value;
  const tabs: TabItem<ToolWindowId>[] = TOOL_WINDOWS.map((id) => {
    const meta = toolWindowMeta(id);
    const title = meta.title();
    return {
      id,
      icon: meta.icon,
      label: meta.tab?.() ?? title,
      title,
      ...windowBadge(id, incomplete, fresh),
      alert: id === 'diagnostics' && unseen && active !== 'diagnostics',
    };
  });
  return (
    <div class="mobile-strip">
      <Tabs
        label={t('window.stripLabel')}
        value={active}
        onChange={(id) => (ui.mobileWindow.value = id)}
        tabs={tabs}
      />
    </div>
  );
}

/** Localizar a seleção e Recolher tudo, no cabeçalho da Árvore. */
function TreeActions({ body }: { readonly body: { current: HTMLElement | null } }) {
  const { store, ui } = useEditor();
  return (
    <>
      <IconButton
        icon="locate"
        label={t('tree.locate')}
        disabled={ui.selection.value === null}
        onClick={() => {
          revealInTree(ui, store.committed.peek(), ui.selection.peek());
          afterPaint(() => scrollToSelected(body.current, true));
        }}
      />
      <IconButton
        icon="collapseAll"
        label={t('tree.collapseAll')}
        onClick={() => collapseTree(ui, store.committed.peek())}
      />
    </>
  );
}

function DiagnosticsHeaderActions() {
  return <DiagnosticsActions {...useCopyErrors()} />;
}

export function MobileWindow({ id, panel, onSelect, onBack }: MobileWindowProps) {
  const { store, ui } = useEditor();
  const back = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const project = store.committed.value;
  const readOnly = store.readOnly.value;
  const title = toolWindowMeta(id).title();

  // Ao abrir, o foco vai para o "voltar" (o canvas por baixo fica escondido).
  useEffect(() => {
    back.current?.querySelector('button')?.focus();
  }, []);

  if (!project) return null;

  let actions: ComponentChildren = null;
  let content: ComponentChildren;
  switch (id) {
    case 'tree':
      actions = <TreeActions body={body} />;
      content = (
        <MarkingTree
          project={project}
          selection={ui.selection.value}
          onSelect={onSelect}
        />
      );
      break;
    case 'layers':
      actions = <LayerActions project={project} readOnly={readOnly} />;
      content = (
        <>
          <p class="muted mobile-window-hint">{t('layer.hint')}</p>
          <LayersPanel project={project} readOnly={readOnly} />
        </>
      );
      break;
    case 'details':
      content = <EditorPanel {...panel} />;
      break;
    case 'list':
      content = <ListView onSelect={onSelect} />;
      break;
    case 'incomplete':
      // Leva à anotação na gaveta aberta, com a marcação no canvas.
      content = <IncompleteView onGoToAnnotation={panel.onGoToAnnotation} />;
      break;
    case 'diagnostics':
      actions = <DiagnosticsHeaderActions />;
      content = <DiagnosticsView />;
      break;
    case 'proposals':
      actions = <ProposalsHeaderActions />;
      content = (
        <ProposalsWindow
          onHelp={() => panel.dialogs.show({ kind: 'help', section: HELP_PROPOSALS })}
        />
      );
      break;
  }

  return (
    <section
      class="mobile-window"
      aria-label={title}
      data-window={id}
      onKeyDown={(e) => {
        // Esc volta ao canvas (antes do atalho global, que limparia a seleção). Num
        // diálogo aberto por cima (seletor de referência, confirmação), o Esc é dele.
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (e.target instanceof Element && e.target.closest('dialog')) return;
        e.preventDefault();
        onBack();
      }}
    >
      <header class="mobile-bar mobile-window-bar">
        <div ref={back} class="mobile-window-back">
          <IconButton icon="arrowLeft" label={t('mobile.back')} onClick={onBack} />
        </div>
        <h1 class="mobile-window-title">{title}</h1>
        {actions}
      </header>
      <WindowStrip active={id} />
      <div
        ref={body}
        class="mobile-window-body"
        role="tabpanel"
        aria-label={title}
        data-window-body={id}
      >
        {content}
      </div>
    </section>
  );
}
