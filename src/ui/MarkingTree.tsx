import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { t } from '../i18n';
import {
  arrowsOf,
  containerLockStates,
  projectIndex,
  type LayerDot,
  type Arrow,
  type Marking,
  type Project,
  type ProjectContainer,
} from '../model';
import {
  isItemSelected,
  revealInTree,
  selectedItems,
  toggleSelectedItem,
  toggleTreeNode,
  treeKey,
  type Selection,
  type SelectionItem,
} from '../store/ui';
import { ItemMenu } from './CopyActions';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { arrowEndLabel, arrowShort, arrowText, imageLabel, markingLabel } from './labels';

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
  const row = root?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!row) return;
  row.scrollIntoView?.({ block: 'nearest' });
  if (focus) row.focus();
}

/** Espera o desenho seguinte (a árvore se atualiza por signal) antes de mexer no DOM. */
export function afterPaint(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

/** Bolinhas das camadas visíveis com anotação na marcação. */
export function LayerDots({ dots }: { readonly dots: readonly LayerDot[] }) {
  return (
    <span class="tree-dots" aria-hidden="true">
      {dots.map(({ layer }) => (
        <span
          key={layer.id}
          class="tree-dot"
          style={{ '--layer-color': layer.color }}
          title={t('tree.layerDot', { name: layer.name })}
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
  const { ui, derived, store, actions } = useEditor();
  const readOnly = store.locked.value;
  const locks = derived.markingLocks.value;
  const collapsed = ui.collapsedTree.value;
  const dots = derived.layerDots.value;
  const projectIdx = projectIndex(project);
  const index = projectIdx.children;
  const containerLocks = useMemo(() => containerLockStates(project), [project]);
  const isSelected = (kind: SelectionItem['kind'], id: string) =>
    selection?.kind === kind && selection.id === id;
  // Seleção múltipla: as outras linhas selecionadas (o primário tem o destaque de sempre).
  const items = selectedItems(ui);
  const isGrouped = (kind: SelectionItem['kind'], id: string) =>
    items.length > 1 && isItemSelected(items, { kind, id });
  /** Shift+clique acrescenta ou tira o item da seleção; o clique simples seleciona. */
  const pick = (e: MouseEvent, item: SelectionItem) => {
    if (e.shiftKey) toggleSelectedItem(ui, item);
    else onSelect(item);
  };

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

  /** Cadeado da linha: botão para a trava própria; esmaecido, sem ação, se vem do pai. */
  const lockControl = (
    name: string,
    locked: boolean,
    inherited: boolean,
    toggle: () => void,
  ) =>
    inherited ? (
      <span class="tree-lock tree-lock-inherited" title={t('lock.inherited')}>
        <Icon name="lock" />
        <span class="visually-hidden">{t('lock.inherited')}</span>
      </span>
    ) : (
      <button
        type="button"
        class={locked ? 'tree-lock tree-lock-on' : 'tree-lock'}
        aria-pressed={locked}
        aria-label={t('lock.treeLock', { name })}
        title={t(locked ? 'lock.treeUnlock' : 'lock.treeLock', { name })}
        disabled={readOnly}
        onClick={toggle}
      >
        <Icon name={locked ? 'lock' : 'unlock'} />
      </button>
    );

  const row = (
    key: string,
    depth: number,
    expandable: boolean,
    name: string,
    current: boolean,
    grouped: boolean,
    item: ComponentChildren,
    lock: ComponentChildren,
    menu: ComponentChildren,
  ) => (
    <div
      class={
        current
          ? 'tree-row tree-row-current'
          : grouped
            ? 'tree-row tree-row-selected'
            : 'tree-row'
      }
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
      {lock}
      {menu}
    </div>
  );

  /** Containers membros de uma marcação do canvas (os que têm a marcação como pai). */
  const membersOfMarking = (m: Marking): readonly ProjectContainer[] =>
    m.floating ? [] : (projectIdx.containersByParent.get(m.id) ?? []);

  /** Marcações da raiz de cada container, agrupadas uma vez por desenho. */
  const rootsByContainer = new Map<string | null, Marking[]>();
  for (const m of index.get(null) ?? []) {
    const list = rootsByContainer.get(m.containerId);
    if (list) list.push(m);
    else rootsByContainer.set(m.containerId, [m]);
  }

  const containerNode = (image: ProjectContainer, depth: number) => {
    const key = treeKey('image', image.id);
    const roots = rootsByContainer.get(image.id) ?? [];
    const current = isSelected('image', image.id);
    return (
      <li key={image.id}>
        {row(
          key,
          depth,
          roots.length > 0,
          imageLabel(image),
          current,
          isGrouped('image', image.id),
          <button
            type="button"
            class="tree-item tree-image"
            aria-current={current || undefined}
            onClick={(e) => pick(e, { kind: 'image', id: image.id })}
          >
            <span class="tree-label">{imageLabel(image)}</span>
          </button>,
          lockControl(
            imageLabel(image),
            image.locked,
            containerLocks.get(image.id) === 'inherited',
            () => actions.setImageLocked(image.id, !image.locked),
          ),
          <ItemMenu target={{ kind: 'i', id: image.id }} name={imageLabel(image)} />,
        )}
        {!collapsed.has(key) && branch(roots, depth + 1)}
      </li>
    );
  };

  /** A seta sob a marcação de origem: "→ destino" (ou o nome dela), com o cadeado própria. */
  const arrowNode = (arrow: Arrow, depth: number) => {
    const current = isSelected('arrow', arrow.id);
    const to = arrowEndLabel(projectIdx.markings.get(arrow.to));
    const text = arrowShort(project, arrow);
    return (
      <li key={arrow.id}>
        {row(
          treeKey('arrow', arrow.id),
          depth,
          false,
          arrowText(project, arrow),
          current,
          isGrouped('arrow', arrow.id),
          <button
            type="button"
            class="tree-item tree-arrow"
            aria-current={current || undefined}
            aria-label={t('arrow.treeItem', { name: to })}
            title={arrowText(project, arrow)}
            onClick={(e) => pick(e, { kind: 'arrow', id: arrow.id })}
          >
            <Icon name="arrow" />
            <span class={arrow.name === null ? 'tree-label muted' : 'tree-label'}>
              {text}
            </span>
            <LayerDots dots={dots.get(arrow.id) ?? []} />
          </button>,
          lockControl(t('arrow.treeItem', { name: to }), arrow.locked, false, () =>
            actions.setArrowLocked(arrow.id, !arrow.locked),
          ),
          null,
        )}
      </li>
    );
  };

  const branch = (markings: readonly Marking[], depth: number): ComponentChildren =>
    markings.length > 0 && (
      <ul>
        {markings.map((m) => {
          // Filhas da marcação e, na marcação do canvas, os containers que ela contém.
          const children = index.get(m.id) ?? [];
          const members = membersOfMarking(m);
          const arrows = arrowsOf(project, m.id).outgoing;
          const key = treeKey('marking', m.id);
          const current = isSelected('marking', m.id);
          return (
            <li key={m.id}>
              {row(
                key,
                depth,
                children.length > 0 || members.length > 0 || arrows.length > 0,
                markingLabel(m),
                current,
                isGrouped('marking', m.id),
                <button
                  type="button"
                  class="tree-item"
                  aria-current={current || undefined}
                  onClick={(e) => pick(e, { kind: 'marking', id: m.id })}
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
                lockControl(
                  markingLabel(m),
                  m.locked,
                  locks.get(m.id) === 'inherited',
                  () => actions.setMarkingLocked(m.id, !m.locked),
                ),
                <ItemMenu target={{ kind: 'm', id: m.id }} name={markingLabel(m)} />,
              )}
              {!collapsed.has(key) && (
                <>
                  {branch(children, depth + 1)}
                  {members.length > 0 && (
                    <ul>{members.map((image) => containerNode(image, depth + 1))}</ul>
                  )}
                  {arrows.length > 0 && (
                    <ul>{arrows.map((arrow) => arrowNode(arrow, depth + 1))}</ul>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );

  const canvasRoots = rootsByContainer.get(null) ?? [];
  const topContainers = projectIdx.containersByParent.get(null) ?? [];
  const canvasKey = treeKey('canvas', '');
  const canvasName = t('canvas.name');

  if (project.containers.length === 0 && canvasRoots.length === 0) {
    return <p class="muted">{t('panel.treeEmpty')}</p>;
  }
  return (
    <ul class="tree" aria-label={t('panel.treeTitle')} ref={list}>
      {canvasRoots.length > 0 && (
        <li key="canvas">
          {row(
            canvasKey,
            0,
            true,
            canvasName,
            false,
            false,
            <button
              type="button"
              class="tree-item tree-canvas"
              onClick={() => toggleTreeNode(ui, canvasKey)}
            >
              <span class="tree-label">{canvasName}</span>
            </button>,
            null,
            null,
          )}
          {!collapsed.has(canvasKey) && branch(canvasRoots, 1)}
        </li>
      )}
      {topContainers.map((image) => containerNode(image, 0))}
    </ul>
  );
}
