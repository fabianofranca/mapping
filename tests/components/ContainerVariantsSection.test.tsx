import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import {
  addBackgroundContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  createPage,
  linkVariant,
  moveRootsToPage,
  parseSpec,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { ContainerVariantsSection } from '../../src/ui/ContainerVariantsSection';
import { emptyProject } from '../model/fixtures';
import { idGen, layerOf } from '../model/specFixtures';
import { v11Json, type Json } from '../model/specV11Fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Stage #2034, VR3 (decision 12): the "Variants" section in the container Details.

beforeEach(() => {
  locale.value = 'en-US';
  // The open page is remembered per project: one test opening a page must not leak into the next.
  localStorage.clear();
});
afterEach(cleanup);

const SETS = [
  {
    id: 'window',
    name: 'Window',
    by: 'width',
    classes: [
      { id: 'compact', name: 'Compact', below: 600 },
      { id: 'expanded', name: 'Expanded' },
    ],
  },
];

function spec() {
  const result = parseSpec(
    v11Json((s: Json) => {
      s.containerClasses = SETS;
    }, 21),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

/** COMPACT (400 px), EXPANDED (900 px) and LONE (not linked), all on the first page; no markings yet. */
function base(): Project {
  let p = applySpecialization(emptyProject(), spec(), { newId: idGen('SL') });
  p = addBackgroundContainer(p, {
    id: 'COMPACT',
    name: 'Phone',
    width: 400,
    height: 800,
    background: '#FFFFFF',
  });
  p = addBackgroundContainer(p, {
    id: 'EXPANDED',
    name: 'Desktop',
    width: 900,
    height: 800,
    background: '#FFFFFF',
  });
  p = addBackgroundContainer(p, {
    id: 'LONE',
    name: 'Lone',
    width: 300,
    height: 300,
    background: '#FFFFFF',
  });
  return p;
}

/** Marks a typed annotation of `typeId` inside `container`. */
function mark(p: Project, container: string, typeId: string, n: number): Project {
  const layerId = layerOf(p, 's', 'componentes');
  const withMarking = createMarking(p, {
    id: `M${n}`,
    containerId: container,
    rect: { x: 10, y: 20 * n, width: 20, height: 20 },
  });
  return addTypedAnnotation(withMarking, {
    id: `A${n}`,
    markingId: `M${n}`,
    layerId,
    type: { specId: 's', typeId },
  });
}

function setup(project: Project, containerId = 'COMPACT', readOnly = false) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => {
    const image = p.containers.find((c) => c.id === containerId);
    return image ? <ContainerVariantsSection image={image} readOnly={readOnly} /> : null;
  });
  return { harness, user: userEvent.setup() };
}

const linked = () => linkVariant(base(), 'COMPACT', 'EXPANDED');
const group = (h: Harness, id: string) =>
  h.project().containers.find((c) => c.id === id)?.variantGroup;

describe('ContainerVariantsSection', () => {
  it('one row per other variant, with its name and classes', () => {
    setup(linked());
    const row = screen.getByRole('button', { name: /Desktop/ });
    expect(row.textContent).toContain('Window: Expanded');
    expect(screen.queryByRole('button', { name: /Phone/ })).toBeNull();
  });

  it('a variant on another page shows the page name, and clicking opens that page and selects it', async () => {
    let p = createPage(linked(), { id: 'PG2', name: 'Tablet page' });
    p = moveRootsToPage(p, ['EXPANDED'], 'PG2');
    const { harness, user } = setup(p);
    const row = screen.getByRole('button', { name: /Desktop/ });
    expect(row.textContent).toContain('Tablet page');
    await user.click(row);
    expect(harness.context.session.page.openId()).toBe('PG2');
    expect(harness.ui.selection.value).toEqual({ kind: 'image', id: 'EXPANDED' });
  });

  it('Link to variant… lists the containers not in the group, the open page first, and links', async () => {
    let p = createPage(base(), { id: 'PG2', name: 'Other page' });
    p = moveRootsToPage(p, ['EXPANDED'], 'PG2');
    const { harness, user } = setup(p);
    await user.click(screen.getByRole('button', { name: t('variants.link') }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Lone'),
      expect.stringContaining('Desktop'),
    ]);
    expect(items[1]?.textContent).toContain('Other page');
    await user.click(items[1] as HTMLElement);
    expect(group(harness, 'COMPACT')).toBeTruthy();
    expect(group(harness, 'COMPACT')).toBe(group(harness, 'EXPANDED'));
  });

  it('Link to variant… leaves out the containers already in the group', async () => {
    const { user } = setup(linked());
    await user.click(screen.getByRole('button', { name: t('variants.link') }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Lone'),
    ]);
  });

  it('Link to variant… is disabled, with the hint, when there is no other container', () => {
    let p = emptyProject();
    p = addBackgroundContainer(p, {
      id: 'COMPACT',
      width: 400,
      height: 800,
      background: '#FFFFFF',
    });
    setup(p);
    const button = screen.getByRole('button', { name: t('variants.link') });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t('variants.linkEmpty'))).toBeTruthy();
  });

  it('Unlink only shows with variants and unlinks in one undo entry', async () => {
    const { harness, user } = setup(base());
    expect(screen.queryByRole('button', { name: t('variants.unlink') })).toBeNull();
    cleanup();
    const second = setup(linked());
    await second.user.click(screen.getByRole('button', { name: t('variants.unlink') }));
    expect(group(second.harness, 'COMPACT')).toBeUndefined();
    expect(group(second.harness, 'EXPANDED')).toBeUndefined();
    second.harness.store.undo();
    expect(group(second.harness, 'COMPACT')).toBeTruthy();
    void harness;
    void user;
  });

  it('Missing here lists the types the variants map, with the variant, and nothing when none is missing', () => {
    let p = linked();
    p = mark(p, 'EXPANDED', 'text', 1);
    setup(p);
    const line = screen.getByText(/Text/, { selector: '.variants-missing li' });
    expect(line.textContent).toBe(
      t('variants.missingItem', { type: 'Text', variant: 'Desktop' }),
    );
    cleanup();
    setup(p, 'EXPANDED');
    expect(screen.queryByText(t('variants.missing'))).toBeNull();
  });

  it('read-only disables Link and Unlink but keeps the navigation', async () => {
    const { harness, user } = setup(linked(), 'COMPACT', true);
    expect(
      (screen.getByRole('button', { name: t('variants.unlink') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: t('variants.link') }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const row = screen.getByRole('button', { name: /Desktop/ });
    expect((row as HTMLButtonElement).disabled).toBe(false);
    await user.click(row);
    expect(harness.ui.selection.value).toEqual({ kind: 'image', id: 'EXPANDED' });
    void within;
  });
});
