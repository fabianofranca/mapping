import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitInput } from '../../src/ui/CommitInput';

afterEach(cleanup);

function setup(onCommit: (text: string) => boolean = () => true, value = 'current') {
  const view = render(
    <CommitInput aria-label="field" value={value} onCommit={onCommit} />,
  );
  const input = screen.getByLabelText<HTMLInputElement>('field');
  return { ...view, input, user: userEvent.setup() };
}

describe('CommitInput', () => {
  it('does not save on every key: only on confirming with Enter', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.clear(input);
    await user.type(input, 'new');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('new');
  });

  it('saves when leaving the field', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.type(input, '!');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('current!');
  });

  it('does not call onCommit when the text did not change', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.click(input);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('goes back to the current value when onCommit returns false', async () => {
    const { input, user } = setup(() => false);
    await user.clear(input);
    await user.type(input, 'rejected');
    await user.keyboard('{Enter}');
    expect(input.value).toBe('current');
  });

  it('Esc discards the draft without saving', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.type(input, 'xyz');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('current');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  // Stage 8 (8.3), finding F5 (O5 of round 3): Enter took the focus out of the field (`blur`) and
  // it fell on the `body`. Now Enter confirms and the focus stays on the field, with a single save.
  it('Enter saves once and keeps the focus on the field', async () => {
    const onCommit = vi.fn(() => true);
    const { input, user } = setup(onCommit);
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('new');
    expect(document.activeElement).toBe(input);
    // The `change` that the browser fires afterwards (Enter, Tab) does not save again.
    fireEvent.change(input);
    await user.tab();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  // Stage 8 (8.3), F5: Esc in a field reverts and stops there (does not close the surrounding
  // dialog or menu); with nothing to revert, it bubbles up.
  it('Esc with something to revert consumes the key; with nothing to revert, it bubbles up', async () => {
    const parent = vi.fn();
    render(
      <div onKeyDown={(e) => parent(e.key, e.defaultPrevented)}>
        <CommitInput aria-label="field" value="current" onCommit={() => true} />
      </div>,
    );
    const input = screen.getByLabelText<HTMLInputElement>('field');
    const user = userEvent.setup();
    await user.type(input, 'x');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('current');
    expect(parent).not.toHaveBeenCalledWith('Escape', expect.anything());
    await user.keyboard('{Escape}');
    expect(parent).toHaveBeenCalledWith('Escape', false);
  });

  it('follows the external value (e.g. after undo)', () => {
    const { rerender, input } = setup(() => true, 'a');
    rerender(<CommitInput aria-label="field" value="b" onCommit={() => true} />);
    expect(input.value).toBe('b');
  });

  it('after saving, going back to the previous value (undo, clear) shows the value, not the draft', async () => {
    const { rerender, input, user } = setup(() => true, '');
    await user.type(input, 'saved');
    await user.keyboard('{Enter}');
    rerender(<CommitInput aria-label="field" value="saved" onCommit={() => true} />);
    expect(input.value).toBe('saved');
    rerender(<CommitInput aria-label="field" value="" onCommit={() => true} />);
    expect(input.value).toBe('');
  });

  it('saves the field text even if the `change` comes before rendering', () => {
    const onCommit = vi.fn(() => true);
    const { input } = setup(onCommit, 'a');
    input.value = 'b';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith('b');
  });

  // 8.3 rework (second read, A1): the Enter guard kept the last save and never reset it.
  // After undo (the value goes back to being the save base), the same text was swallowed:
  // the field showed the text and the project did not change.
  it('after the value goes back to the previous one (undo), the same text saves again', async () => {
    const onCommit = vi.fn(() => true);
    const field = (value: string) => (
      <CommitInput aria-label="field" value={value} onCommit={onCommit} />
    );
    const { input, user, rerender } = setup(onCommit, 'old');
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    rerender(field('new'));
    rerender(field('old'));
    expect(input.value).toBe('old');
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith('new');
  });

  it('with an onCommit that normalizes the text, the next change does not save and undo releases it', async () => {
    const onCommit = vi.fn(() => true);
    const field = (value: string) => (
      <CommitInput aria-label="field" value={value} onCommit={onCommit} />
    );
    const { input, user, rerender } = setup(onCommit, 'old');
    await user.clear(input);
    await user.type(input, '  new  {Enter}');
    expect(onCommit).toHaveBeenCalledWith('  new  ');
    // The external value is the normalized text, different from what was typed.
    rerender(field('new'));
    expect(input.value).toBe('new');
    fireEvent.change(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    rerender(field('old'));
    await user.clear(input);
    await user.type(input, '  new  {Enter}');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});
