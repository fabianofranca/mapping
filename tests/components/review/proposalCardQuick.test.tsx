import { act, cleanup, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import { addAnnotation, createMarking, type Proposal } from '../../../src/model';
import { dismissQuick } from '../../../src/store/quickReview';
import { locale } from '../../../src/store/settings';
import { showToolWindow } from '../../../src/store/toolWindows';
import { ProposalCard } from '../../../src/ui/comments/ProposalCard';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { AGENT, HUMAN } from '../../model/threadFixtures';
import { appendMessage, openThread } from '../../../src/model';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The proposal card of a quick review proposal (stage #1932, QR3, decision 20).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(cleanup);

const base = sampleProject();

function creation(): Proposal {
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 50 },
    name: 'Button',
  });
  after = addAnnotation(after, { id: 'A9', markingId: 'M9', layerId: 'L1' });
  return { ...propose(base, after, { id: 'P1' }), title: 'Add a button' };
}

async function open() {
  const h = await openReviewHarness({ proposals: [creation()] });
  const thread = appendMessage(
    openThread({
      id: 'T1',
      anchor: { kind: 'point', containerId: 'I1', x: 1, y: 1 },
      author: HUMAN,
      text: 'a button',
      at: '2026-11-19T10:00:00.000Z',
      messageId: 'm0',
    }),
    {
      id: 'm1',
      author: AGENT,
      at: '2026-11-19T10:01:00.000Z',
      text: 'here',
      proposal: 'P1',
    },
  );
  await h.session.threads.create(thread);
  act(() => {
    h.ui.conversation.value = { kind: 'thread', id: 'T1' };
    showToolWindow('conversation');
  });
  renderInEditor(h, <ProposalCard proposalId="P1" threadId="T1" />);
  return h;
}

describe('ProposalCard of a quick review proposal', () => {
  it('says it is on the canvas while the ghost shows, and keeps Review', async () => {
    await open();
    expect(screen.getByText(t('thread.proposal.onCanvas'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review: Add a button' })).toBeTruthy();
  });

  it('after Reject says so and offers Show on the canvas, which brings the ghost back', async () => {
    const h = await open();
    act(() => dismissQuick(h.ui, 'P1', 0));
    expect(screen.getByText(t('thread.proposal.rejectedOnCanvas'))).toBeTruthy();
    expect(screen.queryByText(t('thread.proposal.onCanvas'))).toBeNull();
    expect(screen.getByRole('button', { name: 'Review: Add a button' })).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show on the canvas: Add a button' }),
    );
    expect(h.ui.quickDismissed.value.has('P1')).toBe(false);
    expect(screen.getByText(t('thread.proposal.onCanvas'))).toBeTruthy();
  });
});
