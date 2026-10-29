// `linkedRef` (SG2): os alvos do `ref` irmão na lista de sugestões do campo/coluna `string` e a
// gravação conjunta de texto e `ref` (campo dos Detalhes e célula de tabela).
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
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const FIXED = ['String', 'Int', 'cpf'];

/** Especialização v8: o campo `tipo` (liga a `principal`) e a coluna `nota` (liga a `alvo`). */
function edit(raw: Raw) {
  raw.formatVersion = 8;
  const lista = raw.layers[1].annotationTypes[0];
  lista.fields.push({
    key: 'tipo',
    label: 'Tipo',
    type: 'string',
    suggestions: FIXED,
    linkedRef: 'principal',
  });
  const nota = lista.fields[1].columns[0];
  nota.label = 'Nota';
  nota.suggestions = FIXED;
  nota.linkedRef = 'alvo';
}

function setup(fieldKey: 'tipo' | 'alvos') {
  const harness = createHarness(build(1, edit));
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AL');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find(
      (f) => f.key === fieldKey,
    );
    if (!field) throw new Error(`campo ${fieldKey} não existe`);
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
  if (!option) throw new Error(`sem opção ${label}`);
  await user.click(option);
};

describe.each([
  {
    name: 'campo dos Detalhes',
    key: 'tipo' as const,
    label: 'Tipo',
    refOf: (h: Harness) => values(h).principal,
    textOf: (h: Harness) => values(h).tipo,
    presetRef: (h: Harness) => h.actions.setFieldValue('AL', 'principal', R2),
    presetText: (h: Harness, text: string) => h.actions.setFieldValue('AL', 'tipo', text),
    targets: ['cpfModelo', 'nomeModelo', 'String', 'Int'],
  },
  {
    name: 'célula de tabela',
    key: 'alvos' as const,
    label: 'Nota (Linha 1)',
    refOf: (h: Harness) => row(h).alvo,
    textOf: (h: Harness) => row(h).nota,
    presetRef: (h: Harness) => h.actions.setTableCell('AL', 'alvos', 'L1', 'alvo', R2),
    presetText: (h: Harness, text: string) =>
      h.actions.setTableCell('AL', 'alvos', 'L1', 'nota', text),
    targets: ['cpfModelo', 'nomeModelo', 'termolivre', 'String', 'Int'],
  },
])(
  'linkedRef: $name',
  ({ key, label, refOf, textOf, presetRef, presetText, targets }) => {
    const field = () => screen.getByLabelText<HTMLInputElement>(label);

    it('(a) a lista mostra os alvos antes das fixas, com o tipo como texto secundário', async () => {
      const { user } = setup(key);
      await user.click(field());
      expect(options()).toEqual(targets);
    });

    it('(b) escolher e confirmar grava texto e ref numa entrada; um undo volta os dois', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      // Escolher não grava.
      expect(textOf(harness)).toBeFalsy();
      expect(refOf(harness)).toBeFalsy();
      await user.keyboard('{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
      expect(harness.store.undo()).toBe(true);
      expect(textOf(harness) ?? null).toBeNull();
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(b) sair do campo também grava os dois', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.tab();
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(c) o rótulo no meio de um texto maior ainda grava o ref', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'List<cp');
      await pick(user, 'cpf');
      expect(field().value).toBe('List<cpf');
      await user.keyboard('>{Enter}');
      expect(textOf(harness)).toBe('List<cpf>');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(d) Esc descarta o texto e a escolha', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.keyboard('{Escape}');
      expect(field().value).toBe('');
      await user.tab();
      expect(textOf(harness) ?? null).toBeNull();
      expect(refOf(harness) ?? null).toBeNull();
      // A escolha descartada não volta numa edição seguinte.
      await user.click(field());
      await user.keyboard('{Escape}cpf{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(e) digitar o nome à mão não mexe no ref, e apagar o texto não o limpa', async () => {
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

    it('(f) escolher e depois apagar o rótulo grava só o texto', async () => {
      const { harness, user } = setup(key);
      await user.type(field(), 'cp');
      await pick(user, 'cpf');
      await user.clear(field());
      await user.type(field(), 'x{Enter}');
      expect(textOf(harness)).toBe('x');
      expect(refOf(harness) ?? null).toBeNull();
    });

    it('(g) escolher o alvo cujo texto já é o valor atual ainda grava o ref', async () => {
      const { harness, user } = setup(key);
      presetText(harness, 'cpf');
      await user.click(field());
      await user.keyboard('{End}{Control>} {/Control}');
      await pick(user, 'cpf');
      await user.keyboard('{Enter}');
      expect(textOf(harness)).toBe('cpf');
      expect(refOf(harness)).toEqual(R1);
    });

    it('(h) um ref já preenchido com outro alvo é trocado; vale a última escolha', async () => {
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

    it('a lista de escolhidos é zerada depois de confirmar', async () => {
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

describe('linkedRef: alvo da tupla livre', () => {
  it('a célula aceita a tupla livre e grava o ref dela', async () => {
    const { harness, user } = setup('alvos');
    await user.type(screen.getByLabelText('Nota (Linha 1)'), 'ter');
    await pick(user, 'termo');
    await user.keyboard('{Enter}');
    expect(row(harness).alvo).toEqual(E1);
  });
});

describe('linkedRef sem projeto', () => {
  const fields = () => {
    const annotation = annotationOf(build(1, edit), 'AL');
    const project = build(1, edit);
    return typeOfAnnotation(project, annotation)?.type.fields ?? [];
  };

  it('o formulário do Catálogo mostra só as sugestões fixas', async () => {
    const project: Project = build(1, edit);
    expect(project).toBeTruthy();
    render(
      <TypedForm
        fields={fields().filter((f) => f.key === 'tipo' || f.key === 'alvos')}
        values={{ alvos: [{ _id: 'L1', nota: '' }] }}
        onChange={() => undefined}
        readOnly={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Tipo'));
    expect(options()).toEqual(FIXED);
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Nota (Linha 1)'));
    expect(options()).toEqual(FIXED);
  });

  it('somente leitura: sem lista', async () => {
    render(
      <TypedForm
        fields={fields().filter((f) => f.key === 'tipo')}
        values={{}}
        onChange={() => undefined}
        readOnly
      />,
    );
    await userEvent.setup().click(screen.getByLabelText('Tipo'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
