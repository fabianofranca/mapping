import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_TYPES, type LevelState } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ChangeKind } from '../../../src/ui/review/ChangeKind';
import { DecisionControl } from '../../../src/ui/review/DecisionControl';
import { DecisionMark } from '../../../src/ui/review/DecisionMark';
import { Flag } from '../../../src/ui/review/Flag';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

// Base components of the review (HANDOFF-PROPOSALS 2.1, step 2 of section 9): all the
// states, the accessible name and what each one never does (say the state by color alone).

describe('DecisionMark', () => {
  const states: readonly [LevelState, string][] = [
    ['undecided', 'Undecided'],
    ['accepted', 'Accepted'],
    ['rejected', 'Rejected'],
    ['partial', 'Partial'],
  ];

  it.each(states)('%s: own shape and accessible name', (state, label) => {
    const { container } = render(<DecisionMark state={state} />);
    const mark = screen.getByRole('img', { name: label });
    expect(mark.getAttribute('title')).toBe(label);
    expect(mark.dataset.state).toBe(state);
    // The shape changes with the state (not only the color): dashed, filled with glyph, half.
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

  it('each state has a different drawing', () => {
    const drawings = states.map(([state]) => {
      const { container } = render(<DecisionMark state={state} />);
      const html = container.querySelector('svg')?.innerHTML ?? '';
      cleanup();
      return html;
    });
    expect(new Set(drawings).size).toBe(states.length);
  });

  it('partial with counts says how many of each', () => {
    render(
      <DecisionMark
        state="partial"
        counts={{ accepted: 15, rejected: 6, undecided: 17 }}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Partial: 15 accepted, 6 rejected, 17 undecided',
      }),
    ).toBeTruthy();
  });

  it('decorative stays out of the accessibility tree', () => {
    const { container } = render(<DecisionMark state="accepted" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('ChangeKind', () => {
  const labels = {
    created: 'Created',
    removed: 'Removed',
    moved: 'Moved',
    changed: 'Changed',
    replaced: 'Image replaced',
  } as const;

  it.each(CHANGE_TYPES)('%s: neutral icon and kind name', (type) => {
    const { container } = render(<ChangeKind type={type} />);
    const badge = screen.getByRole('img', { name: labels[type] });
    expect(badge.getAttribute('title')).toBe(labels[type]);
    expect(container.querySelector('svg')).toBeTruthy();
    // Neutral: no decision class (green/red belong to accepted and rejected).
    expect(badge.className).not.toMatch(/accept|reject|success|danger/);
  });

  it('compact version of the rows', () => {
    render(<ChangeKind type="moved" size="sm" />);
    expect(screen.getByRole('img', { name: 'Moved' }).className).toContain(
      'change-kind-sm',
    );
  });
});

describe('Flag', () => {
  it.each(['neutral', 'warn', 'danger', 'ok', 'new'] as const)('%s', (tone) => {
    const { container } = render(
      <Flag tone={tone} icon={tone === 'warn' ? 'warning' : undefined}>
        Text
      </Flag>,
    );
    const flag = container.querySelector('.flag');
    expect(flag?.textContent).toBe('Text');
    expect(flag?.className).toBe(tone === 'neutral' ? 'flag' : `flag flag-${tone}`);
  });
});

describe('DecisionControl', () => {
  it('undecided: none pressed; accept and reject decide', () => {
    const onDecide = vi.fn();
    render(<DecisionControl value={null} name="Pay button" onDecide={onDecide} />);
    const accept = screen.getByRole('button', { name: 'Accept Pay button' });
    const reject = screen.getByRole('button', { name: 'Reject Pay button' });
    expect(accept.getAttribute('aria-pressed')).toBe('false');
    expect(reject.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(accept);
    fireEvent.click(reject);
    expect(onDecide.mock.calls).toEqual([['accepted'], ['rejected']]);
  });

  it('pressing the pressed one clears the decision', () => {
    const onDecide = vi.fn();
    render(<DecisionControl value="accepted" name="Footer" onDecide={onDecide} />);
    const accept = screen.getByRole('button', { name: 'Accepted: Footer' });
    expect(accept.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(accept);
    expect(onDecide).toHaveBeenCalledWith(null);
  });

  it('rejected: the ✕ pressed', () => {
    render(<DecisionControl value="rejected" name="Footer" onDecide={() => {}} />);
    expect(
      screen
        .getByRole('button', { name: 'Rejected: Footer' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('conflict: the labels state the effect', () => {
    render(<DecisionControl value={null} name="style" conflict onDecide={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Accept style: overwrites the current value' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Reject style: keeps the current value' }),
    ).toBeTruthy();
  });

  it('disabled (e.g. undecided in a superseded proposal)', () => {
    render(<DecisionControl value={null} name="Field" disabled onDecide={() => {}} />);
    const accept = screen.getByRole('button', { name: 'Accept Field' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Reject Field' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('text version (Details) with the shortcut in the hint', () => {
    const onDecide = vi.fn();
    render(
      <DecisionControl
        variant="text"
        value="rejected"
        name="Coupon field"
        acceptText="Accept item"
        rejectText="Reject item"
        onDecide={onDecide}
      />,
    );
    const reject = screen.getByRole('button', { name: 'Reject item: Coupon field' });
    expect(reject.textContent).toBe('Reject item');
    expect(reject.getAttribute('aria-pressed')).toBe('true');
    expect(reject.getAttribute('title')).toBe('Reject  R');
    fireEvent.click(screen.getByRole('button', { name: 'Accept item: Coupon field' }));
    expect(onDecide).toHaveBeenCalledWith('accepted');
  });
});
