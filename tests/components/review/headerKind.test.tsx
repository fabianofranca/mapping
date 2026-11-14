import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameContainer, replaceContainer } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { showReviewPanel } from './reviewHarness';

// Bug 4.1: the container header said "Image changed" even when the proposal does not
// replace the image (file or dimensions).

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

describe('ReviewHeader › container label', () => {
  it('a proposal that only renames the container does not say "Image changed"', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameContainer(base, 'I2', 'New front'));
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decision' });
    expect(within(header).queryByText('Image changed')).toBeNull();
    expect(within(header).getByText('Container changed')).toBeTruthy();
  });

  it('a proposal that replaces the file still says "Image changed"', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/front-2.jpg',
      width: 2000,
      height: 2000,
    });
    await showReviewPanel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decision' });
    expect(within(header).getByText('Image changed')).toBeTruthy();
  });
});
