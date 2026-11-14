import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAYER_PALETTE, type Project } from '../../src/model';
import { locale, markingDisplay, setMarkingDisplay } from '../../src/store/settings';
import { LayerActions, LayersPanel } from '../../src/ui/LayersPanel';
import { cadastroProject } from '../model/specFixtures';
import { createHarness, renderLive } from './harness';

// Layers (B3): the window content is the `LayersPanel`; New layer and Show all
// come from `LayerActions`.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(project: Project = cadastroProject(), readOnly = false) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => (
    <>
      <LayerActions project={p} readOnly={readOnly} />
      <LayersPanel project={p} readOnly={readOnly} />
    </>
  ));
  return { harness, user: userEvent.setup() };
}

const names = (p: Project) => p.layers.map((l) => l.name);

/** Opens the layer's actions menu (⋯) by name and returns the requested item. */
async function menuItem(
  user: ReturnType<typeof userEvent.setup>,
  layerName: string,
  item: string,
) {
  await user.click(
    screen.getByRole('button', { name: `More actions for layer ${layerName}` }),
  );
  const menu = screen.getByRole('menu', { name: `More actions for layer ${layerName}` });
  return within(menu).getByRole('menuitem', { name: item });
}

describe('LayersPanel', () => {
  it('lists the layers in the project order', () => {
    const { harness } = setup();
    const inputs = screen
      .getAllByLabelText('Layer name')
      .map((i) => (i as HTMLInputElement).value);
    expect(inputs).toEqual(names(harness.project()));
  });

  it('new layer: default name and palette color', async () => {
    const { harness, user } = setup();
    const before = harness.project().layers.length;
    await user.click(screen.getByRole('button', { name: 'New layer' }));
    const layers = harness.project().layers;
    expect(layers).toHaveLength(before + 1);
    expect(layers[before]?.name).toBe(`Layer ${before + 1}`);
    expect(LAYER_PALETTE.map((c) => c.toUpperCase())).toContain(
      layers[before]?.color.toUpperCase(),
    );
  });

  it('renames a free layer on confirm, in its own row', async () => {
    const { harness, user } = setup();
    const input = screen.getAllByLabelText('Layer name')[0];
    if (!input) throw new Error('no layers');
    await user.clear(input);
    await user.type(input, 'Model{Enter}');
    expect(harness.project().layers[0]?.name).toBe('Model');
  });

  it('specialization layers cannot be renamed or deleted', async () => {
    const { harness, user } = setup();
    const p = harness.project();
    for (const [index, layer] of p.layers.entries()) {
      expect(screen.getAllByLabelText('Layer name')[index]).toHaveProperty(
        'disabled',
        layer.spec !== null,
      );
      const del = await menuItem(user, layer.name, 'Delete layer');
      expect(del).toHaveProperty('disabled', layer.spec !== null);
      await user.keyboard('{Escape}');
    }
  });

  it('the specialization badge carries the tip with the full name', () => {
    const { harness } = setup();
    const owned = harness.project().layers.filter((l) => l.spec !== null);
    expect(owned.length).toBeGreaterThan(0);
    const badges = document.querySelectorAll<HTMLElement>('.layer-badge');
    expect(badges).toHaveLength(owned.length);
    for (const badge of badges) {
      const tip = badge.parentElement?.querySelector('[data-tooltip]');
      expect(tip?.textContent).toBe(`Specialization ${badge.textContent}`);
    }
  });

  it('changes the color through the palette, which opens as a popover and closes on pick', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layers');
    expect(
      screen.queryByRole('group', { name: `Color of layer ${layer.name}` }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: `Color of layer ${layer.name}` }),
    );
    const palette = screen.getByRole('group', { name: `Color of layer ${layer.name}` });
    const color = LAYER_PALETTE.find(
      (c) => c.toUpperCase() !== layer.color.toUpperCase(),
    );
    if (!color) throw new Error('palette without an alternative');
    await user.click(within(palette).getByRole('button', { name: color }));
    expect(harness.project().layers[0]?.color.toUpperCase()).toBe(color.toUpperCase());
    expect(
      screen.queryByRole('group', { name: `Color of layer ${layer.name}` }),
    ).toBeNull();
  });

  it('the popover closes with Esc and returns the focus to the button', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layers');
    const trigger = screen.getByRole('button', { name: `Color of layer ${layer.name}` });
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('group', { name: `Color of layer ${layer.name}` }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('the popover closes on an outside click', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layers');
    const trigger = screen.getByRole('button', { name: `Color of layer ${layer.name}` });
    await user.click(trigger);
    // The outside listener is added in an effect; Preact runs it at most 100ms after
    // the paint (`requestAnimationFrame` with a limit), so wait a little longer.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await user.click(document.body);
    expect(
      screen.queryByRole('group', { name: `Color of layer ${layer.name}` }),
    ).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reorders through the menu and disables the extremes', async () => {
    const { harness, user } = setup();
    const before = harness.project().layers;
    const first = before[0];
    const lastLayer = before[before.length - 1];
    if (!first || !lastLayer) throw new Error('no layers');
    expect(await menuItem(user, first.name, 'Move layer up')).toHaveProperty(
      'disabled',
      true,
    );
    await user.keyboard('{Escape}');
    expect(await menuItem(user, lastLayer.name, 'Move layer down')).toHaveProperty(
      'disabled',
      true,
    );
    await user.keyboard('{Escape}');

    await user.click(await menuItem(user, first.name, 'Move layer down'));
    const after = harness.project().layers.map((l) => l.id);
    expect(after[0]).toBe(before[1]?.id);
    expect(after[1]).toBe(first.id);
    // Choosing an action closes the menu.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('⋮ menu: menuitem items, focus on the first enabled one, arrows wrap around and Esc returns the focus', async () => {
    const { harness, user } = setup();
    const first = harness.project().layers[0];
    if (!first) throw new Error('no layers');
    const more = screen.getByRole('button', {
      name: `More actions for layer ${first.name}`,
    });
    await user.click(more);
    const menu = screen.getByRole('menu', {
      name: `More actions for layer ${first.name}`,
    });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Move layer up',
      'Move layer down',
      'Comment',
      'Cite in the conversation',
      'Copy reference',
      'Delete layer',
    ]);
    // On the first layer "Move up" is disabled: the focus goes to "Move down". With no composer
    // open, "Cite in the conversation" is also disabled and the arrows skip it.
    expect(items[3]?.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[2]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[4]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[5]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[5]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('delete asks for confirmation with the count of affected annotations', async () => {
    const { harness, user } = setup();
    const free = harness.project().layers.find((l) => l.spec === null);
    if (!free) throw new Error('no free layer');
    await user.click(await menuItem(user, free.name, 'Delete layer'));
    const heading = await screen.findByRole('heading', { name: 'Delete layer?' });
    const dialog = heading.closest('dialog');
    if (!dialog) throw new Error('no dialog');
    expect(within(dialog).getByText(/annotation/)).toBeTruthy();
    // Stage 8 (8.3), F10: destructive confirmation, announced as an alert.
    expect(dialog.getAttribute('role')).toBe('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(harness.project().layers).toContain(free);

    await user.click(await menuItem(user, free.name, 'Delete layer'));
    const again = (await screen.findByRole('heading', { name: 'Delete layer?' })).closest(
      'dialog',
    );
    await user.click(
      within(again as HTMLElement).getByRole('button', { name: 'Delete' }),
    );
    expect(harness.project().layers.some((l) => l.id === free.id)).toBe(false);
    // The layer's annotations go with it.
    expect(harness.project().annotations.some((a) => a.layerId === free.id)).toBe(false);
  });

  it('the last layer cannot be deleted', async () => {
    const { harness } = setup();
    cleanup();
    const only = createHarness({
      ...harness.project(),
      layers: harness.project().layers.slice(0, 1),
      annotations: [],
    });
    renderLive(only, (p) => <LayersPanel project={p} readOnly={false} />);
    const user = userEvent.setup();
    const name = only.project().layers[0]?.name ?? '';
    expect(await menuItem(user, name, 'Delete layer')).toHaveProperty('disabled', true);
  });

  it('visibility: there is no "Make active" and any layer, even the last visible one, can be hidden', async () => {
    const { harness, user } = setup();
    const p = harness.project();
    const second = p.layers[1];
    const first = p.layers[0];
    if (!first || !second) throw new Error('needs two layers');
    expect(screen.queryByRole('button', { name: /^Make active/ })).toBeNull();
    expect(document.querySelectorAll('.layer-row-active')).toHaveLength(0);
    const box = screen.getByLabelText(`Show layer ${first.name}`);
    expect(box).toHaveProperty('checked', true);
    expect(box).toHaveProperty('disabled', false);
    await user.click(box);
    expect(harness.ui.hiddenLayers.value.has(first.id)).toBe(true);
    const last = screen.getByLabelText(`Show layer ${second.name}`);
    expect(last).toHaveProperty('disabled', false);
    await user.click(last);
    expect(harness.ui.hiddenLayers.value.has(second.id)).toBe(true);
    expect(screen.getByLabelText(`Show layer ${second.name}`)).toHaveProperty(
      'checked',
      false,
    );
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
  });

  it('the markings display mode stays in the footer and is kept in the settings', async () => {
    const { user } = setup();
    const select = screen.getByLabelText('Markings without annotations');
    await user.selectOptions(select, 'hide');
    expect(markingDisplay.value).toBe('hide');
    await user.selectOptions(select, 'all');
    expect(markingDisplay.value).toBe('all');
    setMarkingDisplay('dim');
  });

  it('read-only disables create, rename, color, move and delete', async () => {
    const { harness, user } = setup(cadastroProject(), true);
    expect(screen.getByRole('button', { name: 'New layer' })).toHaveProperty(
      'disabled',
      true,
    );
    for (const input of screen.getAllByLabelText('Layer name')) {
      expect(input).toHaveProperty('disabled', true);
    }
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layers');
    expect(
      screen.getByRole('button', { name: `Color of layer ${layer.name}` }),
    ).toHaveProperty('disabled', true);
    for (const l of harness.project().layers) {
      expect(await menuItem(user, l.name, 'Delete layer')).toHaveProperty(
        'disabled',
        true,
      );
      expect(
        await screen.findByRole('menuitem', { name: 'Move layer up' }),
      ).toHaveProperty('disabled', true);
      await user.keyboard('{Escape}');
    }
  });
});
