import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
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
import { isToolWindowOpen, hideToolWindow } from '../../src/store/toolWindows';
import { specializationUpdateImpact, type Spec } from '../../src/model';
import { UpdateImpact } from '../../src/ui/UpdateImpact';
import { MemoryDirectory } from '../storage/memoryFs';
import {
  badgeType,
  buttonType,
  chipType,
  libProject,
  libSpec,
} from '../model/libraryMigrationFixtures';
import { emptyProject } from '../model/fixtures';
import { legacySduiText } from '../model/specFixtures';
import { createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const exampleText = (name: string) =>
  readFileSync(join(process.cwd(), 'examples', 'specs', `${name}.json`), 'utf8');

/** Versão do conteúdo do exemplo SDUI e quantas camadas ele cria (Componentes, Eventos e Telas). */
const SDUI_VERSION = (JSON.parse(exampleText('sdui')) as { version: number }).version;
const SDUI_LAYERS = 3;

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
async function dialogTitled(title: string, timeout = 1000): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title }, { timeout });
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
    await screen.findByText(
      new RegExp(`"SDUI" aplicada: ${SDUI_LAYERS} camada\\(s\\) criada\\(s\\)\\.`),
    );
    const p = harness.project();
    expect(p.specializations.map((s) => [s.id, s.version])).toEqual([
      ['sdui', SDUI_VERSION],
    ]);
    expect(p.layers.filter((l) => l.spec?.specId === 'sdui')).toHaveLength(SDUI_LAYERS);
    expect(screen.getByText(`v${SDUI_VERSION} · ${SDUI_LAYERS} camada(s)`)).toBeTruthy();
  });

  it('o resultado de uma operação bem-sucedida usa o aviso de sucesso', async () => {
    const { choose } = setup();
    choose(exampleText('sdui'));
    const notice = await screen.findByRole('status');
    expect(notice.classList.contains('notice-success')).toBe(true);
    expect(notice.closest('dialog')?.classList.contains('dialog-md')).toBe(true);
  });

  it('campo do tipo removido (codeRef): aplica sem ele e avisa quais foram ignorados', async () => {
    const { harness, choose } = setup();
    choose(legacySduiText());
    await screen.findByText(/"SDUI" aplicada/);
    const notice = screen
      .getAllByRole('status')
      .find((n) => n.textContent?.startsWith('Campos ignorados'));
    expect(notice?.textContent).toBe(
      'Campos ignorados: screen.implementacao. O tipo de campo "codeRef" saiu do formato; a especialização foi aplicada sem eles. Remova-os do arquivo.',
    );
    const screenType = harness
      .project()
      .specializations[0]?.spec?.layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'screen');
    expect(screenType?.fields.map((f) => f.key)).toEqual(['nome', 'rota']);
  });

  it('a atualização com o campo removido também avisa; a próxima escolha limpa o aviso', async () => {
    const { choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);
    expect(screen.queryByText(/^Campos ignorados/)).toBeNull();

    const legacy = JSON.parse(legacySduiText()) as { version: number };
    choose(JSON.stringify({ ...legacy, version: SDUI_VERSION + 1 }));
    const dialog = await dialogTitled('Atualizar "SDUI"?');
    await user.click(within(dialog).getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(`"SDUI" atualizada para a versão ${SDUI_VERSION + 1}.`);
    expect(screen.getByText(/^Campos ignorados: screen\.implementacao\./)).toBeTruthy();

    // Escolher outro arquivo limpa o aviso anterior.
    choose(withVersion('sdui', SDUI_VERSION + 2));
    await dialogTitled('Atualizar "SDUI"?');
    expect(screen.queryByText(/^Campos ignorados/)).toBeNull();
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
    expect(
      within(dialog).getByText(
        new RegExp(`já está no projeto na versão ${SDUI_VERSION}`),
      ),
    ).toBeTruthy();
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION);
  });

  it('versão maior: pede confirmação e atualiza', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/aplicada/);

    choose(withVersion('sdui', SDUI_VERSION + 1));
    const dialog = await dialogTitled('Atualizar "SDUI"?');
    expect(
      within(dialog).getByText(`Da versão ${SDUI_VERSION} para a ${SDUI_VERSION + 1}.`),
    ).toBeTruthy();
    // Cancelar não muda nada.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION);

    choose(withVersion('sdui', SDUI_VERSION + 1));
    const again = await dialogTitled('Atualizar "SDUI"?');
    await user.click(within(again).getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(`"SDUI" atualizada para a versão ${SDUI_VERSION + 1}.`);
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION + 1);
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
    // Etapa 8 (8.3), F10: confirmação destrutiva, anunciada como alerta.
    expect(dialog.getAttribute('role')).toBe('alertdialog');
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
    expect(p.layers.length).toBe(SDUI_LAYERS + 1); // + a camada livre inicial
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

