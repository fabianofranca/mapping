import { render } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { t } from '../../src/i18n';
import { typeOfAnnotation } from '../../src/model';
import { locale } from '../../src/store/settings';
import { Dialog } from '../../src/ui/Dialog';
import { RefPicker, type RefFieldDef } from '../../src/ui/RefPicker';
import { cadastroProject } from '../model/specFixtures';
import { annotationOf } from './harness';

// Stage 8 (8.3), finding F1: the `Dialog` (and the `RefPicker`) opened and registered the focus
// return in a `useEffect`, which runs on the next frame. Whoever renders outside `act` (the
// `user-event` with another version of `@testing-library/dom`) could click a button of the
// dialog and unmount it before the effect: with no cleanup registered, no return, and the focus
// fell to the `body` (the focus flake). Here Preact's `render` runs without `act`, in a
// deterministic way: the dialog that enters the DOM is already open, with the focus inside and
// with the return registered, even if it leaves before the next frame.
// pt-BR kept: shared fixture data asserted by tests/model (cadastroProject field key 'dado')

let host: HTMLElement;

beforeEach(() => {
  locale.value = 'en-US';
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

/** Lets the scheduled rendering and the microtasks run (without reaching the next frame). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Flow controls: open the modal and confirm (which removes the modal and whoever opened it). */
interface Flow {
  open(): void;
  confirm(): void;
}

/**
 * "Open" opens the modal; the confirmation removes the modal and "Open" itself (like the row
 * deleted by the dialog). The explicit return is "Target".
 */
function Vanishing({
  flow,
  modal,
}: {
  readonly flow: { current: Flow | null };
  readonly modal: (confirm: () => void, target: () => HTMLElement | null) => preact.VNode;
}) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const confirm = () => {
    setGone(true);
    setOpen(false);
  };
  flow.current = { open: () => setOpen(true), confirm };
  return (
    <div>
      {!gone && <button data-opener="">Open</button>}
      <button data-target="">Target</button>
      {open && modal(confirm, () => host.querySelector<HTMLElement>('[data-target]'))}
    </div>
  );
}

async function openThenConfirmBeforeNextFrame(
  modal: (confirm: () => void, target: () => HTMLElement | null) => preact.VNode,
) {
  const flow: { current: Flow | null } = { current: null };
  render(<Vanishing flow={flow} modal={modal} />, host);
  host.querySelector<HTMLElement>('[data-opener]')?.focus();
  flow.current?.open();
  await settle();
  const dialog = host.querySelector('dialog');
  if (!dialog) throw new Error('the modal did not enter the DOM');
  const state = {
    open: dialog.open,
    focusInside: dialog.contains(document.activeElement),
  };
  // The confirmation arrives before the next frame (the test click, the quick Enter).
  flow.current?.confirm();
  await settle();
  return state;
}

describe('Dialog outside act (F1)', () => {
  const modal = (confirm: () => void, target: () => HTMLElement | null) => (
    <Dialog
      title="Confirm"
      onCancel={() => undefined}
      returnFocus={target}
      actions={<button onClick={confirm}>Delete</button>}
    >
      <p>Text</p>
    </Dialog>
  );

  it('in the DOM, it is already open and with the focus inside', { repeats: 19 }, async () => {
    const state = await openThenConfirmBeforeNextFrame(modal);
    expect(state).toEqual({ open: true, focusInside: true });
  });

  it(
    'confirmed before the next frame, the focus goes to the target and not to the body',
    { repeats: 19 },
    async () => {
      await openThenConfirmBeforeNextFrame(modal);
      expect(document.activeElement).toBe(host.querySelector('[data-target]'));
    },
  );
});

describe('RefPicker outside act (F1)', () => {
  const project = cadastroProject();
  const annotation = annotationOf(project, 'AIN');
  const field = typeOfAnnotation(project, annotation)?.type.fields.find(
    (f) => f.key === 'dado',
  ) as RefFieldDef;
  const modal = (confirm: () => void, target: () => HTMLElement | null) => (
    <RefPicker
      project={project}
      annotation={annotation}
      field={field}
      returnFocus={target}
      onClose={() => undefined}
      onPick={confirm}
    />
  );

  it('in the DOM, it is already open and with the focus on the search', { repeats: 19 }, async () => {
    const state = await openThenConfirmBeforeNextFrame(modal);
    expect(state).toEqual({ open: true, focusInside: true });
  });

  it(
    'chosen before the next frame, the focus goes to the target and not to the body',
    { repeats: 19 },
    async () => {
      await openThenConfirmBeforeNextFrame(modal);
      expect(document.activeElement).toBe(host.querySelector('[data-target]'));
    },
  );
});

// Stage 8 (8.3), finding F7 (residue 7 of the audit, 8.7): the picker's close is an
// `IconButton` of the controls library, with an accessible name, and closes the picker.
describe('RefPicker: close button (F7)', () => {
  it('has the accessible name "Close" and calls onClose', async () => {
    const project = cadastroProject();
    const annotation = annotationOf(project, 'AIN');
    const field = typeOfAnnotation(project, annotation)?.type.fields.find(
      (f) => f.key === 'dado',
    ) as RefFieldDef;
    const onClose = vi.fn();
    render(
      <RefPicker
        project={project}
        annotation={annotation}
        field={field}
        onClose={onClose}
        onPick={() => undefined}
      />,
      host,
    );
    await settle();
    const close = within(host).getByRole('button', { name: t('common.close') });
    expect(close.classList.contains('icon-button')).toBe(true);
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
