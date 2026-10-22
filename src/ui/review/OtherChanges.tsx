import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { reviewKey, type Change, type ReviewTarget } from '../../model';
import { Button } from '../controls';
import { Section } from '../DetailsSection';
import { useEditor } from '../EditorContext';
import { ChangeKind } from './ChangeKind';
import { ChangeMark } from './ChangeMark';
import { markType } from './ChangePopover';
import { changeSummary, changeTitle, targetName } from './changeText';
import { DecisionCounts } from './ProposalRow';
import { useReviewNames, useReviewNavigate } from './useReview';

// "Outras mudanças" (HANDOFF-REVIEW-DETAILS 5.6, fase 9.6): o que não tem campo no painel
// normal (origem, trava, troca de imagem da marcação, posição da imagem, camadas,
// especializações e repositórios) numa linha com o tipo, o resumo e o mesmo marcador e
// popover dos campos. Substitui os cartões (`ChangeCard`) com uma forma só.

/** Linhas desenhadas de uma vez (uma importação grande pode ter centenas). */
const MAX_ROWS = 60;

export function OtherChangeRow({ change }: { readonly change: Change }) {
  const names = useReviewNames();
  if (!names) return null;
  const field = change.field ?? '';
  const type = markType({ change, field, part: false });
  return (
    <li class="other-change-row">
      <ChangeKind type={type} size="sm" />
      <span class="other-change-text">
        <span class="other-change-title">{changeTitle(names, change)}</span>
        <span class="other-change-summary muted">{changeSummary(names, change)}</span>
      </span>
      <ChangeMark change={change} field={field} part={false} />
    </li>
  );
}

/** A seção "Outras mudanças" com uma linha por mudança de `ids`; `null` sem nenhuma. */
export function OtherChangesSection({ ids }: { readonly ids: readonly string[] }) {
  const { review } = useEditor();
  const names = useReviewNames();
  const [limit, setLimit] = useState(MAX_ROWS);
  if (!names || ids.length === 0) return null;
  const byId = new Map(names.proposal.changes.map((c) => [c.id, c]));
  const changes = ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
  // A mudança selecionada na janela Propostas nunca fica além do "mostrar mais".
  const selected = review.selected.value;
  const wanted =
    selected?.level === 'change' ? changes.findIndex((c) => c.id === selected.id) : -1;
  const shown = changes.slice(0, Math.max(limit, wanted + 1));
  const rest = changes.length - shown.length;
  return (
    <Section
      section={{ kind: 'others' }}
      title={t('review.panel.otherChanges')}
      count={changes.length}
    >
      <ul class="other-changes">
        {shown.map((c) => (
          <OtherChangeRow key={c.id} change={c} />
        ))}
      </ul>
      {rest > 0 && (
        <Button size="sm" class="button-link" onClick={() => setLimit(limit + MAX_ROWS)}>
          {t('review.panel.showMoreChanges', { count: Math.min(rest, MAX_ROWS) })}
        </Button>
      )}
    </Section>
  );
}

/** A seção "Imagens" da proposta: uma linha por imagem com mudanças e **Abrir**. */
export function ImagesSection() {
  const { review } = useEditor();
  const names = useReviewNames();
  const navigate = useReviewNavigate();
  const d = review.derived;
  const tree = d.tree.value;
  if (!names || !tree) return null;
  // O grupo Canvas (marcações do canvas) é irmão dos containers e abre como eles.
  const images = tree.root.children.filter(
    (n) => n.level === 'image' || n.level === 'canvas',
  );
  if (images.length === 0) return null;
  const levels = d.levels.value;
  return (
    <Section
      section={{ kind: 'images' }}
      title={t('review.panel.images')}
      count={images.length}
    >
      <ul class="other-changes">
        {images.map((node) => {
          const canvas = node.level === 'canvas';
          const target: ReviewTarget = canvas
            ? { level: 'canvas', id: null }
            : { level: 'image', id: node.id };
          const summary = levels.get(reviewKey(target));
          const label = targetName(names, target);
          return (
            <li
              key={canvas ? 'canvas' : node.id}
              class="other-change-row"
              data-image={canvas ? 'canvas' : (node.id ?? '')}
            >
              <span class="other-change-text">
                <span class="other-change-title">{label}</span>
                {summary && (
                  <DecisionCounts
                    undecided={summary.undecided}
                    accepted={summary.accepted}
                    rejected={summary.rejected}
                  />
                )}
              </span>
              <Button
                size="sm"
                aria-label={t('review.panel.openNamed', { name: label })}
                onClick={() => navigate(target)}
              >
                {t('review.panel.open')}
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
