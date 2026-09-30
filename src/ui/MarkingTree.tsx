import { t } from '../i18n';
import { childrenIndex, type Marking, type Project } from '../model';
import type { Selection } from '../store/ui';
import { markingLabel } from './labels';

interface MarkingTreeProps {
  readonly project: Project;
  readonly selection: Selection;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/** Árvore Imagem → marcações aninhadas. Tocar num item o seleciona. */
export function MarkingTree({ project, selection, onSelect }: MarkingTreeProps) {
  if (project.images.length === 0) return <p class="muted">{t('panel.treeEmpty')}</p>;
  const index = childrenIndex(project.markings);
  const isSelected = (kind: 'image' | 'marking', id: string) =>
    selection?.kind === kind && selection.id === id;

  const branch = (markings: readonly Marking[], depth: number) =>
    markings.length > 0 && (
      <ul>
        {markings.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              class="tree-item"
              style={{ '--depth': depth }}
              aria-current={isSelected('marking', m.id) || undefined}
              onClick={() => onSelect({ kind: 'marking', id: m.id })}
            >
              {m.needsReview && (
                <span class="tree-warning" title={t('marking.needsReview')}>
                  ⚠
                </span>
              )}
              <span class={m.name === null ? 'tree-label muted' : 'tree-label'}>
                {markingLabel(m)}
              </span>
            </button>
            {branch(index.get(m.id) ?? [], depth + 1)}
          </li>
        ))}
      </ul>
    );

  return (
    <ul class="tree" aria-label={t('panel.treeTitle')}>
      {project.images.map((image) => (
        <li key={image.id}>
          <button
            type="button"
            class="tree-item tree-image"
            style={{ '--depth': 0 }}
            aria-current={isSelected('image', image.id) || undefined}
            onClick={() => onSelect({ kind: 'image', id: image.id })}
          >
            <span class="tree-label">{image.file}</span>
          </button>
          {branch(
            (index.get(null) ?? []).filter((m) => m.imageId === image.id),
            1,
          )}
        </li>
      ))}
    </ul>
  );
}
