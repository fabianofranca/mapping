import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setLocale } from '../../src/store/settings';
import { proposalErrorMessage, proposalNoticeMessage } from '../../src/ui/labels';

// Texts of the "Revised" mark (stage #644, CP3).

describe('review texts', () => {
  it('the `revised` refusal has its own message in both languages', () => {
    setLocale('pt-BR');
    expect(proposalErrorMessage('revised')).toBe(
      'O agente revisou esta proposta enquanto você olhava. Confira antes de decidir.',
    );
    setLocale('en-US');
    expect(proposalErrorMessage('revised')).not.toBe(proposalErrorMessage('stale'));
    expect(proposalErrorMessage('revised')).toMatch(/revised/i);
    setLocale('pt-BR');
  });

  it('the `revised` notice and the text with counts', () => {
    setLocale('pt-BR');
    expect(
      proposalNoticeMessage({ kind: 'revised', id: 'P1', title: 'X', at: 'A' }),
    ).toContain('X');
    expect(
      t('review.revisedNotice.text', { title: 'X', parts: '1 trocada(s), 2 nova(s)' }),
    ).toBe('O agente revisou X: 1 trocada(s), 2 nova(s).');
  });
});
