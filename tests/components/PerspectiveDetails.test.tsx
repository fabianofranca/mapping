import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createArrow, type Arrival, type Project } from '../../src/model';
import { projectInPerspective } from '../../src/store/perspectiveShown';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { libraryHarness } from './libraryHarness';
import { viewOf } from '../store/perspectiveHarness';
import { createHarness, renderLive, type Harness } from './harness';

// Details with perspectives (stage #659, PE3, front C2): the Perspectives section, the notice of the
// "Came from…" mark, the "outside this perspective" badge in Linked by arrow and the "Main only" of Arrange
// and Delete. World: I1 (with M1 › M2 › M3) and I2 (with M4) are the roots; perspective V shows only
// I1; W shows only I2.

beforeEach(() => {
  locale.value = 'en-US';
  // The open perspective is kept per project in this browser: each test starts on Main.
  localStorage.clear();
});
afterEach(cleanup);

function world(arrivals: readonly Arrival[] = []): Project {
  const base = sampleProject();
  const v = viewOf(base, { id: 'V', root: 'I1', at: { x: 0, y: 0 } });
  const w = {
    ...viewOf(base, { id: 'W', root: 'I2', at: { x: 0, y: 0 } }),
    name: 'Other',
  };
  return {
    ...createArrow(base, { id: 'R1', from: 'M1', to: 'M4' }),
    perspectives: [{ ...v, name: 'View' }, w],
    arrivals,
  };
}

