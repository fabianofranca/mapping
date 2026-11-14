import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpecNoticeKind } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { NoticeBadge, TypeNoticeBadge } from '../../src/ui/NoticeBadge';
import { noticeSpec } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const KINDS: readonly [SpecNoticeKind, string, string][] = [
  ['removed', 'Removed', 'blocked'],
  ['deprecated', 'Deprecated', 'warning'],
  ['diverges', 'Diverges', 'compare'],
  ['pending', 'Pending', 'info'],
];

describe('NoticeBadge', () => {
  it.each(KINDS)('%s: label, class, tip and accessible name', (kind, label) => {
    render(<NoticeBadge notice={{ kind, message: 'the message' }} />);
    const badge = screen.getByRole('img', { name: `Notice ${label}: the message` });
    expect(badge.classList.contains('notice-badge')).toBe(true);
    expect(badge.classList.contains(`notice-${kind}`)).toBe(true);
    expect(badge.textContent).toContain(label);
    expect(badge.querySelector('svg.icon')).not.toBeNull();
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('the message');
  });

  it('in pt-BR it uses the Portuguese label', () => {
    locale.value = 'pt-BR';
    render(<NoticeBadge notice={{ kind: 'removed', message: 'gone' }} />);
    // pt-BR kept: the object of the test is the Portuguese label of the badge
    expect(screen.getByRole('img', { name: 'Aviso Removido: gone' })).toBeTruthy();
  });

  it('the icon of each kind is distinct', () => {
    const paths = KINDS.map(([kind]) => {
      render(<NoticeBadge notice={{ kind, message: 'm' }} />);
      const d = [...document.querySelectorAll('svg.icon path')]
        .map((p) => p.getAttribute('d'))
        .join('|');
      cleanup();
      return d;
    });
    expect(new Set(paths).size).toBe(4);
  });
});

describe('TypeNoticeBadge', () => {
  const types = () => noticeSpec().layers[0]?.annotationTypes ?? [];

  it('shows the highest severity among the type, the fields and the columns, and lists all in the tip', () => {
    const alert = types().find((x) => x.id === 'alert');
    if (!alert) throw new Error('no alert');
    render(<TypeNoticeBadge type={alert} />);
    // deprecated (field) and diverges (column) beat the type's pending; tie: deprecated.
    const badge = screen.getByRole('img', { name: /^Notice Deprecated: Use variant\./ });
    expect(badge.textContent).toContain(t('notice.kind.deprecated'));
    const tip = document.querySelector('[data-tooltip]')?.textContent ?? '';
    expect(tip).toContain('Use variant.');
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (messages of noticeFixtures)
    expect(tip).toContain('Nome diferente no contrato.');
    expect(tip).toContain('O contrato aceita avatarVariant');
  });

  it('renders nothing on a type without a notice', () => {
    const plain = types().find((x) => x.id === 'plain');
    if (!plain) throw new Error('no plain');
    const { container } = render(<TypeNoticeBadge type={plain} />);
    expect(container.innerHTML).toBe('');
    expect(within(container as HTMLElement).queryByRole('img')).toBeNull();
  });
});
