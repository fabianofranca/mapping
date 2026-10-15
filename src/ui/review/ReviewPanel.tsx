import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { projectIndex, type Project, type ReviewTarget } from '../../model';
import type { ReviewView } from '../../store/derived';
import {
  collapseSections,
  expandSections,
  resolveSelection,
  type AnnotationLocation,
  type Selection,
} from '../../store/ui';
import { Button } from '../controls';
import { DetailsExtensionContext } from '../DetailsExtension';
import { useEditor } from '../EditorContext';
import { MarkingPanel } from '../MarkingPanel';
import { Notice } from '../Notice';
import { SelectionPanel } from '../SelectionPanel';
import { createOpenMark, OpenMarkContext } from './ChangeMark';
import { ReviewDetails, ReviewLevel } from './ReviewDetails';
import { otherChangeIds, reviewExtension, sectionsFor } from './reviewExtension';

// Detalhes na revisão (fase 9.5, HANDOFF-REVIEW-DETAILS 5.1): imagem e item mostram o
// painel normal (`MarkingPanel`/`SelectionPanel` com as anotações), somente leitura, sobre
// o projeto à vista (`review.derived.shownProject`), com um marcador em cada campo alterado
// pelo ponto de extensão dos Detalhes. Acima, o bloco de decisão do nível de hoje (decisão,
// avisos, notas) até a 9.6 levar a decisão para o cabeçalho e os popovers. A proposta, o
// grupo Projeto e as mudanças sem item continuam no `ReviewDetails` (cartões).

/** O item que o painel mostra e de qual projeto ele vem. */
interface ShownItem {
  readonly kind: 'marking' | 'image';
  readonly id: string;
  readonly project: Project;
  /**
   * Por que o item vem de outro projeto: não existe na visão Proposto (removido), ainda
   * não existe no atual (criado) ou a criação foi rejeitada (nem na prévia).
   */
  readonly away: 'proposed' | 'current' | 'rejected' | null;
}

const has = (project: Project | null, sel: NonNullable<Selection>): boolean =>
  project !== null &&
  (sel.kind === 'image'
    ? projectIndex(project).images.has(sel.id)
    : projectIndex(project).markings.has(sel.id));

/**
 * Onde o item está: no projeto à vista; senão, na visão Proposto, no atual (removido) e,
 * na visão Atual, na prévia (criado); por último, no "como ficaria" sem as decisões (uma
 * criação rejeitada). `null` se não está em lugar nenhum (o ReviewDetails mostra a mudança).
 */
function shownItem(
  sel: NonNullable<Selection>,
  view: ReviewView,
  shown: Project | null,
  other: () => Project | null,
  full: () => Project | null,
): ShownItem | null {
  const at = (project: Project | null, away: ShownItem['away']): ShownItem | null =>
    project && has(project, sel) ? { ...sel, project, away } : null;
  return (
    at(shown, null) ??
    at(other(), view === 'proposed' ? 'proposed' : 'current') ??
    at(full(), 'rejected')
  );
}

/** O item de um nível da revisão (imagem, item, ou o item de uma mudança). */
function itemOfTarget(
  target: ReviewTarget | null,
  changeItem: (id: string) => Selection,
): Selection {
  if (!target || target.id === null) return null;
  if (target.level === 'item') return { kind: 'marking', id: target.id };
  if (target.level === 'image') return { kind: 'image', id: target.id };
  if (target.level === 'change') return changeItem(target.id);
  return null;
}

interface ReviewPanelProps {
  readonly onGoToAnnotation: (annotation: AnnotationLocation) => void;
  readonly onSelectMarking: (markingId: string) => void;
}

/** Detalhes na revisão: escolhe entre o painel do item e os cartões do nível. */
export function ReviewPanel({ onGoToAnnotation, onSelectMarking }: ReviewPanelProps) {
  const { review, ui, store } = useEditor();
  const host = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const d = review.derived;
  const target = review.selected.value;
  const view = review.view.value;
  const shown = d.shownProject.value;
  const current = store.committed.value;
  const proposal = d.proposal.peek();
  const changeItem = (id: string): Selection => {
    const c = proposal?.changes.find((x) => x.id === id);
    if (c?.markingId) return { kind: 'marking', id: c.markingId };
    if (c?.imageId) return { kind: 'image', id: c.imageId };
    return null;
  };
  // Proposta e Projeto não têm painel normal; uma mudança sem item (camada,
  // especialização, repositório) também não.
  const levelOnly =
    target?.level === 'proposal' ||
    target?.level === 'project' ||
    (target?.level === 'change' && changeItem(target.id ?? '') === null);
  // A seleção do canvas acompanha o nível (`useReviewSync`) e também pode ser um item sem
  // mudanças, que o nível não segue: ela é quem diz o item.
  const sel = levelOnly ? null : (ui.selection.value ?? itemOfTarget(target, changeItem));
  const item = sel
    ? shownItem(
        sel,
        view,
        shown,
        () => (view === 'proposed' ? current : (d.preview.value?.project ?? null)),
        () => d.fullPreview.value,
      )
    : null;
  const itemKey = item ? `${item.kind}:${item.id}` : '';

  // Trocar de item desmonta o painel: se o foco estava nele (um marcador, o popover), fica
  // no contêiner, nunca no `body` (HANDOFF-REVIEW-DETAILS 12).
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (hadFocus.current && (active === null || active === document.body)) {
      host.current?.focus();
    }
  }, [itemKey]);

  return (
    <div
      class="review-host"
      ref={host}
      tabIndex={-1}
      onFocusIn={() => (hadFocus.current = true)}
      onFocusOut={(e) => {
        const next = e.relatedTarget;
        if (next instanceof Node && !host.current?.contains(next))
          hadFocus.current = false;
      }}
    >
      {item ? (
        <ReviewItemPanel
          key={itemKey}
          item={item}
          onGoToAnnotation={onGoToAnnotation}
          onSelectMarking={onSelectMarking}
        />
      ) : (
        <ReviewDetails />
      )}
    </div>
  );
}

