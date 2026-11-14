import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { createMarking } from '../../src/model';
import { selectItems } from '../../src/store/ui';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Stage #1425: after Wrap (⋯ of the Tree) and Bring to front, focus never goes to
// `body`: it returns to the origin control or, if it is gone, to the closest app container.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function renderTree(harness: Harness) {
  renderLive(harness, (p) => (
    // As in the app: the Tree lives in a tool window (`section[data-window]`).
    <section data-window="tree" tabIndex={-1}>
      <MarkingTree project={p} selection={null} onSelect={() => undefined} />
    </section>
  ));
}

describe('focus after Wrap from the ⋯ of the Tree', () => {
  it('focus does not go to body', async () => {
    const harness = createHarness(sampleProject());
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
    renderTree(harness);
    // pt-BR kept: shared fixture data (marking 'Fechadura' of sampleProject) asserted by tests/
    const name = t('copy.itemActions', { name: 'Fechadura' });
    await userEvent.click(screen.getByRole('button', { name }));
    const menu = screen.getByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitem', { name: t('multi.wrap') }));
    await Promise.resolve();
    const section = document.querySelector('[data-window="tree"]');
    expect(document.activeElement).toBe(section);
  });
});

describe('focus after Bring to front (Details)', () => {
  it('reaching the end of the order, focus stays on the neighbor button, not on body', async () => {
    // M1 and its sibling M5: `M1` is `1 of 2` and, after the click, the button is disabled.
    const harness = createHarness(
      createMarking(sampleProject(), {
        id: 'M5',
        containerId: 'I1',
        rect: { x: 2500, y: 100, width: 100, height: 100 },
      }),
    );
    selectItems(harness.ui, [{ kind: 'marking', id: 'M1' }]);
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
          onGoToAnnotation={() => undefined}
        />
      );
    });
    const front = screen.getByRole('button', { name: t('marking.orderFront') });
    await userEvent.click(front);
    await Promise.resolve();
    expect((front as HTMLButtonElement).disabled).toBe(true);
    const back = screen.getByRole('button', { name: t('marking.orderBack') });
    expect(document.activeElement).toBe(back);
  });
});