// Pacote de biblioteca (v4): pasta ou zip, os três níveis e o contrato de versão (B2).
const PACKAGE_DIR = join(process.cwd(), 'examples', 'libraries', 'material3');

/** Caminho relativo ao pacote → texto (`.json`, `.md`) ou bytes, do Material 3 do repositório. */
function material3(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string, prefix: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
      else files.set(`${prefix}${e.name}`, readFileSync(join(dir, e.name), 'utf8'));
    }
  };
  walk(PACKAGE_DIR, '');
  return files;
}

/** A pasta em memória que o seletor falso devolve. */
async function memoryDir(files: ReadonlyMap<string, string>): Promise<MemoryDirectory> {
  const root = new MemoryDirectory('material3');
  for (const [path, text] of files) {
    const parts = path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = (await dir.getDirectoryHandle(part, { create: true })) as MemoryDirectory;
    }
    dir.files.set(parts.at(-1) ?? '', new Blob([text]));
  }
  return root;
}

async function zipOf(files: ReadonlyMap<string, string>, root = ''): Promise<File> {
  const zip = new JSZip();
  for (const [path, text] of files) zip.file(`${root}${path}`, text);
  return new File([await zip.generateAsync({ type: 'blob' })], 'pacote.zip');
}

/** Material 3 com a versão e um ajuste no JSON da especialização. */
function material3With(
  edit: (spec: {
    version: number;
    layers: { annotationTypes: { id: string }[] }[];
  }) => void,
): Map<string, string> {
  const files = material3();
  const spec = JSON.parse(files.get('material3.spec.json') ?? '{}');
  edit(spec);
  files.set('material3.spec.json', JSON.stringify(spec));
  return files;
}

function fakePicker(dir: MemoryDirectory | null) {
  Object.defineProperty(globalThis, 'showDirectoryPicker', {
    value: vi.fn(async () => {
      if (!dir) throw new DOMException('cancelado', 'AbortError');
      return dir;
    }),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'showDirectoryPicker');
});

