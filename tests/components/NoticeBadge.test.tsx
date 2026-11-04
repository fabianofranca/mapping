import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpecNoticeKind } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { NoticeBadge, TypeNoticeBadge } from '../../src/ui/NoticeBadge';
import { noticeSpec } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const KINDS: readonly [SpecNoticeKind, string, string][] = [
  ['removed', 'Removido', 'blocked'],
  ['deprecated', 'Obsoleto', 'warning'],
  ['diverges', 'Diverge', 'compare'],
  ['pending', 'Pendente', 'info'],
];

describe('NoticeBadge', () => {
  it.each(KINDS)('%s: rótulo, classe, dica e nome acessível', (kind, label) => {
    render(<NoticeBadge notice={{ kind, message: 'a mensagem' }} />);
    const badge = screen.getByRole('img', { name: `Aviso ${label}: a mensagem` });
    expect(badge.classList.contains('notice-badge')).toBe(true);
    expect(badge.classList.contains(`notice-${kind}`)).toBe(true);
    expect(badge.textContent).toContain(label);
    expect(badge.querySelector('svg.icon')).not.toBeNull();
    expect(document.querySelector('[data-tooltip]')?.textContent).toBe('a mensagem');
  });

  it('em inglês usa o rótulo em inglês', () => {
    locale.value = 'en-US';
    render(<NoticeBadge notice={{ kind: 'removed', message: 'gone' }} />);
    expect(screen.getByRole('img', { name: 'Notice Removed: gone' })).toBeTruthy();
  });

  it('o ícone de cada kind é distinto', () => {
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

  it('mostra a maior gravidade entre o tipo, os campos e as colunas, e lista todos na dica', () => {
    const alert = types().find((x) => x.id === 'alert');
    if (!alert) throw new Error('sem alert');
    render(<TypeNoticeBadge type={alert} />);
    // deprecated (campo) e diverges (coluna) vencem o pending do tipo; empate: deprecated.
    const badge = screen.getByRole('img', { name: /^Aviso Obsoleto: Use variant\./ });
    expect(badge.textContent).toContain(t('notice.kind.deprecated'));
    const tip = document.querySelector('[data-tooltip]')?.textContent ?? '';
    expect(tip).toContain('Use variant.');
    expect(tip).toContain('Nome diferente no contrato.');
    expect(tip).toContain('O contrato aceita avatarVariant');
  });

  it('não renderiza nada num tipo sem aviso', () => {
    const plain = types().find((x) => x.id === 'plain');
    if (!plain) throw new Error('sem plain');
    const { container } = render(<TypeNoticeBadge type={plain} />);
    expect(container.innerHTML).toBe('');
    expect(within(container as HTMLElement).queryByRole('img')).toBeNull();
  });
});
