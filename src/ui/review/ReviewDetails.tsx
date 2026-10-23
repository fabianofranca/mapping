import { useLayoutEffect, useMemo } from 'preact/hooks';
import { t } from '../../i18n';
import { proposalIndex, type ReviewTarget } from '../../model';
import { expandSections } from '../../store/ui';
import { locale } from '../../store/settings';
import { DetailsIdentity } from '../DetailsIdentity';
import { useEditor } from '../EditorContext';
import { createOpenMark, OpenMarkContext } from './ChangeMark';
import { targetName } from './changeText';
import { formatFullDate, joinParts } from './format';
import { ImagesSection, OtherChangesSection } from './OtherChanges';
import { IdentityFlags, ReviewHeader } from './ReviewHeader';
import { useReviewNames } from './useReview';

// Detalhes na revisão sem painel normal (HANDOFF-REVIEW-DETAILS 5.6, fase 9.6): a proposta
// (identidade, cabeçalho com Aceitar tudo / Rejeitar tudo, "Outras mudanças" do grupo
// Projeto e "Imagens" com Abrir), o grupo Projeto (o mesmo painel, só com "Outras
// mudanças") e as mudanças sem item (camadas, especializações, repositórios). Também o
// estado vazio e o que um item mostraria se o painel normal não o achasse. Imagem e item
// têm o painel normal, em `ReviewPanel`.

/** O nível que o cabeçalho decide e as mudanças que a seção "Outras mudanças" lista. */
function plan(
  target: ReviewTarget,
  imageId: string | null | undefined,
  markingId: string | null | undefined,
) {
  const project: ReviewTarget = { level: 'project', id: null };
  if (target.level === 'proposal') {
    return { header: target, others: project, images: true };
  }
  if (target.level === 'project')
    return { header: target, others: project, images: false };
  if (target.level === 'canvas') return { header: target, others: target, images: false };
  // Uma mudança do grupo Projeto (sem imagem nem marcação) mostra o painel do grupo.
  if (target.level === 'change' && imageId === null && markingId === null) {
    return { header: project, others: project, images: false };
  }
  return { header: target, others: target, images: false };
}

/** Um nível da revisão sem painel normal. */
export function ReviewLevelPanel({ target }: { readonly target: ReviewTarget }) {
  const { review, ui } = useEditor();
  const names = useReviewNames();
  const openMark = useMemo(createOpenMark, []);
  const d = review.derived;
  const tree = d.tree.value;
  const p = d.proposal.value;
  const change =
    target.level === 'change' && target.id !== null && p
      ? (proposalIndex(p).changes.get(target.id) ?? null)
      : null;
  const targetId = change?.id ?? null;

  // A mudança selecionada abre "Outras mudanças" e é levada à vista.
  useLayoutEffect(() => {
    if (targetId !== null) expandSections(ui, [{ kind: 'others' }]);
  }, [targetId, ui]);

  if (!names || !tree || !p) return null;
  const { header, others, images } = plan(target, change?.imageId, change?.markingId);
  const ids = tree.changeIdsOf(others);
  const whole = null;

  let identity;
  if (header.level === 'proposal') {
    identity = (
      <DetailsIdentity
        icon="proposal"
        name={p.title}
        sub={joinParts([p.origin, p.author, formatFullDate(p.createdAt, locale.value)])}
        id={p.id}
        flags={<IdentityFlags target={header} whole={whole} />}
      />
    );
  } else {
    identity = (
      <DetailsIdentity
        icon={header.level === 'project' ? 'settings' : 'marking'}
        name={targetName(names, header)}
        sub={t(
          header.level === 'project'
            ? 'review.panel.projectSub'
            : header.level === 'canvas'
              ? 'review.panel.canvasSub'
              : 'review.panel.levelSub',
        )}
        flags={<IdentityFlags target={header} whole={whole} />}
      />
    );
  }

  return (
    <div class="review-details review-details-panel">
      <OpenMarkContext.Provider value={openMark}>
        <div class="review-panel">
          <div class="panel-details">
            {identity}
            {header.level === 'proposal' && p.description && (
              <p class="review-description">{p.description}</p>
            )}
            <ReviewHeader target={header} whole={whole} />
            <OtherChangesSection ids={ids} />
            {images && <ImagesSection />}
          </div>
        </div>
      </OpenMarkContext.Provider>
    </div>
  );
}

/** Detalhes na revisão sem painel normal: o estado vazio ou o painel do nível. */
export function ReviewDetails() {
  const { review } = useEditor();
  const target = review.selected.value;
  if (!review.derived.tree.value || !review.derived.proposal.value) return null;
  if (!target) {
    return (
      <div class="review-details review-details-empty">
        <p class="muted">{t('review.details.empty')}</p>
      </div>
    );
  }
  return <ReviewLevelPanel target={target} />;
}
