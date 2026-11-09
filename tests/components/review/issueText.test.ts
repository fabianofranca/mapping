import { beforeEach, expect, it } from 'vitest';
import { fixtureProject, fixtureProposal } from '../../e2e/proposalFixture';
import { locale } from '../../../src/store/settings';
import { issueText } from '../../../src/ui/review/ReviewHeader';

beforeEach(() => {
  locale.value = 'pt-BR';
});

it('missing-image: texto legível, sem o código interno', () => {
  const current = fixtureProject();
  const names = { current, preview: null, proposal: fixtureProposal(current) };
  const text = issueText(names, {
    code: 'missing-image',
    id: 'M1',
    changeIds: [],
    related: [],
  });
  expect(text).toBe('Cabeçalho depende de uma imagem que não está no projeto.');
});
