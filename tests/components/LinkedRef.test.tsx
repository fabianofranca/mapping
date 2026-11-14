// `linkedRef` (SG2): the targets of the sibling `ref` in the suggestion list of the `string` field/column and the
// joint saving of text and `ref` (Details field and table cell).
import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { typeOfAnnotation, type JsonValue, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { TypedField } from '../../src/ui/TypedFields';
import { TypedForm } from '../../src/ui/TypedForm';
import { E1, R1, R2, build, type Raw } from '../model/refColumnFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

// pt-BR kept: shared fixture data asserted by tests/model, tests/store (refColumnFixtures: cpf, nome, termo and the `*Modelo` targets)
const FIXED = ['String', 'Int', 'cpf'];

/** Specialization v8: the `kind` field (links to `principal`) and the `nota` column (links to `alvo`). */
function edit(raw: Raw) {
  raw.formatVersion = 8;
  const list = raw.layers[1].annotationTypes[0];
  list.fields.push({
    key: 'kind',
    label: 'Kind',
    type: 'string',
    suggestions: FIXED,
    linkedRef: 'principal',
  });
  const note = list.fields[1].columns[0];
  note.label = 'Note';
  note.suggestions = FIXED;
  note.linkedRef = 'alvo';
}

function setup(fieldKey: 'kind' | 'alvos') {
  const harness = createHarness(build(1, edit));
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AL');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === fieldKey,
    );
    if (!field) throw new Error(`field ${fieldKey} does not exist`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={false}
        onGoToAnnotation={() => undefined}
      />
    );
  });
  return { harness, user: userEvent.setup() };
}

const values = (h: Harness) => annotationOf(h.project(), 'AL').values ?? {};
const row = (h: Harness) =>
  (values(h).alvos as Record<string, JsonValue>[])[0] as Record<string, JsonValue>;
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);
const pick = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const option = screen
    .getAllByRole('option')
    .find((o) => o.querySelector('.suggestion-label')?.textContent === label);
  if (!option) throw new Error(`no option ${label}`);
  await user.click(option);
};

describe.each([
  {
    name: 'Details field',
    key: 'kind' as const,
    label: 'Kind',
    refOf: (h: Harness) => values(h).principal,
    textOf: (h: Harness) => values(h).kind,
    presetRef: (h: Harness) => h.actions.setFieldValue('AL', 'principal', R2),
    presetText: (h: Harness, text: string) => h.actions.setFieldValue('AL', 'kind', text),
    targets: ['cpfModelo', 'nomeModelo', 'String', 'Int'],
  },
  {
    name: 'table cell',
    key: 'alvos' as const,
    label: 'Note (Row 1)',
    refOf: (h: Harness) => row(h).alvo,
    textOf: (h: Harness) => row(h).nota,
    presetRef: (h: Harness) => h.actions.setTableCell('AL', 'alvos', 'L1', 'alvo', R2),
    presetText: (h: Harness, text: string) =>
      h.actions.setTableCell('AL', 'alvos', 'L1', 'nota', text),
    targets: ['cpfModelo', 'nomeModelo', 'termofree', 'String', 'Int'],
  },
])(
  'linkedRef: $name',
  ({ key, label, refOf, textOf, presetRef, presetText, targets }) => {
    const field = () => screen.getByLabelText<HTMLInputElement>(label);

    it('(a) the list shows the targets before the fixed ones, with the type as secondary text', async () => {
      const { user } = setup(key);
      await user.click(field());
      expect(options()).toEqual(targets);
    });

    it('(b) choosing and confirming saves text and ref in one entry; one undo reverts both', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      // Choosing does not save.
      expect(textOf(harness)).toBeFalsy();
      expect(refOf(harness)).toBeFalsy();
      await user.keyboard('{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
      expect(harness.store.undo()).toBe(true);
      expect(textOf(harness) ?? null).toBeNull();
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(b) leaving the field also saves both', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.tab();
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(c) the label in the middle of a longer text still saves the ref', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'List<cp');
      await pick(user, 'cpf');
      expect(field().value).toBe('List<cpf');
      await user.keyboard('>{Enter}');
      expect(textOf(harness)).toBe('List<cpf>');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(d) Esc discards the text and the choice', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.keyboard('{Escape}');
      expect(field().value).toBe('');
      await user.tab();
      expect(textOf(harness) ?? null).toBeNull();
      expect(refOf(harness) ?? null).toBeNull();
      // The discarded choice does not come back in a following edit.
      await user.click(field());
      await user.keyboard('{Escape}cpf{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(e) typing the name by hand does not touch the ref, and erasing the text does not clear it', async () => {
      const { harness, user } = setup(key);
      presetRef(harness);
      await user.type(field(), 'cpf{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R2);
      await user.clear(field());
      await user.keyboard('{Enter}');
      expect(textOf(harness) ?? null).toBeNull();
      expect(refOf(harness)).toEqual(R2);
    });

    it('(f) choosing and then erasing the label saves only the text', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.clear(field());
      await user.type(field(), 'x{Enter}');
      expect(textOf(harness)).toBe('x');
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(g) choosing the target whose text is already the current value still saves the ref', async () => {
      const { harness, user } = setup(key);
      presetText(harness, 'cpf');
      await user.click(field());
      await user.keyboard('{End}{Control>} {/Control}');
      await pick(user, 'cpf');
      await user.keyboard('{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(h) a ref already filled with another target is replaced; the last choice wins', async () => {
      const { harness, user } = setup(key);
      presetRef(harness);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.keyboard(' ');
      await user.keyboard('{Control>} {/Control}');
      await pick(user, 'nome');
      await user.keyboard('{Enter}');
      expect(textOf(harness)).toBe('cpf nome');
      expect(refOf(harness)).toEqual(R2);
    });

    it('the list of chosen ones is reset after confirming', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.keyboard('{Enter}');
      presetRef(harness);
      await user.clear(field());
      await user.type(field(), 'cpf{Enter}');
      expect(refOf(harness)).toEqual(R2);
    });
  },
);

describe('linkedRef: free tuple target', () => {
  it('the cell accepts the free tuple and saves its ref', async () => {
    const { harness, user } = setup('alvos');
    await user.type(screen.getByLabelText('Note (Row 1)'), 'ter');
    await pick(user, 'termo');
    await user.keyboard('{Enter}');
    expect(row(harness).alvo).toEqual(E1);
  });
});

describe('linkedRef without a project', () => {
  const fields = () => {
    const annotation = annotationOf(build(1, edit), 'AL');
    const project = build(1, edit);
    return typeOfAnnotation(project, annotation)?.type.fields ?? [];
  };

  it('the Catalog form shows only the fixed suggestions', async () => {
    const project: Project = build(1, edit);
    expect(project).toBeTruthy();
    render(
      <TypedForm
        fields={fields().filter((f) => f.key === 'kind' || f.key === 'alvos')}
        values={{ alvos: [{ _id: 'L1', nota: '' }] }}
        onChange={() => undefined}
        readOnly={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Kind'));
    expect(options()).toEqual(FIXED);
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Note (Row 1)'));
    expect(options()).toEqual(FIXED);
  });

  it('read-only: no list', async () => {
    render(
      <TypedForm
        fields={fields().filter((f) => f.key === 'kind')}
        values={{}}
        onChange={() => undefined}
        readOnly
      />,
    );
    await userEvent.setup().click(screen.getByLabelText('Kind'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
