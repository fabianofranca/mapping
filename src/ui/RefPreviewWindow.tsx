import { effect } from '@preact/signals';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { PreviewHost } from '../canvas/PreviewHost';
import { projectIndex, refPreviewProject, type Annotation, type Project } from '../model';
import {
  type AnnotationLocation,
  closeRefPreview,
  createEditorUi,
  expandSections,
  resolveSelection,
  type RefPreviewTarget,
  type Selection,
} from '../store/ui';
import { isTypingField } from '../app/shortcuts';
import { ArrowPanel } from './ArrowPanel';
import { Button, HideDisabledContext, IconButton } from './controls';
import { EditorContext, useEditor, type EditorContextValue } from './EditorContext';
import { modalOpen } from './focus';
import { arrowText, imageLabel, markingPath } from './labels';
import { MarkingPanel } from './MarkingPanel';
import { goToAnnotationOnAnyPage } from './pageNavigation';
import { SelectionPanel } from './SelectionPanel';
import { focusCanvasArea } from './toolWindowLayout';

// Floating, non-modal, read-only preview of a reference to another page (stage #883, PG3,
// decision 13): the item's group drawn by `PreviewHost` and the item's Details, read-only. Nothing
// here selects, switches page or writes the project; "Go to the page" is the only way out that
// navigates. Focus goes into the window on open and returns to the opener (or the canvas area).

const noop = () => undefined;

/** What the window shows, or `null` when the item or its annotation is gone. */
function resolveTarget(project: Project | null, target: RefPreviewTarget) {
  if (!project) return null;
  const index = projectIndex(project);
  const annotation = index.annotations.get(target.annotationId);
  const preview = refPreviewProject(project, target.itemId);
  const page = index.pageOf.get(target.itemId);
  if (!annotation || !preview || page === undefined) return null;
  return {
    annotation,
    preview,
    pageName: project.pages.find((g) => g.id === page)?.name ?? '',
  };
}

/** The item's path: marking path, arrow "from → to" or container name. */
function itemPath(project: Project, itemId: string): string {
  const index = projectIndex(project);
  const marking = index.markings.get(itemId);
  if (marking) return markingPath(project, marking);
  const arrow = index.arrows.get(itemId);
  if (arrow) return arrowText(project, arrow);
  const container = index.containers.get(itemId);
  return container ? imageLabel(container) : '';
}

function focusReturn(opener: HTMLElement | null): void {
  if (opener?.isConnected === true) opener.focus();
  else focusCanvasArea();
}

export function RefPreviewWindow() {
  const editor = useEditor();
  const target = editor.ui.refPreview.value;
  const project = editor.store.committed.value;
  const resolved = target ? resolveTarget(project, target) : null;
  // The item or the annotation is gone (undo, external reload): the window closes.
  useEffect(() => {
    if (target && !resolved) closeRefPreview(editor.ui);
  }, [target, resolved, editor.ui]);
  if (!target || !project || !resolved) return null;
  return (
    <PreviewWindow
      key={`${target.itemId}:${target.annotationId}`}
      target={target}
      project={project}
      annotation={resolved.annotation}
      preview={resolved.preview}
      pageName={resolved.pageName}
    />
  );
}

interface WindowProps {
  readonly target: RefPreviewTarget;
  readonly project: Project;
  readonly annotation: Annotation;
  readonly preview: Project;
  readonly pageName: string;
}

