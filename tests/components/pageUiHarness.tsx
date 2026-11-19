import { screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs, type EditorDialog } from '../../src/app/useEditorDialogs';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Shared setup of the page UI tests (stage #883, PG2): the cadastro project (page "Page 1" with one
// root) plus optional empty pages, and a host that opens the editor dialogs by a button.

let pendingDialog: EditorDialog = { kind: 'managePages' };

function Host() {
  const dialogs = useEditorDialogs();
  return (
    <>
      <button type="button" onClick={() => dialogs.show(pendingDialog)}>
        open-dialog
      </button>
      <EditorDialogs dialogs={dialogs} />
    </>
  );
}

/** Cadastro project with the extra pages (empty), in order. Returns their ids. */
export async function setupPages(extra: readonly string[] = ['Second']) {
  const harness = await createLocalHarness(cadastroProject());
  const ids: string[] = [];
  for (const name of extra) {
    const r = harness.actions.addPage(name);
    if (!r.ok) throw new Error('page not created');
    ids.push(r.value);
  }
  return { harness, ids, session: harness.context.session };
}

/** Renders the host and opens `dialog` through the button. */
export async function openDialog(
  harness: Awaited<ReturnType<typeof setupPages>>['harness'],
  dialog: EditorDialog,
) {
  pendingDialog = dialog;
  renderLive(harness, () => <Host />);
  const user = userEvent.setup();
  await user.click(screen.getByText('open-dialog'));
  return user;
}
