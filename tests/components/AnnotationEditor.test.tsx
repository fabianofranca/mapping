import { act, cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTypedAnnotation, createMarking, type Project } from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { IssueBadge } from '../../src/ui/AnnotationSummary';
import { sampleProject } from '../model/fixtures';
import { addChild, roleProject, withRoles } from '../model/roleFixtures';
import { cadastroProject, layerOf } from '../model/specFixtures';
import type { Json } from '../model/specV11Fixtures';
import { descriptionOf } from './describedBy';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(annotationId: string, project: Project = cadastroProject()) {
  const harness: Harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  const onShowLayer = vi.fn();
  renderLive(harness, (p) =>
    // As in the panel: once the annotation is deleted, the editor ceases to exist.
    p.annotations.some((a) => a.id === annotationId) ? (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={onGoToAnnotation}
        onShowLayer={onShowLayer}
        readOnly={harness.store.readOnly.value}
      />
    ) : null,
  );
  return { harness, onGoToAnnotation, onShowLayer, user: userEvent.setup() };
}

describe('AnnotationEditor — free annotation', () => {
  it('shows the name and the pairs of the annotation', () => {
    setup('AU');
    expect(screen.getByLabelText('Annotation name')).toHaveProperty('value', 'User');
    const keys = screen
      .getAllByLabelText('Key')
      .map((i) => (i as HTMLInputElement).value);
    const values = screen
      .getAllByLabelText('Value')
      .map((i) => (i as HTMLInputElement).value);
    expect(keys).toEqual(['name', 'age']);
    expect(values).toEqual(['string', 'number']);
  });

  it('renames the annotation on confirm', async () => {
    const { harness, user } = setup('AU');
    const name = screen.getByLabelText('Annotation name');
    await user.clear(name);
    await user.type(name, 'Customer{Enter}');
    expect(annotationOf(harness.project(), 'AU').name).toBe('Customer');
  });

  it('edits the value of a pair by the tuple id', async () => {
    const { harness, user } = setup('AU');
    const [, second] = screen.getAllByLabelText('Value');
    if (!second) throw new Error('no second pair');
    await user.clear(second);
    await user.type(second, 'integer{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => [e.id, e.key, e.value])).toEqual([
      ['EN', 'name', 'string'],
      ['EA', 'age', 'integer'],
    ]);
  });

  it('adds a new pair only once it has a key', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: '+ Pair' }));
    const keys = screen.getAllByLabelText('Key');
    expect(keys).toHaveLength(3);
    const key = keys[2];
    if (!key) throw new Error('no new field');
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);
    await user.type(key, 'email{Enter}');
    const entries = annotationOf(harness.project(), 'AU').entries;
    expect(entries.map((e) => e.key)).toEqual(['name', 'age', 'email']);
  });

  // Stage 6 (6.4), finding 4: Enter in the Key of a new pair saves and moves to the Value.
  it('Enter in the key of a new pair saves and puts the focus on the value', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: '+ Pair' }));
    const key = screen.getAllByLabelText('Key')[2];
    if (!key) throw new Error('no new field');
    await user.type(key, 'email{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
      'email',
    ]);
    expect(document.activeElement).toBe(screen.getAllByLabelText('Value')[2]);
    await user.type(document.activeElement as HTMLElement, 'string{Enter}');
    expect(annotationOf(harness.project(), 'AU').entries[2]?.value).toBe('string');
  });

  it('a repeated key shows the error and does not save', async () => {
    const { harness, user } = setup('AU');
    const [first] = screen.getAllByLabelText('Key');
    if (!first) throw new Error('no pair');
    await user.clear(first);
    await user.type(first, 'age{Enter}');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('reorders the pairs through the row ⋯ menu', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move pair down' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
      'EN',
    ]);
  });

  it('removes a pair without references directly, without confirmation', async () => {
    const { harness, user } = setup('AU');
    // EA has the reference from AII; remove through the new pair (no references).
    await user.click(screen.getByRole('button', { name: '+ Pair' }));
    const key = screen.getAllByLabelText('Key')[2];
    if (!key) throw new Error('no new field');
    await user.type(key, 'tmp{Enter}');
    await user.click(screen.getByRole('button', { name: 'Actions for pair tmp' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove pair' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'name',
      'age',
    ]);
  });

  it('removing a pair that is a reference target asks for confirmation', async () => {
    const { harness, user } = setup('AU');
    const removeFirst = async () => {
      await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
      await user.click(screen.getByRole('menuitem', { name: 'Remove pair' }));
    };
    await removeFirst();
    // Stage 8 (8.3), F10: destructive confirmation, announced as an alert.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('References will break')).toBeTruthy();
    // Cancel keeps the pair.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(annotationOf(harness.project(), 'AU').entries).toHaveLength(2);

    await removeFirst();
    const again = await screen.findByRole('alertdialog');
    await user.click(within(again).getByRole('button', { name: 'Delete' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.id)).toEqual([
      'EA',
    ]);
  });

  // UI code review (#954, item 17): the error belongs to the pair, not to the position.
  it('removing the pair with the error does not move the message to the pair that takes its place', async () => {
    const { harness, user } = setup('AU');
    const [first] = screen.getAllByLabelText('Key');
    if (!first) throw new Error('no key');
    await user.clear(first);
    await user.type(first, 'age{Enter}');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Actions for pair name' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove pair' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(annotationOf(harness.project(), 'AU').entries.map((e) => e.key)).toEqual([
      'age',
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen
        .getByLabelText('Key')
        .closest('[data-entry]')
        ?.getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('shows who references each pair and goes to the origin', async () => {
    const { onGoToAnnotation, user } = setup('AU');
    const backlink = screen.getAllByRole('button', { name: /^← / })[0];
    if (!backlink) throw new Error('no backlink');
    await user.click(backlink);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
    expect(onGoToAnnotation.mock.calls[0]?.[0]).toMatchObject({ id: 'AIN' });
  });

  it('read-only disables editing', () => {
    const harness = createHarness(cadastroProject(), true);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AU')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly
      />
    ));
    expect(screen.getByLabelText('Annotation name')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '+ Pair' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('AnnotationEditor — typed annotation', () => {
  it('shows the type fields and saves the value of a text field', async () => {
    const { harness, user } = setup('AB');
    const id = screen.getByLabelText('id');
    expect(id).toHaveProperty('value', 'btn_cadastrar');
    await user.clear(id);
    await user.type(id, 'btn_enviar{Enter}');
    expect(annotationOf(harness.project(), 'AB').values?.['id']).toBe('btn_enviar');
  });

  it('an empty required field appears as pending', async () => {
    setup('AT');
    expect(screen.getAllByTitle('required').length).toBeGreaterThan(0);
  });

  it('offers to link a child through the dialog (there is no direct "+ type" button)', async () => {
    const { harness, user, onGoToAnnotation } = setup('AB');
    const before = harness.project().annotations.length;
    expect(screen.queryByRole('button', { name: /^\+ onChange|^\+ onClick/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: '+ Link…' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    await user.click(
      within(dialog).getByRole('button', { name: /^onChange|^onClick/, hidden: true }),
    );
    expect(harness.project().annotations.length).toBe(before + 1);
    expect(onGoToAnnotation).toHaveBeenCalledOnce();
  });

  it('deleting an annotation that is a reference target asks for confirmation', async () => {
    const { harness, user } = setup('AU');
    await user.click(screen.getByRole('button', { name: 'Delete annotation' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(harness.project().annotations.some((a) => a.id === 'AU')).toBe(false);
  });
});

describe('AnnotationEditor — type description', () => {
  /** The specialization project with the description of the `button` type. */
  function withTypeDescription(): Project {
    const p = cadastroProject();
    return {
      ...p,
      specializations: p.specializations.map((entry) => ({
        ...entry,
        spec: entry.spec && {
          ...entry.spec,
          layers: entry.spec.layers.map((layer) => ({
            ...layer,
            annotationTypes: layer.annotationTypes.map((type) =>
              type.id === 'button' ? { ...type, description: 'Triggers an action.' } : type,
            ),
          })),
        },
      })),
    };
  }

  it('is an "About {type}" icon next to the type name, outside a button, with no fixed text', () => {
    setup('AB', withTypeDescription());
    expect(document.querySelector('.typed-description')).toBeNull();
    const help = screen.getByRole('button', { name: 'About Button' });
    expect(descriptionOf(help)).toBe('Triggers an action.');
    // A button inside a button is not allowed.
    expect(help.parentElement?.closest('button')).toBeNull();
    expect(help.closest('.annotation-header')).not.toBeNull();
  });

  it('a type without a description has no icon', () => {
    setup('AB');
    expect(screen.queryByRole('button', { name: 'About Button' })).toBeNull();
  });
});

describe('AnnotationEditor — "Linked to"', () => {
  const owner = () => screen.getByLabelText('Linked to') as HTMLSelectElement;

  it('the select carries the whole value in the title, so the truncation is undone on hover', async () => {
    const { user } = setup('A1', sampleProject());
    expect(owner().title).toBe('');
    await user.selectOptions(owner(), 'A2');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject, roleFixtures)
    expect(owner().title).toBe('Vidros: tipo: trinca');
  });

  it('explains that only annotations of the same marking in other layers appear', () => {
    // A1 (M1, layer L1) can belong to A2 (M1, layer L2).
    setup('A1', sampleProject());
    // The explanation is an icon with a tip; the text is the description of the icon and of the field.
    const help = screen.getByRole('button', { name: 'About Linked to' });
    expect(descriptionOf(help)).toBe(t('annotation.ownerHelp'));
    expect(descriptionOf(owner())).toBe(t('annotation.ownerHelp'));
    expect(document.querySelector('.props-note')).toBeNull();
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
    expect(owner().disabled).toBe(false);
    const options = [...owner().options].map((o) => o.textContent);
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject, roleFixtures)
    expect(options).toEqual(['None', 'Vidros: tipo: trinca']);
  });

  it('with no option, no owner and no requirement: the field does not appear', () => {
    // A3 is the only annotation of M2: there is no other layer with an annotation to be the owner.
    setup('A3', sampleProject());
    expect(screen.queryByLabelText('Linked to')).toBeNull();
    expect(screen.queryByRole('button', { name: 'About Linked to' })).toBeNull();
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
  });

  it('a type that requires an owner and has no option: the field appears disabled with the message', () => {
    let p = cadastroProject();
    p = createMarking(p, {
      id: 'MX',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 20, height: 20 },
      name: 'Loose',
    });
    p = addTypedAnnotation(p, {
      id: 'AY',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'button' },
      parentAnnotationId: null,
    });
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'eventos'),
      type: { specId: 'sdui', typeId: 'onClick' },
      parentAnnotationId: 'AY',
    });
    // Orphan, as after an external edit of the file: no owner and no one who could be it.
    p = {
      ...p,
      annotations: p.annotations
        .filter((a) => a.id !== 'AY')
        .map((a) => (a.id === 'AX' ? { ...a, parentAnnotationId: null } : a)),
    };
    setup('AX', p);
    expect(owner().disabled).toBe(true);
    expect(screen.getByText(t('annotation.ownerEmpty'))).toBeTruthy();
  });

  it('a stored owner that is no longer valid stays in the select, marked as invalid (code review #954, item 2)', () => {
    // A3 belongs to another marking (M2): it is not a valid owner of A1, but it is what is stored.
    const p = sampleProject();
    setup('A1', {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A1' ? { ...a, parentAnnotationId: 'A3' } : a,
      ),
    });
    expect(owner().value).toBe('A3');
    const selected = owner().selectedOptions[0];
    expect(selected?.textContent).toContain('(invalid owner)');
    expect([...owner().options].map((o) => o.value)).toContain('');
  });

  it('the pending badge uses the alert icon and keeps the accessible name (code review #954, items 3 and 4)', () => {
    let p = cadastroProject();
    p = createMarking(p, {
      id: 'MX',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 20, height: 20 },
      name: 'Loose',
    });
    p = addTypedAnnotation(p, {
      id: 'AY',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'button' },
      parentAnnotationId: null,
    });
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'MX',
      layerId: layerOf(p, 'sdui', 'eventos'),
      type: { specId: 'sdui', typeId: 'onClick' },
      parentAnnotationId: 'AY',
    });
    // Orphan: the owner disappears and the "no owner" pending item appears.
    p = {
      ...p,
      annotations: p.annotations
        .filter((a) => a.id !== 'AY')
        .map((a) => (a.id === 'AX' ? { ...a, parentAnnotationId: null } : a)),
    };
    const annotation = annotationOf(p, 'AX');
    const { container } = render(<IssueBadge project={p} annotation={annotation} />);
    const badge = screen.getByRole('img');
    expect(badge.getAttribute('aria-label')).toMatch(
      new RegExp(`^${t('issue.badge')}: `),
    );
    expect(badge.textContent).toBe('');
    expect(container.querySelector('svg.icon')).not.toBeNull();
  });

  it('an annotation with an owner keeps showing the field', () => {
    setup('AOC');
    expect(owner().value).toBe('AB');
  });

  it('the label has no title: the tip is the help icon', () => {
    setup('A1', sampleProject());
    expect(screen.getByText('Linked to').getAttribute('title')).toBeNull();
    expect(screen.getByRole('button', { name: 'About Linked to' })).toBeTruthy();
  });

  it('with an empty list but an owner already set, the field stays enabled', async () => {
    const { harness, user } = setup('A1', sampleProject());
    await user.selectOptions(owner(), 'A2');
    expect(annotationOf(harness.project(), 'A1').parentAnnotationId).toBe('A2');
    expect(screen.queryByText(t('annotation.ownerEmpty'))).toBeNull();
    // A2 now has A1 linked: nothing to choose, but it is not the empty list.
    expect(owner().disabled).toBe(false);
  });
});

describe('AnnotationEditor — role on the owner (decision 20)', () => {
  const role = (label = 'Trigger') => screen.getByLabelText(label) as HTMLSelectElement;
  const edit = (s: Json) => {
    withRoles(s);
    // `image` also accepts events, but does not offer roles.
    (s.layers[0].annotationTypes[1] as Json).allowedChildren = [{ layer: 'eventos' }];
  };
  const noLabel = (s: Json) => {
    withRoles(s);
    delete (s.layers[0].annotationTypes[0] as Json).childRolesLabel;
  };

  it('owner with roles: the Select carries the childRolesLabel label and the owner options', () => {
    setup('E1', addChild(roleProject(withRoles), 'E1', 'A1', 'click'));
    expect(role().value).toBe('click');
    expect([...role().options].map((o) => [o.value, o.textContent])).toEqual([
      // pt-BR kept: shared fixture data asserted by tests/model (sampleProject, roleFixtures)
      ['click', 'Clique'],
      // pt-BR kept: shared fixture data asserted by tests/model (sampleProject, roleFixtures)
      // pt-BR kept: shared fixture data asserted by tests/model (roleFixtures)
      ['hold', 'Pressionar'],
    ]);
    expect(screen.getByText('Trigger')).toBeTruthy();
  });

  it('without childRolesLabel the label is "Role"', () => {
    setup('E1', addChild(roleProject(noLabel), 'E1', 'A1', 'click'));
    expect(role('Role')).toBeTruthy();
  });

  it('owner without roles: the Select does not appear', () => {
    setup('E1', addChild(roleProject(), 'E1', 'A1', null));
    expect(screen.queryByLabelText('Trigger')).toBeNull();
    expect(screen.queryByLabelText('Role')).toBeNull();
  });

  it('without a role: "Choose…" and the pending item', () => {
    setup('E1', addChild(roleProject(withRoles), 'E1', 'A1', null));
    expect(role().value).toBe('');
    expect(role().options[0]?.textContent).toBe('Choose…');
    expect(role().getAttribute('aria-invalid')).toBe('true');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject, roleFixtures)
    expect(screen.getByText(/no Trigger \(choose Clique or Pressionar\)/)).toBeTruthy();
  });

  it('a role the owner does not offer: pending item', () => {
    const p = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    setup('E1', {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'E1' ? { ...a, parentRole: 'gone' } : a,
      ),
    });
    expect(screen.getByText('Trigger the owner does not offer')).toBeTruthy();
  });

  it('choosing saves the role, in a single undo entry', async () => {
    const { harness, user } = setup(
      'E1',
      addChild(roleProject(withRoles), 'E1', 'A1', null),
    );
    await user.selectOptions(role(), 'hold');
    expect(annotationOf(harness.project(), 'E1').parentRole).toBe('hold');
    expect(screen.queryByText(/no Trigger/)).toBeNull();
    act(() => {
      harness.store.undo();
    });
    expect(annotationOf(harness.project(), 'E1').parentRole).toBeNull();
  });

  it('switching to an owner that does not offer the role clears the role in the same entry', async () => {
    let p = addChild(roleProject(edit), 'E1', 'A1', 'hold');
    p = addTypedAnnotation(p, {
      id: 'IMG',
      markingId: 'M1',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'image' },
    });
    const { harness, user } = setup('E1', p);
    await user.selectOptions(screen.getByLabelText('Linked to'), 'IMG');
    const after = annotationOf(harness.project(), 'E1');
    expect(after.parentAnnotationId).toBe('IMG');
    expect(after.parentRole).toBeNull();
    expect(screen.queryByLabelText('Trigger')).toBeNull();
    act(() => {
      harness.store.undo();
    });
    const undone = annotationOf(harness.project(), 'E1');
    expect(undone.parentAnnotationId).toBe('A1');
    expect(undone.parentRole).toBe('hold');
  });
});