function PreviewWindow({ target, project, annotation, preview, pageName }: WindowProps) {
  const editor = useEditor();
  const heading = useRef<HTMLHeadingElement>(null);
  const restore = useRef(true);
  const section = useRef<HTMLElement>(null);
  // Details of the preview live on their own UI state: the sections it opens, the selection and the
  // focus it asks for never reach the main window's. Only `refPreview` is the real signal, so a
  // reference followed inside the preview replaces the preview's target.
  const sandbox = useMemo(() => {
    const ui = { ...createEditorUi(), refPreview: editor.ui.refPreview };
    return { ...editor, ui } as EditorContextValue;
  }, [editor]);
  // A target set from inside the window keeps the original opener (the clicked button goes away).
  useEffect(
    () =>
      effect(() => {
        const next = editor.ui.refPreview.value;
        if (next && next !== target && section.current?.contains(next.opener))
          editor.ui.refPreview.value = { ...next, opener: target.opener };
      }),
    [editor, target],
  );
  const path = itemPath(project, target.itemId);

  useLayoutEffect(() => {
    heading.current?.focus();
    return () => {
      if (restore.current) focusReturn(target.opener);
    };
    // Only on opening and closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => closeRefPreview(editor.ui);
  const goToPage = () => {
    restore.current = false;
    close();
    goToAnnotationOnAnyPage(editor, annotation);
    focusCanvasArea();
  };
  // A reference to an annotation on the open page: leaves the preview and goes there for real.
  const goToAnnotation = (location: AnnotationLocation) => {
    restore.current = false;
    close();
    goToAnnotationOnAnyPage(editor, location);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    if (modalOpen.peek() !== 0 || isTypingField(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const titleId = 'ref-preview-title';
  return (
    <section
      ref={section}
      class="ref-preview"
      role="dialog"
      aria-modal="false"
      aria-label={t('refPreview.label')}
      aria-describedby="ref-preview-hint"
      onKeyDown={onKeyDown}
    >
      <header class="ref-preview-head">
        <h2 id={titleId} class="ref-preview-title" ref={heading} tabIndex={-1}>
          {t('refPreview.title', { page: pageName, item: path })}
        </h2>
        <Button size="sm" onClick={goToPage}>
          {t('refPreview.goToPage')}
        </Button>
        <IconButton
          icon="close"
          label={t('refPreview.close')}
          size="sm"
          onClick={close}
        />
      </header>
      <p id="ref-preview-hint" class="ref-preview-hint muted">
        {t('refPreview.hint')}
      </p>
      <div class="ref-preview-body">
        <div class="ref-preview-canvas">
          <PreviewHost project={preview} itemId={target.itemId} />
        </div>
        <EditorContext.Provider value={sandbox}>
          <PreviewDetails
            target={target}
            annotation={annotation}
            project={project}
            onGoToAnnotation={goToAnnotation}
          />
        </EditorContext.Provider>
      </div>
    </section>
  );
}

/** The item's Details, as in the review: the normal panels, read-only, over the committed project. */
function PreviewDetails({
  target,
  annotation,
  project,
  onGoToAnnotation,
}: {
  readonly target: RefPreviewTarget;
  readonly annotation: Annotation;
  readonly project: Project;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  const { ui } = useEditor();
  const index = projectIndex(project);
  const kind = index.arrows.has(target.itemId)
    ? 'arrow'
    : index.markings.has(target.itemId)
      ? 'marking'
      : 'image';
  const resolved = resolveSelection(project, { kind, id: target.itemId } as Selection);
  // Opens what hides the followed annotation (only in this window's own state).
  useLayoutEffect(() => {
    expandSections(ui, [
      { kind: 'annotations' },
      { kind: 'layer', id: annotation.layerId },
      { kind: 'annotation', id: annotation.id },
    ]);
    ui.focusAnnotation.value = annotation.id;
  }, [ui, annotation]);
  return (
    <div
      class="review-details ref-preview-details"
      role="region"
      aria-label={t('refPreview.details')}
    >
      <HideDisabledContext.Provider value={true}>
        <div class="review-panel">
          <ReadOnlyPanel
            project={project}
            resolved={resolved}
            onGoToAnnotation={onGoToAnnotation}
          />
        </div>
      </HideDisabledContext.Provider>
    </div>
  );
}

function ReadOnlyPanel({
  project,
  resolved,
  onGoToAnnotation,
}: {
  readonly project: Project;
  readonly resolved: ReturnType<typeof resolveSelection>;
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}) {
  const { display } = useEditor();
  if (resolved?.kind === 'arrow')
    return (
      <ArrowPanel
        project={project}
        arrow={resolved.arrow}
        readOnly
        onDelete={noop}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  if (resolved?.kind === 'marking')
    return (
      <MarkingPanel
        project={project}
        marking={resolved.marking}
        image={resolved.image}
        readOnly
        onDelete={noop}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  const image = resolved?.kind === 'image' ? resolved.image : null;
  return (
    <SelectionPanel
      image={image}
      project={project}
      display={image?.file ? display.images.value.get(image.file) : undefined}
      readOnly
      busy={false}
      onReplace={noop}
      onDelete={noop}
    />
  );
}
