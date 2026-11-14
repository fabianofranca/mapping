import { beforeEach, expect, it } from 'vitest';
import { fixtureProject, fixtureProposal } from '../../e2e/proposalFixture';
import { locale } from '../../../src/store/settings';
import { issueText } from '../../../src/ui/review/ReviewHeader';

beforeEach(() => {
  locale.value = 'en-US';
});

it('missing-image: readable text, without the internal code', () => {
  const current = fixtureProject();
  const names = { current, preview: null, proposal: fixtureProposal(current) };
  const text = issueText(names, {
    code: 'missing-image',
    id: 'M1',
    changeIds: [],
    related: [],
  });
  expect(text).toBe(// pt-BR kept: shared fixture data asserted by tests/e2e (marking name Cabeçalho from proposalFixture)
    'Cabeçalho depends on an image that is not in the project.');
});
