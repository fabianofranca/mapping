import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { projectIndex, type LayerDot, type Marking, type Project } from '../model';
import { revealInTree, toggleTreeNode, treeKey, type Selection } from '../store/ui';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { imageLabel, markingLabel } from './labels';

interface MarkingTreeProps {
  readonly project: Project;
  readonly selection: Selection;
  readonly onSelect: (selection: NonNullable<Selection>) => void;
}

/**
 * Rola até a linha selecionada (e, com `focus`, põe o foco nela). Chamado depois de a
 * árvore desenhar de novo, porque abrir os ancestrais troca as linhas.
 */
export function scrollToSelected(root: HTMLElement | null, focus = false): void {
  const row = root?.querySelector<HTMLElement>('.tree-item[aria-current="true"]');
  if (!row) return;
  row.scrollIntoView?.({ block: 'nearest' });
  if (focus) row.focus();
}

/** Espera o desenho seguinte (a árvore se atualiza por signal) antes de mexer no DOM. */
export function afterPaint(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

/** Bolinhas das camadas visíveis que chegam à marcação; as herdadas ficam esmaecidas. */
function LayerDots({ dots }: { readonly dots: readonly LayerDot[] }) {
  return (
    <span class="tree-dots" aria-hidden="true">
      {dots.map(({ layer, inheritedOnly }) => (
        <span
          key={layer.id}
          class={inheritedOnly ? 'tree-dot tree-dot-inherited' : 'tree-dot'}
          style={{ '--layer-color': layer.color }}
          title={t(inheritedOnly ? 'tree.layerDotInherited' : 'tree.layerDot', {
            name: layer.name,
          })}
        />
      ))}
    </span>
  );
}

/**
 * Árvore Imagem → marcações aninhadas, com nós que recolhem e as bolinhas das camadas
 * na linha. Escolher um item o seleciona; quando a seleção muda por fora (canvas,
 * lista, breadcrumbs), a árvore abre os ancestrais e rola até a linha.
 */
export function MarkingTree({ project, selection, onSelect }: MarkingTreeProps) {
  const { ui, derived } = useEditor();
  const collapsed = ui.collapsedTree.value;
  const dots = derived.layerDots.value;
  const index = projectIndex(project).children;
  const isSelected = (kind: 'image' | 'marking', id: string) =>
    selection?.kind === kind && selection.id === id;

  const list = useRef<HTMLUListElement>(null);
  const latest = useRef({ project, selection });
  latest.current = { project, selection };
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : '';
  useEffect(() => {
    const { project: current, selection: selected } = latest.current;
    if (!selected) return;
    revealInTree(ui, current, selected);
    // Só quando a seleção muda: recolher um nó depois não puxa a rolagem de volta.
    afterPaint(() => scrollToSelected(list.current));
  }, [selectionKey, ui]);

  const row = (
    key: string,
    depth: number,
    expandable: boolean,
    name: string,
    current: boolean,
    item: ComponentChildren,
  ) => (
    <div
      class={current ? 'tree-row tree-row-current' : 'tree-row'}
      style={{ '--depth': depth }}
    >
      {expandable ? (
        <button
          type="button"
          class="tree-toggle"
          aria-expanded={!collapsed.has(key)}
          aria-label={t(collapsed.has(key) ? 'tree.expand' : 'tree.collapse', { name })}
          onClick={() => toggleTreeNode(ui, key)}
        >
          <Icon name={collapsed.has(key) ? 'chevronRight' : 'chevronDown'} />
        </button>
      ) : (
        <span class="tree-toggle tree-toggle-empty" aria-hidden="true" />
      )}
      {item}
    </div>
  );

  const branch = (markings: readonly Marking[], depth: number) =>
    markings.length > 0 && (
      <ul>
        {markings.map((m) => {
          const children = index.get(m.id) ?? [];
          const key = treeKey('marking', m.id);
          const current = isSelected('marking', m.id);
          return (
            <li key={m.id}>
              {row(
                key,
                depth,
                children.length > 0,
                markingLabel(m),
                current,
                <button
                  type="button"
                  class="tree-item"
                  aria-current={current || undefined}
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
                  <LayerDots dots={dots.get(m.id) ?? []} />
                </button>,
              )}
              {!collapsed.has(key) && branch(children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );

  if (project.images.length === 0) return <p class="muted">{t('panel.treeEmpty')}</p>;
  return (
    <ul class="tree" aria-label={t('panel.treeTitle')} ref={list}>
      {project.images.map((image) => {
        const key = treeKey('image', image.id);
        const roots = (index.get(null) ?? []).filter((m) => m.imageId === image.id);
        const current = isSelected('image', image.id);
        return (
          <li key={image.id}>
            {row(
              key,
              0,
              roots.length > 0,
              imageLabel(image),
              current,
              <button
                type="button"
                class="tree-item tree-image"
                aria-current={current || undefined}
                onClick={() => onSelect({ kind: 'image', id: image.id })}
              >
                <span class="tree-label">{imageLabel(image)}</span>
              </button>,
            )}
            {!collapsed.has(key) && branch(roots, 1)}
          </li>
        );
      })}
    </ul>
  );
}
