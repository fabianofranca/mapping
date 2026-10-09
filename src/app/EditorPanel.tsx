import { useComputed } from '@preact/signals';
import { t } from '../i18n';
import type { ProjectImage } from '../model';
import { resolveSelection, type AnnotationLocation, type Selection } from '../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { useEditor } from '../ui/EditorContext';
import { Icon } from '../ui/icons';
import { imageLabel, markingPath } from '../ui/labels';
import { MarkingPanel } from '../ui/MarkingPanel';
import { LayerDots } from '../ui/MarkingTree';
import { SelectionPanel } from '../ui/SelectionPanel';
import type { EditorDialogs } from './useEditorDialogs';

export interface EditorPanelProps {
  readonly busy: boolean;
  readonly dialogs: EditorDialogs;
  readonly onReplace: (image: ProjectImage) => void;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/** Detalhes: janela da direita (desktop), gaveta ou tela cheia (celular). */
export function EditorPanel({
  busy,
  dialogs,
  onReplace,
  onGoToAnnotation,
}: EditorPanelProps) {
  const { store, ui, display, canvas } = useEditor();
  // Projeto confirmado: os campos do painel atualizam ao soltar o gesto, não durante.
  const project = store.committed.value;
  if (!project) return null;
  const readOnly = store.locked.value;
  const selected = resolveSelection(project, ui.selection.value);
  const selectedImage = selected?.kind === 'image' ? selected.image : null;

  const onSelectMarking = (id: string) => {
    const next: NonNullable<Selection> = { kind: 'marking', id };
    ui.selection.value = next;
    canvas.current?.focusSelection();
  };

  return (
    <div class="tab-panel">
      {selected?.kind === 'marking' ? (
        <MarkingPanel
          key={selected.marking.id}
          project={project}
          marking={selected.marking}
          image={selected.image}
          readOnly={readOnly || busy}
          onDelete={dialogs.requestDeleteMarking}
          onSelectMarking={onSelectMarking}
          onGoToAnnotation={onGoToAnnotation}
        />
      ) : (
        <SelectionPanel
          image={selectedImage}
          display={
            selectedImage ? display.images.value.get(selectedImage.file) : undefined
          }
          readOnly={readOnly}
          busy={busy}
          onReplace={onReplace}
          onDelete={dialogs.requestDeleteImage}
        />
      )}
    </div>
  );
}

/**
 * Celular: a gaveta de Detalhes (B7). Recolhida mostra as bolinhas das camadas, o nome
 * do item selecionado e o aviso de pendência; aberta, o painel; a tela cheia é a janela
 * Detalhes em tela cheia.
 */
export function EditorSheet(panel: EditorPanelProps) {
  const { store, ui, derived } = useEditor();
  // Só o cabeçalho: textos e ids, para não renderizar a cada edição do projeto.
  const header = useComputed(() => {
    const project = store.committed.value;
    const selected = resolveSelection(project, ui.selection.value);
    if (project && selected?.kind === 'marking') {
      return {
        title: markingPath(project, selected.marking),
        markingId: selected.marking.id,
      };
    }
    return {
      title: selected?.kind === 'image' ? imageLabel(selected.image) : null,
      markingId: null,
    };
  });
  const { title, markingId } = header.value;
  const dots = markingId ? (derived.layerDots.value.get(markingId) ?? []) : [];
  const incomplete = markingId ? derived.incompleteMarkings.value.has(markingId) : false;
  return (
    <BottomSheet
      title={title ?? t('panel.nothingSelected')}
      leading={dots.length > 0 && <LayerDots dots={dots} />}
      trailing={
        incomplete && (
          <span class="sheet-warning" title={t('sheet.incomplete')}>
            <Icon name="warning" />
            <span class="visually-hidden">{t('sheet.incomplete')}</span>
          </span>
        )
      }
      height={ui.sheet.value}
      onHeightChange={(height) => (ui.sheet.value = height)}
      onFull={() => (ui.mobileWindow.value = 'details')}
    >
      <EditorPanel {...panel} />
    </BottomSheet>
  );
}
