import { act, cleanup, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../src/store/settings';
import { goToAnnotation } from '../../src/store/ui';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { layerOf } from '../model/specFixtures';
import { roleProject, withRoles } from '../model/roleFixtures';
import type { Json } from '../model/specV11Fixtures';
import { createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const needsOwner = (s: Json) => {
  for (const type of s.layers[1].annotationTypes) {
    if (type.id === 'onClick') type.requiresOwner = true;
  }
};

async function openOwnerStep(edit: (s: Json) => void) {
  const harness = createHarness(roleProject(edit));
  renderLive(harness, (p) => {
    const marking = p.markings.find((m) => m.id === 'M1');
    const image = p.containers.find((i) => i.id === marking?.containerId);
    if (!marking || !image) return null;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => undefined}
        onGoToAnnotation={(a) => goToAnnotation(harness.ui, a)}
      />
    );
  });
  const user = userEvent.setup();
  act(() => {
    harness.ui.activeLayer.value = layerOf(harness.project(), 's', 'eventos');
  });
  await user.click(
    await vi.waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-action="add-annotation"]');
      if (!el) throw new Error('sem o "+ Anotação"');
      return el;
    }),
  );
  const dialog = await vi.waitFor(() => {
    const el = document.querySelector('dialog');
    if (!el) throw new Error('sem o diálogo');
    return el;
  });
  await user.click(
    within(dialog).getByRole('button', { name: /^onClick/, hidden: true }),
  );
  await vi.waitFor(() => {
    if (!document.querySelector('dialog')?.textContent?.includes('Dono do'))
      throw new Error('sem o passo do dono');
  });
  return { harness, user };
}

describe('passo do dono com papel (decisão 18)', () => {
  it('uma opção por dono e papel; escolher grava o papel numa só entrada de desfazer', async () => {
    const { harness, user } = await openOwnerStep((s) => {
      needsOwner(s);
      withRoles(s);
    });
    const dialog = document.querySelector('dialog') as HTMLElement;
    const names = within(dialog)
      .getAllByRole('button', { hidden: true })
      .map((b) => b.textContent);
    expect(names).toContain('Button › Clique');
    expect(names).toContain('Button › Pressionar');
    const before = harness.project().annotations.length;
    await user.click(
      within(dialog).getAllByRole('button', {
        name: 'Button › Pressionar',
        hidden: true,
      })[1] as HTMLElement,
    );
    const created = harness.project().annotations.at(-1);
    expect(harness.project().annotations.length).toBe(before + 1);
    expect(created?.parentAnnotationId).toBe('A2');
    expect(created?.parentRole).toBe('hold');
    act(() => {
      harness.store.undo();
    });
    expect(harness.project().annotations.length).toBe(before);
  });

  it('sem papéis, um botão por dono e parentRole nulo', async () => {
    const { harness, user } = await openOwnerStep(needsOwner);
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(within(dialog).queryByText(/›/)).toBeNull();
    const buttons = within(dialog).getAllByRole('button', {
      name: 'Button',
      hidden: true,
    });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0] as HTMLElement);
    const created = harness.project().annotations.at(-1);
    expect(created?.parentAnnotationId).toBe('A1');
    expect(created?.parentRole ?? null).toBeNull();
  });
});
