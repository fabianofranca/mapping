import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import type { ProjectImage } from '../model';
import { resolveSelection, type AnnotationLocation, type Selection } from '../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { useEditor } from '../ui/EditorContext';
import { imageLabel, markingPath } from '../ui/labels';
import { MarkingPanel } from '../ui/MarkingPanel';
import { MarkingTree } from '../ui/MarkingTree';
import { PanelTabs, type PanelTab } from '../ui/PanelTabs';
import { SelectionPanel } from '../ui/SelectionPanel';
import type { EditorDialogs } from './useEditorDialogs';

export interface EditorPanelProps {
  /** Abas Detalhes | Árvore (celular). Sem elas, o painel mostra só os detalhes. */
  readonly tab?: PanelTab;
  readonly onTabChange?: (tab: PanelTab) => void;
  readonly busy: boolean;
  readonly dialogs: EditorDialogs;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Janela Detalhes (desktop) ou conteúdo da gaveta (celular, com as abas). */
export function EditorPanel({
  tab,
  onTabChange,
  busy,
  dialogs,
  onReplace,
  onGoToAnnotation,
}: EditorPanelProps) {
  const { store, ui, display, canvas } = useEditor();
  // Projeto confirmado: os campos do painel atualizam ao soltar o gesto, não durante.
  const project = store.committed.value;
  if (!project) return null;
  const readOnly = store.readOnly.value;
  const selection = ui.selection.value;
  const selected = resolveSelection(project, selection);
  const selectedImage = selected?.kind === 'image' ? selected.image : null;

  const onTreeSelect = (next: NonNullable<Selection>) => {
    ui.selection.value = next;
    canvas.current?.focusSelection();
  };

  const details =
    selected?.kind === 'marking' ? (
      <MarkingPanel
        key={selected.marking.id}
        project={project}
        marking={selected.marking}
        image={selected.image}
        readOnly={readOnly || busy}
        onDelete={dialogs.requestDeleteMarking}
        onSelectMarking={(id) => onTreeSelect({ kind: 'marking', id })}
        onGoToAnnotation={onGoToAnnotation}
      />
    ) : (
      <SelectionPanel
        image={selectedImage}
        display={selectedImage ? display.images.value.get(selectedImage.file) : undefined}
        readOnly={readOnly}
        busy={busy}
        onReplace={onReplace}
        onDelete={dialogs.requestDeleteImage}
      />
    );

  if (tab === undefined || !onTabChange) return <div class="tab-panel">{details}</div>;
  return (
    <>
      <PanelTabs tab={tab} onChange={onTabChange} />
      <div role="tabpanel" class="tab-panel">
        {tab === 'details' ? (
          details
        ) : (
          <MarkingTree project={project} selection={selection} onSelect={onTreeSelect} />
        )}
      </div>
    </>
  );
}

/** Celular: a gaveta inferior com o painel; recolhida mostra só o nome do item selecionado. */
export function EditorSheet({
  expanded,
  onToggle,
  ...panel
}: EditorPanelProps & { readonly expanded: boolean; readonly onToggle: () => void }) {
  const { store, ui } = useEditor();
  // Só o título da gaveta: um texto, para não renderizar a cada edição do projeto.
  const titleSignal = useComputed(() => {
    const project = store.committed.value;
    const selected = resolveSelection(project, ui.selection.value);
    if (project && selected?.kind === 'marking') {
      return markingPath(project, selected.marking);
    }
    return selected?.kind === 'image' ? imageLabel(selected.image) : null;
  });
  const title = titleSignal.value ?? t('panel.nothingSelected');
  return (
    <BottomSheet title={title} expanded={expanded} onToggle={onToggle}>
      <EditorPanel {...panel} />
    </BottomSheet>
  );
}
