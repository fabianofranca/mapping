import { render, screen, cleanup, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAnnotation, addLayer, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { t } from '../../src/i18n';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { EditorContext } from '../../src/ui/EditorContext';
import { ListView } from '../../src/ui/ListView';
import { add, sameLayerProject } from '../model/sameLayerFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

// VC3: the same-layer link (formatVersion 13) in the interface. The resolver and
// `validAnnotationOwners` already decide; the interface only reads. These tests confirm that.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

/** A1 (button) › E1 (onClick) › R1 (request) › R2 (Sucesso), R3 (Falha), R4 (Sucesso). */
function chainProject(edit?: Parameters<typeof sameLayerProject>[1]): Project {
  let p = sameLayerProject(13, edit);
  p = add(p, 'A1', 'button');
  p = add(p, 'E1', 'onClick', 'A1');
  p = add(p, 'R1', 'request', 'E1');
  p = add(p, 'R2', 'request', 'R1', 'onSuccess');
  p = add(p, 'R3', 'request', 'R1', 'onFailure');
  p = add(p, 'R4', 'request', 'R1', 'onSuccess');
  return p;
}

function setup(project: Project, annotationId: string) {
  const harness = createHarness(project);
  renderLive(harness, (p) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, annotationId)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={vi.fn()}
      onShowLayer={vi.fn()}
      readOnly={false}
    />
  ));
  return { harness, user: userEvent.setup() };
}

const ownerSelect = () => screen.getByLabelText('Linked to') as HTMLSelectElement;
const ownerValues = () => [...ownerSelect().options].map((o) => o.value);
const children = (row: HTMLElement) => [...row.querySelectorAll('.link-button')];
const openDialog = () => document.querySelector('dialog') as HTMLElement;

describe('Link to … — owner event on the same layer', () => {
  it("offers the types of its own layer, including the owner's, and creates the child in the chosen role", async () => {
    const { harness, user } = setup(chainProject(), 'R1');
    const before = harness.project().annotations.length;
    const row = document.querySelector('[data-role-row="onFailure"]') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: '+ Link…' }));
    const dialog = openDialog();
    // pt-BR kept: shared fixture data asserted by tests/model (role name "Falha" of sameLayerFixtures)
    expect(
      within(dialog).getByRole('heading', { name: 'Link to Request › Falha' }),
    ).toBeTruthy();
    for (const name of [/^onClick/, /^navigate/]) {
      expect(within(dialog).getByRole('button', { name, hidden: true })).toBeTruthy();
    }
    await user.click(
      within(dialog).getByRole('button', { name: /^Request/, hidden: true }),
    );
    const project = harness.project();
    const created = project.annotations.at(-1);
    expect(project.annotations).toHaveLength(before + 1);
    expect(created?.type?.typeId).toBe('request');
    expect(created?.parentAnnotationId).toBe('R1');
    expect(created?.parentRole).toBe('onFailure');
    expect(created?.markingId).toBe('M1');
    expect(created?.layerId).toBe(annotationOf(project, 'R1').layerId);
  });
});

describe('Linked — owner event', () => {
  it('lists the children by role, in the array order', () => {
    setup(chainProject(), 'R1');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-role-row]')];
    expect(rows.map((r) => r.dataset.roleRow)).toEqual(['onSuccess', 'onFailure']);
    // pt-BR kept: shared fixture data asserted by tests/model (role names of sameLayerFixtures)
    expect(within(rows[0] as HTMLElement).getByText('Sucesso:')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Falha:')).toBeTruthy();
    expect(children(rows[0] as HTMLElement)).toHaveLength(2);
    expect(children(rows[1] as HTMLElement)).toHaveLength(1);
  });

  it('the two-level chain appears on each owner', () => {
    let p = chainProject();
    p = add(p, 'R5', 'request', 'R2', 'onFailure');
    const { harness } = setup(p, 'R2');
    const row = document.querySelector('[data-role-row="onFailure"]') as HTMLElement;
    expect(children(row)).toHaveLength(1);
    expect(
      harness.project().annotations.find((a) => a.id === 'R5')?.parentAnnotationId,
    ).toBe('R2');
    cleanup();
    setup(p, 'R1');
    const top = document.querySelector('[data-role-row="onSuccess"]') as HTMLElement;
    expect(children(top)).toHaveLength(2);
  });
});