function ReviewItemPanel({
  item,
  onGoToAnnotation,
  onSelectMarking,
}: ReviewPanelProps & { readonly item: ShownItem }) {
  const { review, ui, store, display, derived } = useEditor();
  const d = review.derived;
  const index = d.fieldIndex.value;
  const tree = d.tree.value;
  const current = store.committed.value;
  const view = review.view.value;
  const hidden = ui.hiddenLayers.value;
  const activeLayerId = derived.activeLayerId.value;
  // "Mostrar aqui" das camadas escondidas: só no painel, até trocar de item (decisão 4).
  const [revealed, setRevealed] = useState(false);
  const openMark = useMemo(createOpenMark, []);
  const { kind, id, project } = item;

  const ext = useMemo(
    () =>
      current
        ? reviewExtension({
            kind,
            id,
            project,
            current,
            index,
            view,
            hiddenLayers: hidden,
            activeLayerId,
            revealed,
            onReveal: setRevealed,
            onShowCurrent: () => review.setView('current'),
          })
        : null,
    [kind, id, project, current, index, view, hidden, activeLayerId, revealed, review],
  );

  // Ao mostrar o item, abrem as seções com mudanças (as outras ficam como a pessoa deixou).
  const proposalId = review.proposalId.value;
  useLayoutEffect(() => {
    if (!current) return;
    const { open, close } = sectionsFor({ kind, id, project, current, index });
    expandSections(ui, open);
    collapseSections(ui, close);
    // Só ao chegar ao item (ou trocar de proposta): depois, quem abre e fecha é a pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, kind, id]);

  if (!current || !ext) return null;

  const target = review.selected.value;
  const level = kind === 'marking' ? 'item' : 'image';
  const proposal = d.proposal.peek();
  const belongs = (t: ReviewTarget): boolean => {
    if (t.level === level) return t.id === id;
    if (t.level !== 'change') return false;
    const c = proposal?.changes.find((x) => x.id === t.id);
    return kind === 'marking'
      ? c?.markingId === id
      : c?.imageId === id && c.markingId === null;
  };
  const header: ReviewTarget | null =
    target && belongs(target)
      ? target
      : tree?.nodes.has(`${level}:${id}`)
        ? { level, id }
        : null;

  const resolved = resolveSelection(project, { kind, id } as NonNullable<Selection>);
  const away =
    item.away === 'proposed' ? (
      <Notice
        tone="info"
        size="sm"
        actions={
          <Button size="sm" onClick={() => review.setView('current')}>
            {t('review.panel.seeCurrent')}
          </Button>
        }
      >
        <span>{t('review.panel.notInView.proposed')}</span>
      </Notice>
    ) : item.away === 'current' ? (
      <Notice
        tone="info"
        size="sm"
        actions={
          <Button size="sm" onClick={() => review.setView('proposed')}>
            {t('review.panel.seeProposed')}
          </Button>
        }
      >
        <span>{t('review.panel.notInView.current')}</span>
      </Notice>
    ) : item.away === 'rejected' ? (
      <Notice tone="info" size="sm">
        <span>{t('review.panel.rejectedCreation')}</span>
      </Notice>
    ) : null;

  const image = resolved?.kind === 'image' ? resolved.image : null;
  const sameFile =
    image !== null && projectIndex(current).images.get(image.id)?.file === image.file;
  const panel = (
    <DetailsExtensionContext.Provider value={ext}>
      <OpenMarkContext.Provider value={openMark}>
        {away}
        <div class="review-panel">
          {resolved?.kind === 'marking' ? (
            <MarkingPanel
              project={project}
              marking={resolved.marking}
              image={resolved.image}
              readOnly
              onDelete={() => undefined}
              onSelectMarking={onSelectMarking}
              onGoToAnnotation={onGoToAnnotation}
            />
          ) : (
            <SelectionPanel
              image={image}
              project={project}
              display={
                image && sameFile ? display.images.value.get(image.file) : undefined
              }
              readOnly
              busy={false}
              onReplace={() => undefined}
              onDelete={() => undefined}
            />
          )}
        </div>
      </OpenMarkContext.Provider>
    </DetailsExtensionContext.Provider>
  );

  return header ? (
    <ReviewLevel
      target={header}
      panel={panel}
      otherIds={otherChangeIds(index, kind, id)}
    />
  ) : (
    <div class="review-details review-details-panel">{panel}</div>
  );
}
