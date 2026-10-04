import { t } from '../i18n';
import type { AnnotationLocation } from '../store/ui';
import { AnnotationTitle } from './AnnotationSummary';
import { Choice } from './controls';
import { useEditor } from './EditorContext';
import { imageLabel, markingLabel } from './labels';
import { issueMessage } from './typedText';

interface IncompleteViewProps {
  /** Leva à anotação (mostra a camada, seleciona a marcação e rola o painel até ela). */
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
}

/**
 * Janela Incompletas (B5): as pendências do projeto agrupadas por imagem, cada uma com
 * a marcação, a camada e os motivos. Escolher uma leva à anotação. "Só camadas
 * visíveis" restringe a lista às camadas que o canvas mostra.
 */
export function IncompleteView({ onGoToAnnotation }: IncompleteViewProps) {
  const { store, ui, derived } = useEditor();
  const project = store.committed.value;
  const visibleOnly = ui.incompleteVisibleOnly.value;
  const list = derived.incompleteList.value;
  if (!project) return null;

  return (
    <div class="list-view">
      <div class="list-filters">
        <Choice
          checked={visibleOnly}
          label={t('incomplete.visibleOnly')}
          onChange={(e) => (ui.incompleteVisibleOnly.value = e.currentTarget.checked)}
        />
      </div>

      {list.length === 0 ? (
        <p class="muted list-message">
          {t(visibleOnly ? 'incomplete.emptyVisible' : 'incomplete.empty')}
        </p>
      ) : (
        <div class="list-scroll">
          <table class="list-table" aria-label={t('incomplete.title')}>
            <thead>
              <tr>
                <th scope="col">{t('list.col.marking')}</th>
                <th scope="col">{t('list.col.layer')}</th>
                <th scope="col">{t('list.col.annotation')}</th>
                <th scope="col">{t('incomplete.col.reasons')}</th>
              </tr>
            </thead>
            {list.map(({ image, items }) => (
              <tbody key={image.id}>
                <tr class="list-image-row">
                  <th scope="colgroup" colSpan={4}>
                    {imageLabel(image)}
                  </th>
                </tr>
                {items.map(({ annotation, path, layer, issues }) => {
                  const label = path.map(markingLabel).join(t('marking.pathSeparator'));
                  return (
                    <tr
                      key={annotation.id}
                      class="list-row list-row-first"
                      onClick={() => onGoToAnnotation(annotation)}
                    >
                      <td
                        class="list-cell list-cell-marking"
                        data-label={t('list.col.marking')}
                      >
                        <button
                          type="button"
                          class="list-marking"
                          aria-label={t('incomplete.go', { name: label })}
                        >
                          {label}
                        </button>
                      </td>
                      <td
                        class="list-cell list-cell-layer"
                        data-label={t('list.col.layer')}
                      >
                        <span
                          class="list-layer-tag"
                          style={{ '--layer-color': layer.color }}
                        >
                          <span class="layer-dot" aria-hidden="true" />
                          <span class="list-layer-name">{layer.name}</span>
                        </span>
                      </td>
                      <td class="list-cell" data-label={t('list.col.annotation')}>
                        <AnnotationTitle
                          project={project}
                          annotation={annotation}
                          class="list-annotation-name"
                        />
                      </td>
                      <td class="list-cell" data-label={t('incomplete.col.reasons')}>
                        <ul class="incomplete-reasons">
                          {issues.map((issue, i) => (
                            <li key={i}>{issueMessage(project, annotation, issue)}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
