import 'fake-indexeddb/auto';
import { cleanup, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Stage #764, AP1 (decision 1): the delete confirmation, opened from Manage perspectives, returns
// to Manage on close, and the focus goes to the Delete of the same row (Cancel/Esc) or of the one that took
// its place (Delete).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function Host() {
  const dialogs = useEditorDialogs();
  return (
    <>
      <button type="button" onClick={() => dialogs.show({ kind: 'managePerspectives' })}>
        open-manage
      </button>
      <EditorDialogs dialogs={dialogs} />
    </>
  );
}

async function setup(names: string[]) {
  const harness = await createLocalHarness(cadastroProject());
  for (const name of names) {
    const r = harness.context.session.perspectiveActions.createPerspective({
      name,
      startFrom: 'empty',
      local: false,
    });
    if (!r.ok) throw new Error('perspective not created');
  }
  renderLive(harness, () => <Host />);
  const user = userEvent.setup();
  await user.click(screen.getByText('open-manage'));
  return { harness, user };
}

const deleteButton = (name: string) =>
  screen.getByRole('button', {
    name: t('perspective.manage.delete', { name }),
    hidden: true,
  });
const manageTitle = () =>
  screen.queryByText(t('perspective.manage.title'), { selector: 'h2' });
const names = (h: Awaited<ReturnType<typeof setup>>['harness']) =>
  h.project().perspectives.map((p) => p.name);

describe('delete perspective through Manage', () => {
  it('Cancel returns to Manage with the focus on the Delete of the same row', async () => {
    const { user } = await setup(['A', 'B', 'C']);
    await user.click(deleteButton('B'));
    expect(manageTitle()).toBeNull();
    await user.click(
      screen.getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    expect(manageTitle()).not.toBeNull();
    await Promise.resolve();
    expect(document.activeElement).toBe(deleteButton('B'));
  });

  it('Esc returns to Manage with the focus on the Delete of the same row', async () => {
    const { user } = await setup(['A', 'B']);
    await user.click(deleteButton('A'));
    document
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await Promise.resolve();
    expect(manageTitle()).not.toBeNull();
    expect(document.activeElement).toBe(deleteButton('A'));
  });

  it('Delete returns to Manage without the perspective and with the focus on the Delete of the row below', async () => {
    const { harness, user } = await setup(['A', 'B', 'C']);
    await user.click(deleteButton('B'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    expect(names(harness)).toEqual(['A', 'C']);
    expect(manageTitle()).not.toBeNull();
    expect(document.activeElement).toBe(deleteButton('C'));
  });

  it('Deleting the last row takes the focus to the Delete of the one above', async () => {
    const { user } = await setup(['A', 'B']);
    await user.click(deleteButton('B'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    expect(document.activeElement).toBe(deleteButton('A'));
  });

  it('Deleting the only perspective takes the focus to the Close of Manage', async () => {
    const { user } = await setup(['A']);
    await user.click(deleteButton('A'));
    await user.click(
      screen.getByRole('button', { name: t('perspective.delete.confirm'), hidden: true }),
    );
    await Promise.resolve();
    const close = screen.getByRole('button', { name: t('common.close'), hidden: true });
    expect(document.activeElement).toBe(close);
  });

  it('Closing Manage returns the focus to the button that opened it', async () => {
    const { user } = await setup(['A']);
    await user.click(deleteButton('A'));
    await user.click(
      screen.getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await user.click(
      screen.getByRole('button', { name: t('common.close'), hidden: true }),
    );
    await Promise.resolve();
    expect(manageTitle()).toBeNull();
    expect(document.activeElement).toBe(screen.getByText('open-manage'));
  });
});
