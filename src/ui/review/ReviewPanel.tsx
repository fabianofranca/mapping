import { signal, type Signal } from '@preact/signals';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import {
  projectIndex,
  proposalIndex,
  type Project,
  type ReviewTarget,
} from '../../model';
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
import { ReviewDetails } from './ReviewDetails';
import {
  isChangeLayerHidden,
  reviewExtension,
  sectionsFor,
  sectionsForChange,
} from './reviewExtension';

// Detalhes na revisão (fases 9.5 e 9.6, HANDOFF-REVIEW-DETAILS 5.1): imagem e item mostram
// o painel normal (`MarkingPanel`/`SelectionPanel` com as anotações), somente leitura, sobre
// o projeto à vista (`review.derived.shownProject`), com um marcador em cada campo alterado
// e o cabeçalho de decisão logo abaixo da identidade, pelo ponto de extensão dos Detalhes.
// A proposta, o grupo Projeto e as mudanças sem item têm o painel deles (`ReviewDetails`).
// A mudança selecionada na janela Propostas abre o que a esconde, rola até o campo e o
// destaca; um clique ou Enter na lista leva o foco ao marcador e abre o popover.

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

/** Detalhes na revisão: escolhe entre o painel do item e o painel do nível. */
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

  // Selecionar outra mudança do mesmo item (focar um marcador, as setas da janela Propostas)
  // não pode refazer o painel inteiro: o item só é "outro" se mudou o que o painel mostra, e
  // o elemento do painel só é refeito com ele.
  const last = useRef<ShownItem | null>(null);
  const same =
    item !== null &&
    last.current !== null &&
    last.current.kind === item.kind &&
    last.current.id === item.id &&
    last.current.project === item.project &&
    last.current.away === item.away;
  const stable = same ? last.current : item;
  last.current = stable;
  const panel = useMemo(
    () =>
      stable ? (
        <ReviewItemPanel
          key={`${stable.kind}:${stable.id}`}
          item={stable}
          onGoToAnnotation={onGoToAnnotation}
          onSelectMarking={onSelectMarking}
        />
      ) : null,
    [stable, onGoToAnnotation, onSelectMarking],
  );

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
      {panel ?? <ReviewDetails />}
    </div>
  );
}

/**
 * Segue a mudança selecionada na janela Propostas (HANDOFF-REVIEW-DETAILS 6): abre o que a
 * esconde (a seção, a camada, a anotação e, numa camada escondida, o "Mostrar aqui"), deixa
 * a anotação à vista além do "mostrar mais". Rolar até o marcador e levar o foco a ele é do
 * próprio marcador (`ChangeMark`), no commit que o desenha. É um componente à parte para que
 * mudar a seleção (ou focar um marcador) refaça só ele, não o painel.
 */
function FollowTarget({
  item,
  reveal,
  onReveal,
}: {
  readonly item: ShownItem;
  readonly reveal: Signal<string | null>;
  readonly onReveal: (revealed: boolean) => void;
}) {
  const { review, ui, store, derived } = useEditor();
  const { kind, id, project } = item;
  const selected = review.selected.value;
  const targetId = selected?.level === 'change' ? selected.id : null;
  const proposal = review.derived.proposal.peek();
  const change =
    targetId !== null && proposal
      ? (proposalIndex(proposal).changes.get(targetId) ?? null)
      : null;
  const current = store.committed.peek();
  const hidden = ui.hiddenLayers.peek();
  const activeLayerId = derived.activeLayerId.peek();
  useLayoutEffect(() => {
    reveal.value = change?.entity === 'annotation' ? change.entityId : null;
    if (!current || !change) return;
    const args = { kind, id, project, current };
    expandSections(ui, sectionsForChange(change, args));
    if (isChangeLayerHidden(change, { ...args, hiddenLayers: hidden, activeLayerId })) {
      onReveal(true);
    }
    // Só ao mudar a mudança selecionada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  return null;
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
  // A anotação da mudança selecionada, que o "mostrar mais" não pode deixar de fora.
  const reveal = useMemo(() => signal<string | null>(null), []);
  const { kind, id, project } = item;
  const level = kind === 'marking' ? 'item' : 'image';
  const hasNode = tree?.nodes.has(`${level}:${id}`) === true;

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
            proposal: d.proposal,
            hasNode,
            reveal,
            full: () => d.fullPreview.value,
          })
        : null,
    [
      kind,
      id,
      project,
      current,
      index,
      view,
      hidden,
      activeLayerId,
      revealed,
      review,
      d.proposal,
      d.fullPreview,
      hasNode,
      reveal,
    ],
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

  return (
    <div class="review-details review-details-panel">
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
                onDelete={noop}
                onSelectMarking={onSelectMarking}
                onGoToAnnotation={onGoToAnnotation}
              />
            ) : (
              <SelectionPanel
                image={image}
                project={project}
                display={
                  image?.file && sameFile
                    ? display.images.value.get(image.file)
                    : undefined
                }
                readOnly
                busy={false}
                onReplace={noop}
                onDelete={noop}
              />
            )}
          </div>
          <FollowTarget item={item} reveal={reveal} onReveal={setRevealed} />
        </OpenMarkContext.Provider>
      </DetailsExtensionContext.Provider>
    </div>
  );
}

/** Ações de edição que o painel somente leitura não usa. */
const noop = () => undefined;