describe('SpecsDialog: pacote da biblioteca', () => {
  const zipInput = () => {
    const input = document.querySelector<HTMLInputElement>('input[accept^=".zip"]');
    if (!input) throw new Error('sem input de zip');
    return input;
  };
  const chooseZip = (file: File) =>
    fireEvent.change(zipInput(), { target: { files: [file] } });
  const chooseDirectory = async (
    user: ReturnType<typeof userEvent.setup>,
    name = 'Aplicar pasta…',
  ) => {
    await user.click(screen.getByRole('button', { name }));
  };

  it('sem showDirectoryPicker só o zip aparece', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Aplicar pasta…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aplicar zip…' })).toBeTruthy();
  });

  it('pasta: valida (0 erros, 42 avisos), lista os avisos e aplica copiando o pacote', async () => {
    fakePicker(await memoryDir(material3()));
    const { harness, user } = setup();
    await chooseDirectory(user);
    const dialog = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText(/0 erro\(s\) e 42 aviso\(s\)\./)).toBeTruthy();
    expect(within(dialog).getByText(/Os avisos não impedem aplicar/)).toBeTruthy();
    // Os avisos vêm agrupados por arquivo e a lista rola sozinha.
    expect(
      within(dialog).getByRole('group', { name: 'Problemas do pacote' }),
    ).toBeTruthy();
    expect(within(dialog).getAllByText('aviso').length).toBe(42);
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/"Material Design 3 \(baseline\)" aplicada/);
    const entry = harness.project().specializations[0];
    expect(entry?.id).toBe('material3');
    expect(entry?.file).toBe('specs/material3/material3.spec.json');
  }, 60_000);

  it('seletor cancelado: nada acontece', async () => {
    fakePicker(null);
    const { harness, user } = setup();
    await chooseDirectory(user);
    expect(screen.queryByRole('heading', { name: /Pacote/ })).toBeNull();
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('zip com pasta-raiz única e zip sem raiz dão o mesmo resultado', async () => {
    for (const root of ['material3/', '']) {
      const { harness, view } = setup();
      chooseZip(await zipOf(material3(), root));
      const dialog = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
      expect(within(dialog).getByText(/0 erro\(s\) e 42 aviso\(s\)\./)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
      await screen.findByText(/aplicada/);
      expect(harness.project().specializations[0]?.file).toBe(
        'specs/material3/material3.spec.json',
      );
      view.unmount();
      cleanup();
    }
  }, 90_000);

  it('erro bloqueia: componente ausente desabilita Aplicar e o projeto não muda', async () => {
    const files = material3();
    files.delete('components/m3-button.json');
    const { harness, user } = setup();
    chooseZip(await zipOf(files));
    const dialog = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText(/Corrija os erros/)).toBeTruthy();
    expect(within(dialog).getAllByText('erro').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/components\/m3-button\.json/)).toBeTruthy();
    const apply = within(dialog).getByRole('button', { name: 'Aplicar' });
    expect(apply).toHaveProperty('disabled', true);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(harness.project().specializations).toHaveLength(0);
  }, 60_000);

  it('pacote sem especialização legível: erro claro e nada a aplicar', async () => {
    const { harness } = setup();
    chooseZip(await zipOf(new Map([['docs/leia-me.md', '# oi']])));
    const dialog = await dialogTitled('Pacote de especialização inválido');
    expect(within(dialog).getByText(/não tem uma especialização legível/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Aplicar' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('zip vazio: mensagem de erro', async () => {
    setup();
    chooseZip(await zipOf(new Map()));
    await screen.findByText('A pasta ou o zip não tem arquivos.');
  });

  it('arquivo .json v4 isolado é recusado: v4 pede o pacote', async () => {
    const { harness, choose } = setup();
    choose(material3().get('material3.spec.json') ?? '');
    const dialog = await dialogTitled('Arquivo de especialização inválido');
    expect(within(dialog).getByText(/precisa da pasta inteira/)).toBeTruthy();
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('atualizar com pacote: versão maior com contrato respeitado atualiza (passa `previous`)', async () => {
    const { harness, user } = setup();
    chooseZip(await zipOf(material3()));
    const first = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    await user.click(within(first).getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/aplicada/);

    // Mesma versão: nada a fazer.
    chooseZip(await zipOf(material3()));
    const nothing = await dialogTitled('Nada a fazer', 30_000);
    await user.click(within(nothing).getByRole('button', { name: 'Fechar' }));

    // Versão 2 só aditiva: atualiza.
    const next = material3With((spec) => {
      spec.version = 2;
    });
    expect(next.size).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Atualizar de zip…' }));
    chooseZip(await zipOf(next));
    const dialog = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText('Da versão 1 para a 2.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(/atualizada para a versão 2/);
    expect(harness.project().specializations[0]?.version).toBe(2);
  }, 120_000);

  it('atualizar com pacote: quebra sem migração é erro e bloqueia', async () => {
    const { harness, user } = setup();
    chooseZip(await zipOf(material3()));
    const first = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    await user.click(within(first).getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/aplicada/);

    const broken = material3With((spec) => {
      spec.version = 2;
      const layer = spec.layers[0];
      if (layer)
        layer.annotationTypes = layer.annotationTypes.filter((t) => t.id !== 'm3-chip');
    });
    chooseZip(await zipOf(broken));
    const dialog = await dialogTitled('Pacote "Material Design 3 (baseline)"', 30_000);
    expect(
      within(dialog).getAllByText(/m3-chip/, { selector: 'li' }).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: 'Atualizar' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(harness.project().specializations[0]?.version).toBe(1);
  }, 120_000);
});

// Impacto da atualização da biblioteca com migrações (B4): aditiva, passos, perdas e recusa.
function libNext(
  steps: Spec['migrations'] extends infer M ? NonNullable<M> : never,
  edit: (types: ReturnType<typeof buttonType>[]) => void = () => {},
): Spec {
  const button = buttonType();
  const types = [button];
  edit(types);
  return libSpec(
    2,
    { c: [...types, badgeType()], e: [chipType()] },
    { migrations: steps },
  );
}

const renameLabel = (spec: Spec): Spec => ({
  ...spec,
  layers: spec.layers.map((l) => ({
    ...l,
    annotationTypes: l.annotationTypes.map((t) =>
      t.id === 'button'
        ? {
            ...t,
            fields: t.fields.map((f) => (f.key === 'label' ? { ...f, key: 'title' } : f)),
          }
        : t,
    ),
  })),
});

function renderImpact(project: Project, spec: Spec) {
  const impact = specializationUpdateImpact(project, spec);
  return render(<UpdateImpact project={project} impact={impact} current={1} next={2} />);
}

describe('UpdateImpact: biblioteca com migrações', () => {
  const base = () =>
    libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 3 } },
      { id: 'B2', type: 'button', values: { label: 'Cancelar' } },
      { id: 'G1', type: 'badge', values: { text: 'novo' } },
    ]);

  it('aditiva: uma linha, sem lista de passos', () => {
    renderImpact(base(), libNext([]));
    expect(
      screen.getByText('Atualização aditiva: os dados ficam como estão.'),
    ).toBeTruthy();
    expect(screen.queryByText('Passos da migração')).toBeNull();
  });

  it('com passos: rótulo por operação e contagens', () => {
    const next = renameLabel(
      libNext([
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-field', type: 'button', from: 'label', to: 'title' }],
        },
      ]),
    );
    renderImpact(base(), next);
    expect(screen.getByText('Passos da migração')).toBeTruthy();
    expect(screen.getByText('Renomear o campo label → title em button')).toBeTruthy();
    expect(screen.getByText('2 anotação(ões), 2 valor(es)')).toBeTruthy();
    expect(screen.queryByText(/Atualização aditiva/)).toBeNull();
    expect(screen.queryByText(/Esta atualização apaga/)).toBeNull();
  });

  it('passo sem efeito neste projeto', () => {
    const next = libNext([
      {
        from: 1,
        to: 2,
        steps: [{ op: 'fill-field', type: 'chip', field: 'a', default: 'x' }],
      },
    ]);
    renderImpact(base(), next);
    expect(screen.getByText('Preencher a em chip com x')).toBeTruthy();
    expect(screen.getByText('nada a mudar neste projeto')).toBeTruthy();
  });

  it('perdas em destaque, total e por passo', () => {
    const next = libNext(
      [
        {
          from: 1,
          to: 2,
          steps: [
            { op: 'remove-field', type: 'button', field: 'size' },
            { op: 'remove-type', type: 'badge', mode: 'delete' },
          ],
        },
      ],
      (types) => {
        const [button] = types;
        if (button) button.fields = button.fields.filter((f) => f.key !== 'size');
      },
    );
    const spec: Spec = {
      ...next,
      layers: next.layers.map((l) => ({
        ...l,
        annotationTypes: l.annotationTypes.filter((t) => t.id !== 'badge'),
      })),
    };
    const { container } = renderImpact(base(), spec);
    const alert = container.querySelector('p.notice.notice-error');
    expect(alert?.textContent).toBe(
      'Esta atualização apaga 1 valor(es) e 1 anotação(ões).',
    );
    expect(screen.getByText(/campo size removido \(valor "3"\)/)).toBeTruthy();
    expect(screen.getByText(/anotação apagada/)).toBeTruthy();
    expect(screen.getByText('Remover o tipo badge (apagar as anotações)')).toBeTruthy();
  });

  it('recusada: lista o que falta e some a lista de passos', () => {
    const next = renameLabel(libNext([]));
    const { container } = renderImpact(base(), next);
    const alert = container.querySelector('div.notice.notice-error');
    expect(alert?.textContent).toContain('faltam migrações');
    expect(alert?.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(screen.queryByText('Passos da migração')).toBeNull();
  });
});

describe('SpecsDialog: atualizar biblioteca v4', () => {
  const chooseZip = (file: File) => {
    const input = document.querySelector<HTMLInputElement>('input[accept^=".zip"]');
    if (!input) throw new Error('sem input de zip');
    fireEvent.change(input, { target: { files: [file] } });
  };
  const pkg = (spec: Spec) =>
    new Map([
      [
        'lib.spec.json',
        JSON.stringify({
          ...spec,
          layers: spec.layers.map((l) => ({
            ...l,
            annotationTypes: l.annotationTypes.map((t) => ({
              ...t,
              fields: t.fields.map((f) =>
                f.type === 'table' ? { ...f, rowLabel: 'col' } : f,
              ),
            })),
          })),
        }),
      ],
    ]);
  const base = () =>
    libProject(libSpec(1), [{ id: 'G1', type: 'badge', values: { text: 'novo' } }]);

  beforeEach(() => hideToolWindow('incomplete'));

  it('com pendências: mostra a contagem, atualiza e abre Incompletas', async () => {
    const { harness, user } = setup(base());
    const next = libNext([
      { from: 1, to: 2, steps: [{ op: 'remove-type', type: 'badge', mode: 'convert' }] },
    ]);
    const spec: Spec = {
      ...next,
      layers: next.layers.map((l) => ({
        ...l,
        annotationTypes: l.annotationTypes.filter((t) => t.id !== 'badge'),
      })),
    };
    await user.click(screen.getByRole('button', { name: 'Atualizar de zip…' }));
    chooseZip(await zipOf(pkg(spec)));
    const dialog = await dialogTitled('Pacote "Lib"', 30_000);
    expect(within(dialog).getByText(/1 pendência\(s\) ficam/)).toBeTruthy();
    expect(isToolWindowOpen('incomplete')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(/1 pendência\(s\) em Incompletas/);
    expect(harness.project().specializations[0]?.version).toBe(2);
    expect(isToolWindowOpen('incomplete')).toBe(true);
  }, 60_000);

  it('recusada: o Atualizar fica desabilitado e a versão não muda', async () => {
    const { harness, user } = setup(base());
    const spec = renameLabel(libNext([]));
    await user.click(screen.getByRole('button', { name: 'Atualizar de zip…' }));
    chooseZip(await zipOf(pkg(spec)));
    const dialog = await dialogTitled('Pacote "Lib"', 30_000);
    expect(within(dialog).getByRole('button', { name: 'Atualizar' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(dialog).getByText(/faltam migrações/)).toBeTruthy();
    expect(harness.project().specializations[0]?.version).toBe(1);
  }, 60_000);
});
