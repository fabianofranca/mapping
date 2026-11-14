import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { locale } from '../../src/store/settings';
import { Button } from '../../src/ui/controls';
import { EditorContext } from '../../src/ui/EditorContext';
import { MenuPopover } from '../../src/ui/MenuPopover';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// SA1 (stage #347): popover menus are real menus — `menuitem` items, focus on the first
// enabled one when opening, circular ↑/↓, Esc returns the focus to the trigger and the trigger
// has `aria-haspopup="menu"`. The same pattern as the `ActionMenu`.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function renderMenu() {
  render(
    <MenuPopover label="Project" buttonLabel="Project: actions">
      <Button role="menuitem" disabled>
        Disabled
      </Button>
      <Button role="menuitem">Export</Button>
      <Button role="menuitem">Close</Button>
    </MenuPopover>,
  );
  return screen.getByRole('button', { name: /^Project/ });
}

describe('MenuPopover: complete menu', () => {
  it('the trigger announces the menu and the name starts with the visible text', () => {
    const trigger = renderMenu();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with the items as menuitem and the focus on the first enabled one', async () => {
    const trigger = renderMenu();
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Disabled',
      'Export',
      'Close',
    ]);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Export' }));
  });

  it('↓ and ↑ cycle through the enabled ones', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Close' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Export' }));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Close' }));
  });

  it('Esc closes and returns the focus to the trigger', async () => {
    const trigger = renderMenu();
    const user = userEvent.setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('project menu', () => {
  it('the trigger starts with the project name; Export and Close project are menuitem', async () => {
    const harness = createHarness(sampleProject());
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    render(
      <EditorContext.Provider value={harness.context}>
        <EditorMainBar
          busy={false}
          onAdd={vi.fn()}
          dialogs={
            { show: vi.fn(), close: vi.fn(), exportButton: { current: null } } as never
          }
          commands={commands as unknown as ProjectCommands}
        />
      </EditorContext.Provider>,
    );
    const name = harness.project().project.name;
    const trigger = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(trigger.getAttribute('aria-label')).toBe(
      t('editor.projectMenuName', { name }),
    );
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      t('editor.export'),
      t('editor.closeProject'),
    ]);
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: t('editor.export') }),
    );
  });
});