function panels(harness: Harness, which: { marking?: string; image?: string }) {
  renderLive(harness, (p) => {
    if (which.image) {
      const image = p.containers.find((c) => c.id === which.image)!;
      return (
        <SelectionPanel
          image={image}
          display={undefined}
          readOnly={harness.store.locked.value}
          busy={false}
          onReplace={() => undefined}
          onDelete={() => undefined}
        />
      );
    }
    const marking = p.markings.find((m) => m.id === which.marking)!;
    return (
      <MarkingPanel
        project={p}
        marking={marking}
        image={p.containers.find((c) => c.id === marking.containerId) ?? null}
        readOnly={harness.store.locked.value}
        onDelete={() => undefined}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return userEvent.setup();
}

const section = () => screen.queryByRole('region', { name: t('perspective.section') });
const open = (h: Harness, id: string | null) => {
  expect(h.context.session.perspective.open(id)).toBe(true);
};

describe('Details — Perspectives section', () => {
  it('lists Main and the perspectives in which the root appears', () => {
    const h = createHarness(world());
    panels(h, { image: 'I1' });
    const body = within(section()!);
    expect(body.getByText(t('perspective.principal'))).toBeTruthy();
    expect(body.getByText('View')).toBeTruthy();
    expect(body.queryByText('Other')).toBeNull();
  });

  it('an item that is not a root shows where its root appears', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M3' });
    expect(within(section()!).getByText('View')).toBeTruthy();
  });

  it('Send to perspective… sends the root; when checked, removes it', async () => {
    const h = createHarness(world());
    const user = panels(h, { image: 'I1' });
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Other/ }));
    expect(
      h
        .project()
        .perspectives.find((x) => x.id === 'W')
        ?.items.some((i) => i.root === 'I1'),
    ).toBe(true);
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    await user.click(screen.getByRole('menuitemcheckbox', { name: /View/ }));
    expect(
      h
        .project()
        .perspectives.find((x) => x.id === 'V')
        ?.items.some((i) => i.root === 'I1'),
    ).toBe(false);
  });

  it('the menu rows are checkboxes (menuitemcheckbox) with aria-checked', async () => {
    const h = createHarness(world());
    open(h, 'V');
    const user = panels(h, { image: 'I1' });
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    const boxes = screen.getAllByRole('menuitemcheckbox');
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
    ]);
    // ↓ keeps moving between the enabled items (only "Other").
    expect(document.activeElement).toBe(
      screen.getByRole('menuitemcheckbox', { name: /Other/ }),
    );
  });

  it('Main and the open perspective are locked in the menu', async () => {
    const h = createHarness(world());
    open(h, 'V');
    const user = panels(h, { image: 'I1' });
    await user.click(
      within(section()!).getByRole('button', { name: t('perspective.section.send') }),
    );
    const principal = screen.getByRole('menuitemcheckbox', {
      name: new RegExp(t('perspective.principal')),
    });
    expect((principal as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('menuitemcheckbox', { name: /View/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('the Send trigger carries menu-popover-control and the .menu-trigger class', () => {
    const h = createHarness(world());
    panels(h, { image: 'I1' });
    const trigger = within(section()!).getByRole('button', {
      name: t('perspective.section.send'),
    });
    expect(trigger.classList.contains('menu-trigger')).toBe(true);
    expect(
      trigger.closest('.menu-popover')?.classList.contains('menu-popover-control'),
    ).toBe(true);
  });

  it('the CSS gives the trigger the font, height and border of the Button (tokens only)', () => {
    const css = readFileSync('src/theme/editor.css', 'utf8');
    const rule =
      /\.menu-popover-control \.menu-trigger\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('font: var(--t-text);');
    expect(rule).toContain('min-height: var(--control-height);');
    expect(rule).toContain('border: 1px solid var(--color-border-control);');
  });

  it('read-only: the Send button is disabled', () => {
    const h = createHarness(world(), true);
    panels(h, { image: 'I1' });
    const button = within(section()!).getByRole('button', {
      name: t('perspective.section.send'),
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Details — "Came from…" notice', () => {
  const arrival = (root: string, fromName = 'Analytics'): Arrival => ({
    root,
    from: 'W',
    fromName,
  });
  const notice = () => screen.queryByText(/Came from Analytics\./);

  it('without session info (after reloading): only "Came from X."', () => {
    const h = createHarness(world([arrival('I1')]));
    panels(h, { image: 'I1' });
    expect(notice()).toBeTruthy();
    expect(screen.queryByText(/No reference/)).toBeNull();
    expect(screen.queryByText(/was taken/)).toBeNull();
  });

  it('without session info and without an arrow to another root: "No reference; it went to the arrival area." (stage #764, AP1)', () => {
    const h = createHarness({ ...world([arrival('I1')]), arrows: [] });
    panels(h, { image: 'I1' });
    expect(notice()).toBeTruthy();
    expect(document.body.textContent).toContain(t('perspective.arrival.area'));
  });

  it('with an arrow to another root the "no reference" sentence does not appear, even with area info', () => {
    const h = createHarness(world([arrival('I1')]));
    panels(h, { image: 'I1' });
    expect(document.body.textContent).not.toContain(t('perspective.arrival.area'));
  });

  it.each([
    // pt-BR kept: shared fixture data asserted by tests/model (file name images/frente.jpg of sampleProject)
    ['near', 'I2', 'Stayed near images/frente.jpg, at the same distance.'],
    [
      'occupied',
      'I2',
      'Next to images/frente.jpg was taken; it went to the nearest free space.',
    ],
    ['arrival-area', null, 'No reference; it went to the arrival area.'],
  ] as const)('explains the %s case', (kind, referenceId, text) => {
    // "No reference" comes from the arrows: the arrival area case is the project with no arrow between roots.
    const base = world([arrival('I1')]);
    const h = createHarness(kind === 'arrival-area' ? { ...base, arrows: [] } : base);
    h.context.session.perspective.arrivals.value = [
      { root: 'I1', from: 'W', kind, referenceId },
    ];
    panels(h, { image: 'I1' });
    expect(notice()).toBeTruthy();
    expect(document.body.textContent).toContain(text);
  });

  it('Dismiss removes the mark from the project', async () => {
    const h = createHarness(world([arrival('I1'), arrival('I2')]));
    const user = panels(h, { image: 'I1' });
    await user.click(
      screen.getByRole('button', { name: t('perspective.arrival.dismiss') }),
    );
    expect(h.project().arrivals.map((a) => a.root)).toEqual(['I2']);
    expect(notice()).toBeNull();
  });

  it('Next one that came (N) selects the next root with a mark, in a circle', async () => {
    const h = createHarness(world([arrival('I1'), arrival('I2')]));
    const user = panels(h, { image: 'I1' });
    const next = screen.getByRole('button', {
      name: t('perspective.arrival.next', { count: 2 }),
    });
    await user.click(next);
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });

  it('does not appear outside Main', () => {
    const h = createHarness(world([arrival('I1')]));
    open(h, 'V');
    panels(h, { image: 'I1' });
    expect(notice()).toBeNull();
  });

  it('an item without a mark does not show the notice', () => {
    const h = createHarness(world([arrival('I2')]));
    panels(h, { image: 'I1' });
    expect(notice()).toBeNull();
  });
});

describe('Details — Linked by arrow outside the perspective', () => {
  const outside = () => t('perspective.arrow.outside');

  it('with a perspective open, the other end outside it gets the badge', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { marking: 'M1' });
    expect(screen.getByText(outside())).toBeTruthy();
  });

  it('on Main, no badge', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M1' });
    expect(screen.queryByText(outside())).toBeNull();
  });

  it('other end on the same root (inside the perspective): no badge', () => {
    const base = world();
    const h = createHarness(createArrow(base, { id: 'R2', from: 'M1', to: 'M2' }));
    open(h, 'V');
    panels(h, { marking: 'M1' });
    // Only the arrow to M4 (outside V) carries the badge; the one to M2 (same root) does not.
    expect(screen.getAllByText(outside())).toHaveLength(1);
  });
});

describe('Details — Linked by arrow with the project as seen from the perspective', () => {
  it("the arrow leaving the perspective appears, with the badge (the panel's real path)", () => {
    const h = createHarness(world());
    open(h, 'V');
    const shown = projectInPerspective(h.store.project.value!, 'V');
    const marking = shown.markings.find((m) => m.id === 'M1')!;
    render(
      <EditorContext.Provider value={h.context}>
        <MarkingPanel
          project={shown}
          marking={marking}
          image={shown.containers.find((c) => c.id === marking.containerId) ?? null}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getByText(t('perspective.arrow.outside'))).toBeTruthy();
  });
});

describe('Details — Main only', () => {
  /** A column with two buttons on I1 (Arrange exists) and perspective V showing I1. */
  async function arrangeable(openId: string | null = null) {
    const h = await libraryHarness();
    const add = (typeId: string, parentId: string | null) => {
      const result = h.actions.addComponent({
        containerId: 'I1',
        parentId,
        specId: 'material3',
        typeId,
      });
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const column = add('m3-column', null);
    add('m3-button', column);
    const applied = h.store.apply((p) => ({
      ...p,
      perspectives: [viewOf(p, { id: 'V', root: 'I1', at: { x: 0, y: 0 } })],
    }));
    expect(applied).toEqual({ ok: true, value: undefined });
    if (openId) open(h, openId);
    renderLive(h, (project) => {
      const marking = project.markings.find((m) => m.id === column)!;
      return (
        <MarkingPanel
          project={project}
          marking={marking}
          image={project.containers.find((i) => i.id === marking.containerId) ?? null}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    return h;
  }

  it('on Main, Arrange is available', async () => {
    await arrangeable();
    const arrange = screen.getByRole('button', { name: t('arrange.action') });
    expect((arrange as HTMLButtonElement).disabled).toBe(false);
  });

  it('in a perspective, Arrange is disabled with the hint', async () => {
    await arrangeable('V');
    const arrange = screen.getByRole('button', { name: t('arrange.action') });
    expect((arrange as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain(t('perspective.principalOnly'));
  });

  it('on Main, Deleting a marking is available', () => {
    const h = createHarness(world());
    panels(h, { marking: 'M1' });
    const del = screen.getByRole('button', { name: t('marking.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(false);
  });

  it('in a perspective, deleting a root container is disabled with the hint', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { image: 'I1' });
    const del = screen.getByRole('button', { name: t('image.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    expect(del.getAttribute('title')).toBe(t('perspective.principalOnly'));
  });

  it('in a perspective, deleting a non-root marking is still available', () => {
    const h = createHarness(world());
    open(h, 'V');
    panels(h, { marking: 'M3' });
    const del = screen.getByRole('button', { name: t('marking.delete') });
    expect((del as HTMLButtonElement).disabled).toBe(false);
  });
});
