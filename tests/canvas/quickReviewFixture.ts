import { computed, signal, type Signal } from '@preact/signals';
import { previewProject, quickReviewOf, type Proposal } from '../../src/model';
import type { ProjectStore } from '../../src/store/history';
import type { QuickReviewState, QuickReviewView } from '../../src/store/quickReview';

/**
 * A `QuickReviewState` over `store`: shows `proposal` as a quick review, recomputed from the
 * committed project like the real one (an edit gives a new view). `enabled.value = false` turns
 * it off (`current` null), like a full review opening.
 */
export function fakeQuick(
  store: ProjectStore,
  proposal: Proposal,
): { quick: QuickReviewState; enabled: Signal<boolean> } {
  const enabled = signal(true);
  const current = computed((): QuickReviewView | null => {
    const committed = store.committed.value;
    if (!enabled.value || !committed) return null;
    const eligibility = quickReviewOf(proposal, committed);
    if (!eligibility.ok) return null;
    return {
      proposal,
      threadId: 'T1',
      spaceId: eligibility.spaceId,
      created: eligibility.created,
      changed: eligibility.changed,
      revised: 0,
      preview: previewProject(committed, proposal).project,
      blocked: null,
    };
  });
  const quick: QuickReviewState = {
    current,
    accepting: signal(false),
    accept: () => Promise.resolve(null),
    dispose: () => undefined,
  };
  return { quick, enabled };
}
