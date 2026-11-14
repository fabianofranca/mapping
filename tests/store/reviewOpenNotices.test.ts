import { afterEach, beforeEach, expect, it } from 'vitest';
import type { OpenProject } from '../../src/app/controller';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { openHarness, richScenario, writeOutside } from './proposalHarness';

// Opening a proposal's review removes all of its notices from the queue (new, revised or
// changed outside): the review already shows the badge and the "Revised by the agent" header.

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

it('review.open clears the notice of the open proposal', async () => {
  const { proposal } = richScenario();
  const { session, root } = await openHarness({ proposals: [proposal] });
  const editor = createEditorContextValue({ session } as unknown as OpenProject);
  writeOutside(root, { ...proposal, title: 'Other title', revision: 5 });
  await session.proposals.scan();
  expect(session.proposals.notices.value.map((n) => n.kind)).toEqual(['changed']);
  expect(editor.review.open('P1').ok).toBe(true);
  expect(session.proposals.notices.value).toEqual([]);
  editor.review.dispose();
});
