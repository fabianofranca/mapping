import { useEffect, useRef } from 'preact/hooks';
import { createDrawingCache, type Project } from '../model';
import { t } from '../i18n';
import { memoizedTextMeasurer, textMeasurer } from '../store/textMeasure';
import { useEditor } from '../ui/EditorContext';
import { PreviewController } from './PreviewController';

/**
 * Mounts a read-only `PreviewController` in a <div> (cross-page reference preview). It keeps its own
 * drawing cache, so the main canvas' cache is never touched, and the shared `display` bitmaps.
 * Together with `CanvasHost`, the only component that knows Konva.
 */
export function PreviewHost(props: {
  readonly project: Project;
  readonly itemId: string;
}) {
  const { display, review } = useEditor();
  const { components } = review;
  const ref = useRef<HTMLDivElement>(null);
  const controller = useRef<PreviewController | null>(null);
  const cache = useRef(createDrawingCache());
  const latest = useRef(props);
  latest.current = props;

  const drawingsOf = (project: Project) => {
    const catalog = components.catalog.peek();
    const epoch = components.fontsEpoch.peek();
    return cache.current(
      project,
      catalog,
      memoizedTextMeasurer(textMeasurer.peek(), epoch),
      epoch,
      t('annotation.untitled'),
    );
  };

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const preview = new PreviewController({
      container,
      project: latest.current.project,
      itemId: latest.current.itemId,
      display,
      drawings: drawingsOf(latest.current.project),
    });
    controller.current = preview;
    return () => {
      controller.current = null;
      preview.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, components]);

  useEffect(() => {
    controller.current?.update({
      project: props.project,
      itemId: props.itemId,
      drawings: drawingsOf(props.project),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.project, props.itemId]);

  return <div ref={ref} class="preview-host" />;
}
