import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_TYPES, type LevelState } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ChangeKind } from '../../../src/ui/review/ChangeKind';
import { DecisionControl } from '../../../src/ui/review/DecisionControl';
import { DecisionMark } from '../../../src/ui/review/DecisionMark';
import { Flag } from '../../../src/ui/review/Flag';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

// Componentes base da revisão (HANDOFF-PROPOSALS 2.1, passo 2 da seção 9): todos os
// estados, o nome acessível e o que cada um nunca faz (dizer o estado só pela cor).

describe('DecisionMark', () => {
  const states: readonly [LevelState, string][] = [
    ['undecided', 'Sem decisão'],
    ['accepted', 'Aceita'],
    ['rejected', 'Rejeitada'],
    ['partial', 'Parcial'],
  ];

  it.each(states)('%s: forma própria e nome acessível', (state, label) => {
    const { container } = render(<DecisionMark state={state} />);
    const mark = screen.getByRole('img', { name: label });
    expect(mark.getAttribute('title')).toBe(label);
    expect(mark.dataset.state).toBe(state);
    // A forma muda com o estado (não só a cor): tracejado, cheio com glifo, metade.
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('.decision-mark-dashed') !== null).toBe(
      state === 'undecided',
    );
    expect(svg?.querySelector('.decision-mark-glyph') !== null).toBe(
      state === 'accepted' || state === 'rejected',
    );
    expect(svg?.querySelector('.decision-mark-fill') !== null).toBe(
      state !== 'undecided',
    );
  });

  it('cada estado tem um desenho diferente', () => {
    const drawings = states.map(([state]) => {
      const { container } = render(<DecisionMark state={state} />);
      const html = container.querySelector('svg')?.innerHTML ?? '';
      cleanup();
      return html;
    });
    expect(new Set(drawings).size).toBe(states.length);
  });

  it('parcial com contagens diz quantas de cada', () => {
    render(
      <DecisionMark
        state="partial"
        counts={{ accepted: 15, rejected: 6, undecided: 17 }}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Parcial: 15 aceitas, 6 rejeitadas, 17 sem decisão',
      }),
    ).toBeTruthy();
  });

  it('decorativo fica fora da árvore de acessibilidade', () => {
    const { container } = render(<DecisionMark state="accepted" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('ChangeKind', () => {
  const labels = {
    created: 'Criada',
    removed: 'Removida',
    moved: 'Movida',
    changed: 'Alterada',
    replaced: 'Imagem trocada',
  } as const;

  it.each(CHANGE_TYPES)('%s: ícone neutro e nome do tipo', (type) => {
    const { container } = render(<ChangeKind type={type} />);
    const badge = screen.getByRole('img', { name: labels[type] });
    expect(badge.getAttribute('title')).toBe(labels[type]);
    expect(container.querySelector('svg')).toBeTruthy();
    // Neutro: nenhuma classe de decisão (verde/vermelho são de aceita e rejeitada).
    expect(badge.className).not.toMatch(/accept|reject|success|danger/);
  });

  it('versão compacta das linhas', () => {
    render(<ChangeKind type="moved" size="sm" />);
    expect(screen.getByRole('img', { name: 'Movida' }).className).toContain(
      'change-kind-sm',
    );
  });
});

describe('Flag', () => {
  it.each(['neutral', 'warn', 'danger', 'ok', 'new'] as const)('%s', (tone) => {
    const { container } = render(
      <Flag tone={tone} icon={tone === 'warn' ? 'warning' : undefined}>
        Texto
      </Flag>,
    );
    const flag = container.querySelector('.flag');
    expect(flag?.textContent).toBe('Texto');
    expect(flag?.className).toBe(tone === 'neutral' ? 'flag' : `flag flag-${tone}`);
  });
});

describe('DecisionControl', () => {
  it('sem decisão: nenhum marcado; aceitar e rejeitar decidem', () => {
    const onDecide = vi.fn();
    render(<DecisionControl value={null} name="Botão Pagar" onDecide={onDecide} />);
    const accept = screen.getByRole('button', { name: 'Aceitar Botão Pagar' });
    const reject = screen.getByRole('button', { name: 'Rejeitar Botão Pagar' });
    expect(accept.getAttribute('aria-pressed')).toBe('false');
    expect(reject.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(accept);
    fireEvent.click(reject);
    expect(onDecide.mock.calls).toEqual([['accepted'], ['rejected']]);
  });

  it('apertar o marcado limpa a decisão', () => {
    const onDecide = vi.fn();
    render(<DecisionControl value="accepted" name="Rodapé" onDecide={onDecide} />);
    const accept = screen.getByRole('button', { name: 'Aceita: Rodapé' });
    expect(accept.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(accept);
    expect(onDecide).toHaveBeenCalledWith(null);
  });

  it('rejeitada: o ✕ marcado', () => {
    render(<DecisionControl value="rejected" name="Rodapé" onDecide={() => {}} />);
    expect(
      screen
        .getByRole('button', { name: 'Rejeitada: Rodapé' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('conflito: os rótulos dizem o efeito', () => {
    render(<DecisionControl value={null} name="estilo" conflict onDecide={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Aceitar estilo: sobrescreve o valor atual' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Rejeitar estilo: mantém o valor atual' }),
    ).toBeTruthy();
  });

  it('desabilitado (ex.: pendente de proposta substituída)', () => {
    render(<DecisionControl value={null} name="Campo" disabled onDecide={() => {}} />);
    const accept = screen.getByRole('button', { name: 'Aceitar Campo' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Rejeitar Campo' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('versão com texto (Detalhes) com o atalho na dica', () => {
    const onDecide = vi.fn();
    render(
      <DecisionControl
        variant="text"
        value="rejected"
        name="Campo Cupom"
        acceptText="Aceitar item"
        rejectText="Rejeitar item"
        onDecide={onDecide}
      />,
    );
    const reject = screen.getByRole('button', { name: 'Rejeitada: Campo Cupom' });
    expect(reject.textContent).toBe('Rejeitar item');
    expect(reject.getAttribute('aria-pressed')).toBe('true');
    expect(reject.getAttribute('title')).toBe('Rejeitar  R');
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar Campo Cupom' }));
    expect(onDecide).toHaveBeenCalledWith('accepted');
  });
});
