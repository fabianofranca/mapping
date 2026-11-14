import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameContainer, replaceContainer } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { showReviewPanel } from './reviewHarness';

// Bug 4.1: o cabeçalho do container dizia "Imagem alterada" mesmo quando a proposta não
// troca a imagem (arquivo ou dimensões).

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('ReviewHeader › rótulo do container', () => {
  it('proposta que só renomeia o container não diz "Imagem alterada"', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameContainer(base, 'I2', 'Frente nova'));
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decisão' });
    expect(within(header).queryByText('Imagem alterada')).toBeNull();
    expect(within(header).getByText('Container alterado')).toBeTruthy();
  });

  it('proposta que troca o arquivo continua dizendo "Imagem alterada"', async () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/frente-2.jpg',
      width: 2000,
      height: 2000,
    });
    await showReviewPanel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'image', id: 'I2' },
    );
    const header = screen.getByRole('region', { name: 'Decisão' });
    expect(within(header).getByText('Imagem alterada')).toBeTruthy();
  });
});