describe('Linked to — owner on the same layer', () => {
  it('lists the owner of the same layer when the type accepts', () => {
    setup(chainProject(), 'R2');
    // R2 is a request: the whole events layer (R1, R3, R4) and the onClick (E1) accept request.
    expect(ownerValues()).toEqual(['', 'E1', 'R1', 'R3', 'R4']);
  });

  it('does not list the one that does not accept the type', () => {
    // Here the request only accepts navigate: a request cannot own another.
    let p = sameLayerProject(13, (s) => {
      s.layers[1].annotationTypes[1].allowedChildren = ['navigate'];
    });
    p = add(p, 'A1', 'button');
    p = add(p, 'E1', 'onClick', 'A1');
    p = add(p, 'R1', 'request', 'E1');
    p = add(p, 'R2', 'request', 'E1');
    setup(p, 'R2');
    expect(ownerValues()).toEqual(['', 'E1']);
  });

  it('on a free annotation, only those of other layers (decision 3)', () => {
    let p = addLayer(chainProject(), { id: 'LL', name: 'Free', color: '#abcdef' });
    p = addAnnotation(p, { id: 'F1', markingId: 'M1', layerId: 'LL', name: 'one' });
    p = addAnnotation(p, { id: 'F2', markingId: 'M1', layerId: 'LL', name: 'two' });
    setup(p, 'F2');
    const values = ownerValues();
    expect(values).toContain('R1');
    expect(values).toContain('A1');
    expect(values).not.toContain('F1');
  });

  it('the hint and the empty state say the typed one can have an owner of the same layer (pt-BR)', () => {
    locale.value = 'pt-BR';
    // pt-BR kept: the object of the test is the Portuguese dictionary text
    expect(t('annotation.ownerHelp')).toBe(
      'Só aparecem anotações desta mesma marcação. Nas tipadas, a dona pode ser de outra camada ou da mesma, quando o tipo dela aceita este; nas livres, só de outras camadas.',
    );
    expect(t('annotation.ownerEmpty')).toBe(
      'Nenhuma opção: crie, nesta marcação, uma anotação cujo tipo aceite esta (nas livres, em outra camada) para poder vincular esta a ela.',
    );
  });

  it('the same texts in English (en-US)', () => {
    locale.value = 'en-US';
    expect(t('annotation.ownerHelp')).toBe(
      'Only annotations of this same marking appear. For typed ones the owner can be in another layer or in the same one, when its type accepts this one; free ones only link to other layers.',
    );
    expect(t('annotation.ownerEmpty')).toBe(
      'No options: create an annotation on this marking whose type accepts this one (for free ones, in another layer) so you can link this one to it.',
    );
  });
});

describe('List — child of the same layer', () => {
  it('shows "↳ of …" with the role, as it does for the other layer\'s', () => {
    const harness = createHarness(chainProject());
    render(
      <EditorContext.Provider value={harness.context}>
        <ListView onSelect={vi.fn()} />
      </EditorContext.Provider>,
    );
    const owned = [...document.querySelectorAll('.list-linked')].map(
      (e) => e.textContent,
    );
    expect(owned.some((x) => /^↳ of .*\(Sucesso\)$/.test(x ?? ''))).toBe(true);
    expect(owned.some((x) => /^↳ of .*\(Falha\)$/.test(x ?? ''))).toBe(true);
    // E1 is on another layer than A1 and appears the same, without a role.
    expect(owned.filter((x) => /^↳ of [^(]*$/.test(x ?? '')).length).toBeGreaterThan(0);
  });
});
