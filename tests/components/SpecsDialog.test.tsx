import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySpecialization,
  parseSpecText,
  removeLayer,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { SpecsDialog } from '../../src/ui/SpecsDialog';
import { emptyProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const exampleText = (name: string) =>
  readFileSync(join(process.cwd(), 'examples', 'specs', `${name}.json`), 'utf8');

/** Mesma especialização com a versão alterada. */
function withVersion(name: string, version: number): string {
  const spec = JSON.parse(exampleText(name)) as { version: number };
  return JSON.stringify({ ...spec, version });
}

/** Projeto com uma camada livre (L1). */
function freeProject(): Project {
  return emptyProject();
}

/** Projeto só com as camadas da especialização SDUI (sem nenhuma camada livre). */
function onlySpecLayers(): Project {
  const parsed = parseSpecText(exampleText('sdui'));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let n = 0;
  const applied = applySpecialization(emptyProject(), parsed.spec, {
    newId: () => `LS${++n}`,
  });
  return removeLayer(applied, 'L1');
}

function setup(project: Project = freeProject(), readOnly = false) {
  const harness: Harness = createHarness(project, readOnly);
  const onClose = vi.fn();
  const view = renderLive(harness, (p) => (
    <SpecsDialog project={p} readOnly={readOnly} onClose={onClose} />
  ));
  const fileInput = () => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('sem input de arquivo');
    return input;
  };
  /** Escolhe um arquivo no seletor (o diálogo usa um `<input type=file>` escondido). */
  const choose = (text: string, name = 'spec.json') =>
    fireEvent.change(fileInput(), {
      target: { files: [new File([text], name, { type: 'application/json' })] },
    });
  return { harness, onClose, view, choose, user: userEvent.setup() };
}

/** Diálogo de confirmação com o título dado (fica por cima do menu e aparece após ler o arquivo). */
async function dialogTitled(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title });
  const dialog = heading.closest('dialog');
  if (!dialog) throw new Error(`"${title}" não está num diálogo`);
  return dialog;
}

describe('SpecsDialog', () => {
  it('sem especializações mostra o aviso e o botão de aplicar', () => {
    setup();
    expect(screen.getByText('Nenhuma especialização aplicada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aplicar especialização…' })).toBeTruthy();
  });

  it('aplica uma especialização: cria as camadas e mostra a mensagem', async () => {
    const { harness, choose } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/"SDUI" aplicada: 2 camada\(s\) criada\(s\)\./);
    const p = harness.project();
    expect(p.specializations.map((s) => [s.id, s.version])).toEqual([['sdui', 1]]);
    expect(p.layers.filter((l) => l.spec?.specId === 'sdui')).toHaveLength(2);
    expect(screen.getByText('v1 · 2 camada(s)')).toBeTruthy();
  });

  it('o resultado de uma operação bem-sucedida usa o aviso de sucesso', async () => {
    const { choose } = setup();
    choose(exampleText('sdui'));
    const notice = await screen.findByRole('status');
    expect(notice.classList.contains('notice-success')).toBe(true);
    expect(notice.closest('dialog')?.classList.contains('dialog-md')).toBe(true);
  });

  it('arquivo inválido mostra os problemas e não altera o projeto', async () => {
    const { harness, choose } = setup();
    choose('{ "isto não é uma especialização": true }');
    const dialog = await dialogTitled('Arquivo de especialização inválido');
    expect(within(dialog).getByText(/Corrija o arquivo/)).toBeTruthy();
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('mesma versão: avisa que não há nada a fazer', async () => {
    const { harness, choose } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);
    choose(exampleText('sdui'));
    const dialog = await dialogTitled('Nada a fazer');
    expect(within(dialog).getByText(/já está no projeto na versão 1/)).toBeTruthy();
    expect(harness.project().specializations[0]?.version).toBe(1);
  });

  it('versão maior: pede confirmação e atualiza', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);

    choose(withVersion('sdui', 2));
    const dialog = await dialogTitled('Atualizar "SDUI"?');
    expect(within(dialog).getByText('Da versão 1 para a 2.')).toBeTruthy();
    // Cancelar não muda nada.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(harness.project().specializations[0]?.version).toBe(1);

    choose(withVersion('sdui', 2));
    const again = await dialogTitled('Atualizar "SDUI"?');
    await user.click(within(again).getByRole('button', { name: 'Atualizar' }));
    await screen.findByText('"SDUI" atualizada para a versão 2.');
    expect(harness.project().specializations[0]?.version).toBe(2);
  });

  it('"Atualizar versão" só aceita o arquivo da própria especialização', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Atualizar versão…' }));
    click.mockRestore();
    choose(exampleText('modelo-de-dados'));
    const dialog = await dialogTitled('Arquivo de especialização inválido');
    expect(
      within(dialog).getByText(/é da especialização "modelo-dados", não de "sdui"/),
    ).toBeTruthy();
    expect(harness.project().specializations.map((s) => s.id)).toEqual(['sdui']);
  });

  it('remover e converter: as camadas viram livres', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    const dialog = await dialogTitled('Remover "SDUI"?');
    const confirm = within(dialog).getByRole('button', { name: 'Converter' });
    expect(confirm).toHaveProperty('disabled', true); // precisa escolher o modo
    await user.click(
      within(dialog).getByRole('radio', { name: /Converter em camadas livres/ }),
    );
    await user.click(confirm);
    await screen.findByText('"SDUI" removida.');
    const p = harness.project();
    expect(p.specializations).toHaveLength(0);
    expect(p.layers.every((l) => l.spec === null)).toBe(true);
    expect(p.layers.length).toBe(3);
  });

  it('remover e apagar: as camadas da especialização somem', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    const dialog = await dialogTitled('Remover "SDUI"?');
    await user.click(within(dialog).getByRole('radio', { name: /Apagar dados/ }));
    await user.click(within(dialog).getAllByRole('button', { name: 'Apagar dados' })[0]!);
    await waitFor(() => expect(harness.project().specializations).toHaveLength(0));
    expect(harness.project().layers.map((l) => l.id)).toEqual(['L1']);
  });

  it('apagar dados fica bloqueado se só restarem camadas da especialização', async () => {
    const { harness, user } = setup(onlySpecLayers());
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    const dialog = await dialogTitled('Remover "SDUI"?');
    await user.click(within(dialog).getByRole('radio', { name: /Apagar dados/ }));
    expect(within(dialog).getByText(/precisa ter ao menos uma camada/)).toBeTruthy();
    expect(
      within(dialog).getAllByRole('button', { name: 'Apagar dados' })[0],
    ).toHaveProperty('disabled', true);
    expect(harness.project().specializations).toHaveLength(1);
  });

  it('somente leitura desabilita aplicar, atualizar e remover', () => {
    setup(onlySpecLayers(), true);
    for (const name of ['Aplicar especialização…', 'Atualizar versão…', 'Remover']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
  });

  it('Fechar chama onClose', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
