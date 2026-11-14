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
import { EditorContext } from '../../src/ui/EditorContext';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { closeToolWindow } from '../../src/ui/toolWindowLayout';
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
  locale.value = 'en-US';
});
afterEach(cleanup);

const exampleText = (name: string) =>
  readFileSync(join(process.cwd(), 'examples', 'specs', `${name}.json`), 'utf8');

/** Version of the SDUI example content and how many layers it creates (Components, Events and Screens). */
const SDUI_VERSION = (JSON.parse(exampleText('sdui')) as { version: number }).version;
const SDUI_LAYERS = 3;

/** The same specialization with the version changed. */
function withVersion(name: string, version: number): string {
  const spec = JSON.parse(exampleText(name)) as { version: number };
  return JSON.stringify({ ...spec, version });
}

/** Project with a free layer (L1). */
function freeProject(): Project {
  return emptyProject();
}

/** Project with only the layers of the SDUI specialization (no free layer). */
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
    if (!input) throw new Error('no file input');
    return input;
  };
  /** Chooses a file in the picker (the dialog uses a hidden `<input type=file>`). */
  const choose = (text: string, name = 'spec.json') =>
    fireEvent.change(fileInput(), {
      target: { files: [new File([text], name, { type: 'application/json' })] },
    });
  return { harness, onClose, view, choose, user: userEvent.setup() };
}

/** Confirmation dialog with the given title (it stays above the menu and shows after reading the file). */
async function dialogTitled(title: string, timeout = 1000): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title }, { timeout });
  const dialog = heading.closest('dialog');
  if (!dialog) throw new Error(`"${title}" is not in a dialog`);
  return dialog;
}

describe('SpecsDialog', () => {
  it('shows the modes, the tokens and the icon set of the library (decision 16)', () => {
    const spec = libSpec(
      1,
      { c: [buttonType()] },
      {
        formatVersion: 15,
        tokens: {
          modes: ['light', 'dark'],
          values: { primary: { light: '#1a73e8', dark: '#8ab4f8' }, radius: 8 },
        },
        icons: 'icons/set.json',
      },
    );
    let n = 0;
    setup(applySpecialization(emptyProject(), spec, { newId: () => `LS${++n}` }));
    const item = document.querySelector<HTMLElement>('.spec-item');
    expect(item).not.toBeNull();
    const design = within(item!).getByRole('group', { name: 'Drawing tokens' });
    expect(within(design).getByText('light, dark')).toBeTruthy();
    expect(within(design).getByText('primary')).toBeTruthy();
    expect(within(design).getByText('light #1a73e8 · dark #8ab4f8')).toBeTruthy();
    expect(within(design).getByText('radius')).toBeTruthy();
    expect(within(design).getByText('8')).toBeTruthy();
    expect(within(design).getByText('icons/set.json')).toBeTruthy();
  });

  it('a library without tokens or icons does not show the block', () => {
    let n = 0;
    setup(applySpecialization(emptyProject(), libSpec(1), { newId: () => `LS${++n}` }));
    expect(screen.queryByRole('group', { name: 'Drawing tokens' })).toBeNull();
  });

  it('without specializations shows the notice and the apply button', () => {
    setup();
    expect(screen.getByText('No specialization applied.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply specialization…' })).toBeTruthy();
  });

  it('applies a specialization: creates the layers and shows the message', async () => {
    const { harness, choose } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(
      new RegExp(`"SDUI" applied: ${SDUI_LAYERS} layer\\(s\\) created\\.`),
    );
    const p = harness.project();
    expect(p.specializations.map((s) => [s.id, s.version])).toEqual([
      ['sdui', SDUI_VERSION],
    ]);
    expect(p.layers.filter((l) => l.spec?.specId === 'sdui')).toHaveLength(SDUI_LAYERS);
    expect(screen.getByText(`v${SDUI_VERSION} · ${SDUI_LAYERS} layer(s)`)).toBeTruthy();
  });

  it('the result of a successful operation uses the success notice', async () => {
    const { choose } = setup();
    choose(exampleText('sdui'));
    const notice = await screen.findByRole('status');
    expect(notice.classList.contains('notice-success')).toBe(true);
    expect(notice.closest('dialog')?.classList.contains('dialog-md')).toBe(true);
  });

  it('a field of the removed type (codeRef): applies without it and says which were ignored', async () => {
    const { harness, choose } = setup();
    choose(legacySduiText());
    await screen.findByText(/"SDUI" applied/);
    const notice = screen
      .getAllByRole('status')
      .find((n) => n.textContent?.startsWith('Ignored fields'));
    expect(notice?.textContent).toBe(
      'Ignored fields: screen.implementacao. The "codeRef" field type was removed from the format; the specialization was applied without them. Remove them from the file.',
    );
    const screenType = harness
      .project()
      .specializations[0]?.spec?.layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'screen');
    expect(screenType?.fields.map((f) => f.key)).toEqual(['nome', 'rota']);
  });

  it('the update with the removed field also warns; the next choice clears the notice', async () => {
    const { choose, user } = setup();
    // Starts from the legacy SDUI at the current version (the example one, v11, requires migration to the legacy one).
    const legacy = JSON.parse(legacySduiText()) as { version: number };
    choose(JSON.stringify({ ...legacy, version: SDUI_VERSION }));
    await screen.findByText(/applied/);

    choose(JSON.stringify({ ...legacy, version: SDUI_VERSION + 1 }));
    const dialog = await dialogTitled('Update "SDUI"?');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await screen.findByText(`"SDUI" updated to version ${SDUI_VERSION + 1}.`);
    expect(screen.getByText(/^Ignored fields: screen\.implementacao\./)).toBeTruthy();

    // Choosing another file clears the previous notice.
    choose(withVersion('sdui', SDUI_VERSION + 2));
    await dialogTitled('Update "SDUI"?');
    expect(screen.queryByText(/^Ignored fields/)).toBeNull();
  });

  it('an invalid file shows the problems and does not change the project', async () => {
    const { harness, choose } = setup();
    choose('{ "this is not a specialization": true }');
    const dialog = await dialogTitled('Invalid specialization file');
    expect(within(dialog).getByText(/Fix the file/)).toBeTruthy();
    expect(harness.project().specializations).toHaveLength(0);
  });

  describe('example with text in a table field', () => {
    const tableExample = JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'tabs',
      name: 'Tabs',
      version: 1,
      layers: [
        {
          id: 'ui',
          name: 'UI',
          color: '#112233',
          annotationTypes: [
            {
              id: 'tabs',
              name: 'Tabs',
              fields: [
                { key: 'rows', type: 'table', columns: [{ key: 'c', type: 'string' }] },
              ],
              examples: [{ name: 'Example', values: { rows: 'text' } }],
            },
          ],
        },
      ],
    });

    // pt-BR kept: the pt-BR rendering of the model message is the object of the test
    it('in Portuguese (pt-BR), the problem comes out translated with the path', async () => {
      locale.value = 'pt-BR';
      const { harness, choose } = setup();
      choose(tableExample);
      const dialog = await dialogTitled('Arquivo de especialização inválido');
      expect(
        within(dialog).getByText(
          // pt-BR kept: the pt-BR translation of the model message is the object of the test
          'layers[0].annotationTypes[0].examples[0].values.rows: campo "table" aceita só a lista de linhas',
        ),
      ).toBeTruthy();
      expect(harness.project().specializations).toHaveLength(0);
    });

    it('in English (US), the problem comes out in the app language', async () => {
      locale.value = 'en-US';
      const { choose } = setup();
      choose(tableExample);
      const dialog = await dialogTitled('Invalid specialization file');
      expect(
        within(dialog).getByText(
          'layers[0].annotationTypes[0].examples[0].values.rows: a "table" field takes only the list of rows',
        ),
      ).toBeTruthy();
      // pt-BR kept: checks that the pt-BR text does not leak into en-US
      expect(within(dialog).queryByText(/aceita só a lista/)).toBeNull();
    });
  });

  it('same version: says there is nothing to do', async () => {
    const { harness, choose } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/applied/);
    choose(exampleText('sdui'));
    const dialog = await dialogTitled('Nothing to do');
    expect(
      within(dialog).getByText(
        new RegExp(`is already in the project at version ${SDUI_VERSION}`),
      ),
    ).toBeTruthy();
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION);
  });

  it('higher version: asks for confirmation and updates', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/applied/);

    choose(withVersion('sdui', SDUI_VERSION + 1));
    const dialog = await dialogTitled('Update "SDUI"?');
    expect(
      within(dialog).getByText(`From version ${SDUI_VERSION} to ${SDUI_VERSION + 1}.`),
    ).toBeTruthy();
    // Cancel changes nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION);

    choose(withVersion('sdui', SDUI_VERSION + 1));
    const again = await dialogTitled('Update "SDUI"?');
    await user.click(within(again).getByRole('button', { name: 'Update' }));
    await screen.findByText(`"SDUI" updated to version ${SDUI_VERSION + 1}.`);
    expect(harness.project().specializations[0]?.version).toBe(SDUI_VERSION + 1);
  });

  it('"Update version" only accepts the file of the specialization itself', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/applied/);
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Update version…' }));
    click.mockRestore();
    choose(exampleText('modelo-de-dados'));
    const dialog = await dialogTitled('Invalid specialization file');
    expect(
      within(dialog).getByText(/is for specialization "modelo-dados", not "sdui"/),
    ).toBeTruthy();
    expect(harness.project().specializations.map((s) => s.id)).toEqual(['sdui']);
  });

  it('remove and convert: the layers become free', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/applied/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await dialogTitled('Remove "SDUI"?');
    // Stage 8 (8.3), F10: destructive confirmation, announced as an alert.
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Convert' });
    expect(confirm).toHaveProperty('disabled', true); // must choose the mode
    await user.click(
      within(dialog).getByRole('radio', { name: /Convert to free layers/ }),
    );
    await user.click(confirm);
    await screen.findByText('"SDUI" removed.');
    const p = harness.project();
    expect(p.specializations).toHaveLength(0);
    expect(p.layers.every((l) => l.spec === null)).toBe(true);
    expect(p.layers.length).toBe(SDUI_LAYERS + 1); // + the initial free layer
  });

  it('remove and delete: the specialization layers disappear', async () => {
    const { harness, choose, user } = setup();
    choose(exampleText('sdui'));
    await screen.findByText(/applied/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await dialogTitled('Remove "SDUI"?');
    await user.click(within(dialog).getByRole('radio', { name: /Delete data/ }));
    await user.click(within(dialog).getAllByRole('button', { name: 'Delete data' })[0]!);
    await waitFor(() => expect(harness.project().specializations).toHaveLength(0));
    expect(harness.project().layers.map((l) => l.id)).toEqual(['L1']);
  });

  it('delete data is blocked if only specialization layers remain', async () => {
    const { harness, user } = setup(onlySpecLayers());
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await dialogTitled('Remove "SDUI"?');
    await user.click(within(dialog).getByRole('radio', { name: /Delete data/ }));
    expect(within(dialog).getByText(/needs at least one layer/)).toBeTruthy();
    expect(
      within(dialog).getAllByRole('button', { name: 'Delete data' })[0],
    ).toHaveProperty('disabled', true);
    expect(harness.project().specializations).toHaveLength(1);
  });

  it('read-only disables apply, update and remove', () => {
    setup(onlySpecLayers(), true);
    for (const name of ['Apply specialization…', 'Update version…', 'Remove']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
  });

  it('Close calls onClose', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// Library package (v4): folder or zip, the three levels and the version contract (B2).
const PACKAGE_DIR = join(process.cwd(), 'tests', 'fixtures', 'material3');

/** Path relative to the package → text (`.json`, `.md`) or bytes, from the repository's Material 3. */
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

/** The in-memory folder that the fake picker returns. */
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
  return new File([await zip.generateAsync({ type: 'blob' })], 'package.zip');
}

/** Material 3 with the version and an adjustment in the specialization JSON. */
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
      if (!dir) throw new DOMException('cancelled', 'AbortError');
      return dir;
    }),
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'showDirectoryPicker');
});

describe('SpecsDialog: library package', () => {
  const zipInput = () => {
    const input = document.querySelector<HTMLInputElement>('input[accept^=".zip"]');
    if (!input) throw new Error('no zip input');
    return input;
  };
  const chooseZip = (file: File) =>
    fireEvent.change(zipInput(), { target: { files: [file] } });
  const chooseDirectory = async (
    user: ReturnType<typeof userEvent.setup>,
    name = 'Apply folder…',
  ) => {
    await user.click(screen.getByRole('button', { name }));
  };

  it('without showDirectoryPicker only the zip shows', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Apply folder…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Apply zip…' })).toBeTruthy();
  });

  it('folder: validates (0 errors, 2 warnings), lists the warnings and applies by copying the package', async () => {
    fakePicker(await memoryDir(material3()));
    const { harness, user } = setup();
    await chooseDirectory(user);
    const dialog = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText(/0 error\(s\) and 2 warning\(s\)\./)).toBeTruthy();
    expect(within(dialog).getByText(/Warnings do not prevent applying/)).toBeTruthy();
    // The warnings come grouped by file and the list scrolls by itself.
    expect(within(dialog).getByRole('group', { name: 'Package issues' })).toBeTruthy();
    expect(within(dialog).getAllByText('warning').length).toBe(2);
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await screen.findByText(/"Material Design 3 \(baseline\)" applied/);
    const entry = harness.project().specializations[0];
    expect(entry?.id).toBe('material3');
    expect(entry?.file).toBe('specs/material3/material3.spec.json');
  }, 60_000);

  it('cancelled picker: nothing happens', async () => {
    fakePicker(null);
    const { harness, user } = setup();
    await chooseDirectory(user);
    expect(screen.queryByRole('heading', { name: /Package/ })).toBeNull();
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('a zip with a single root folder and a zip without a root give the same result', async () => {
    for (const root of ['material3/', '']) {
      const { harness, view } = setup();
      chooseZip(await zipOf(material3(), root));
      const dialog = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
      expect(within(dialog).getByText(/0 error\(s\) and 2 warning\(s\)\./)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
      await screen.findByText(/applied/);
      expect(harness.project().specializations[0]?.file).toBe(
        'specs/material3/material3.spec.json',
      );
      view.unmount();
      cleanup();
    }
  }, 90_000);

  it('an error blocks: a missing component disables Apply and the project does not change', async () => {
    const files = material3();
    files.delete('components/m3-button.json');
    const { harness, user } = setup();
    chooseZip(await zipOf(files));
    const dialog = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText(/Fix the errors/)).toBeTruthy();
    expect(within(dialog).getAllByText('error').length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/components\/m3-button\.json/)).toBeTruthy();
    const apply = within(dialog).getByRole('button', { name: 'Apply' });
    expect(apply).toHaveProperty('disabled', true);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(harness.project().specializations).toHaveLength(0);
  }, 60_000);

  it('package without a readable specialization: clear error and nothing to apply', async () => {
    const { harness } = setup();
    chooseZip(await zipOf(new Map([['docs/readme.md', '# hi']])));
    const dialog = await dialogTitled('Invalid specialization package');
    expect(within(dialog).getByText(/has no readable specialization/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('empty zip: error message', async () => {
    setup();
    chooseZip(await zipOf(new Map()));
    await screen.findByText('The folder or zip has no files.');
  });

  it('a v4 .json file without package files stands alone: applies and writes specs/<id>.json', async () => {
    const { harness, choose } = setup();
    // The SDUI of `tests/fixtures/sdui-v2.json` (without `repo`) declared as formatVersion 4: no package key.
    const raw = JSON.parse(readFileSync('tests/fixtures/sdui-v2.json', 'utf8')) as object;
    choose(JSON.stringify({ ...raw, formatVersion: 4 }));
    await screen.findByText(/"SDUI" applied/);
    const entry = harness.project().specializations[0];
    expect(entry?.file).toBe('specs/sdui.json');
  });

  it('a v4 .json file that refers to package files is refused', async () => {
    const { harness, choose } = setup();
    choose(material3().get('material3.spec.json') ?? '');
    const dialog = await dialogTitled('Invalid specialization file');
    expect(within(dialog).getByText(/needs the whole folder/)).toBeTruthy();
    expect(harness.project().specializations).toHaveLength(0);
  });

  it('updating with a package: a higher version with the contract respected updates (passes `previous`)', async () => {
    const { harness, user } = setup();
    chooseZip(await zipOf(material3()));
    const first = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    await user.click(within(first).getByRole('button', { name: 'Apply' }));
    await screen.findByText(/applied/);

    // Same version: nothing to do.
    chooseZip(await zipOf(material3()));
    const nothing = await dialogTitled('Nothing to do', 30_000);
    await user.click(within(nothing).getByRole('button', { name: 'Close' }));

    // Version 2 only additive: updates.
    const next = material3With((spec) => {
      spec.version = 2;
    });
    expect(next.size).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Update from zip…' }));
    chooseZip(await zipOf(next));
    const dialog = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    expect(within(dialog).getByText('From version 1 to 2.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await screen.findByText(/updated to version 2/);
    expect(harness.project().specializations[0]?.version).toBe(2);
  }, 120_000);

  it('updating with a package: a break without migration is an error and blocks', async () => {
    const { harness, user } = setup();
    chooseZip(await zipOf(material3()));
    const first = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    await user.click(within(first).getByRole('button', { name: 'Apply' }));
    await screen.findByText(/applied/);

    const broken = material3With((spec) => {
      spec.version = 2;
      const layer = spec.layers[0];
      if (layer)
        layer.annotationTypes = layer.annotationTypes.filter((t) => t.id !== 'm3-chip');
    });
    chooseZip(await zipOf(broken));
    const dialog = await dialogTitled('Package "Material Design 3 (baseline)"', 30_000);
    expect(
      within(dialog).getAllByText(/m3-chip/, { selector: 'li' }).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: 'Update' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(harness.project().specializations[0]?.version).toBe(1);
  }, 120_000);
});

// Impact of the library update with migrations (B4): additive, steps, losses and refusal.
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

describe('UpdateImpact: library with migrations', () => {
  const base = () =>
    libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 3 } },
      { id: 'B2', type: 'button', values: { label: 'Cancel' } },
      { id: 'G1', type: 'badge', values: { text: 'new' } },
    ]);

  it('additive: one line, no step list', () => {
    renderImpact(base(), libNext([]));
    expect(screen.getByText('Additive update: the data stays as it is.')).toBeTruthy();
    expect(screen.queryByText('Migration steps')).toBeNull();
  });

  it('with steps: label per operation and counts', () => {
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
    expect(screen.getByText('Migration steps')).toBeTruthy();
    expect(screen.getByText('Rename field label → title in button')).toBeTruthy();
    expect(screen.getByText('2 annotation(s), 2 value(s)')).toBeTruthy();
    expect(screen.queryByText(/Additive update/)).toBeNull();
    expect(screen.queryByText(/This update deletes/)).toBeNull();
  });

  it('step with no effect in this project', () => {
    const next = libNext([
      {
        from: 1,
        to: 2,
        steps: [{ op: 'fill-field', type: 'chip', field: 'a', default: 'x' }],
      },
    ]);
    renderImpact(base(), next);
    expect(screen.getByText('Fill a in chip with x')).toBeTruthy();
    expect(screen.getByText('nothing to change in this project')).toBeTruthy();
  });

  it('losses highlighted, total and per step', () => {
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
      'This update deletes 1 value(s) and 1 annotation(s).',
    );
    expect(screen.getByText(/field size removed \(value "3"\)/)).toBeTruthy();
    expect(screen.getByText(/annotation deleted/)).toBeTruthy();
    expect(screen.getByText('Remove type badge (delete the annotations)')).toBeTruthy();
  });

  it('refused: lists what is missing and the step list disappears', () => {
    const next = renameLabel(libNext([]));
    const { container } = renderImpact(base(), next);
    const alert = container.querySelector('div.notice.notice-error');
    expect(alert?.textContent).toContain('declared migrations are missing');
    expect(alert?.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(screen.queryByText('Migration steps')).toBeNull();
  });
});

// Link role steps in the update dialog (stage #557, decision 11).
const ROLE_LIST = [
  { id: 'click', name: 'Click' },
  { id: 'hover', name: 'Focus' },
];

function roleLib(version: number, roles = ROLE_LIST, over: Partial<Spec> = {}): Spec {
  return libSpec(
    version,
    {
      c: [buttonType({ allowedChildren: ['chip'], childRoles: roles })],
      e: [chipType()],
    },
    { formatVersion: version === 1 ? 4 : 12, ...over },
  );
}

const roleBase = () =>
  libProject(roleLib(1), [
    { id: 'B1', type: 'button' },
    { id: 'C1', type: 'chip', parent: 'B1', role: 'click' },
    { id: 'C2', type: 'chip', parent: 'B1', role: 'hover' },
    { id: 'C3', type: 'chip', parent: 'B1' },
  ]);

const roleNext = (
  steps: NonNullable<Spec['migrations']>[number]['steps'],
  roles = ROLE_LIST,
) => roleLib(2, roles, { migrations: [{ from: 1, to: 2, steps }] });

// pt-BR kept: the pt-BR rendering of the role-step labels and losses is the object of this block
describe('UpdateImpact: role steps (pt-BR)', () => {
  beforeEach(() => {
    locale.value = 'pt-BR';
  });

  it('rename-role: label and count, no loss', () => {
    const { container } = renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'rename-role', type: 'button', from: 'click', to: 'hover' }],
        [{ id: 'hover', name: 'Focus' }],
      ),
    );
    expect(screen.getByText('Renomear o papel click → hover em button')).toBeTruthy();
    expect(screen.getByText('1 anotação(ões)')).toBeTruthy();
    expect(container.querySelector('p.notice.notice-error')).toBeNull();
  });

  it('remove-role with clear: label, "role cleared" loss and the total counts as a value', () => {
    const { container } = renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'remove-role', type: 'button', role: 'hover', mode: 'clear' }],
        [{ id: 'click', name: 'Click' }],
      ),
    );
    expect(
      screen.getByText('Remover o papel hover em button (limpar o papel)'),
    ).toBeTruthy();
    expect(screen.getByText(/papel hover limpo/)).toBeTruthy();
    expect(container.querySelector('p.notice.notice-error')?.textContent).toBe(
      'Esta atualização apaga 1 valor(es) e 0 anotação(ões).',
    );
  });

  it('remove-role with unlink: count of unlinked, loss and the total with link(s)', () => {
    const { container } = renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'remove-role', type: 'button', role: 'hover', mode: 'unlink' }],
        [{ id: 'click', name: 'Click' }],
      ),
    );
    expect(
      screen.getByText('Remover o papel hover em button (desvincular)'),
    ).toBeTruthy();
    expect(screen.getByText('1 anotação(ões), 1 desvinculada(s)')).toBeTruthy();
    expect(screen.getByText(/vínculo desfeito \(papel hover\)/)).toBeTruthy();
    expect(container.querySelector('p.notice.notice-error')?.textContent).toBe(
      'Esta atualização apaga 0 valor(es) e 0 anotação(ões) e 1 vínculo(s).',
    );
  });

  it('set-role without and with childType', () => {
    const base = libProject(roleLib(1, []), [
      { id: 'B1', type: 'button' },
      { id: 'C1', type: 'chip', parent: 'B1' },
    ]);
    renderImpact(
      base,
      roleNext([
        { op: 'set-role', type: 'button', role: 'click' },
        { op: 'set-role', type: 'button', childType: 'chip', role: 'hover' },
      ]),
    );
    expect(screen.getByText('Dar o papel click aos filhos de button')).toBeTruthy();
    expect(screen.getByText('Dar o papel hover aos filhos chip de button')).toBeTruthy();
  });

  it('role break without a step: refused with the break message', () => {
    const { container } = renderImpact(
      roleBase(),
      roleLib(2, [{ id: 'click', name: 'Click' }]),
    );
    const alert = container.querySelector('div.notice.notice-error');
    expect(alert?.textContent).toContain('faltam migrações');
    expect(alert?.textContent).toContain('hover');
    expect(screen.queryByText('Passos da migração')).toBeNull();
  });
});

describe('UpdateImpact: role steps (en-US)', () => {
  beforeEach(() => {
    locale.value = 'en-US';
  });

  it('labels, losses and total', () => {
    const clear = renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'remove-role', type: 'button', role: 'hover', mode: 'clear' }],
        [{ id: 'click', name: 'Click' }],
      ),
    );
    expect(screen.getByText('Remove role hover in button (clear the role)')).toBeTruthy();
    expect(screen.getByText(/role hover cleared/)).toBeTruthy();
    clear.unmount();
    const unlink = renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'remove-role', type: 'button', role: 'hover', mode: 'unlink' }],
        [{ id: 'click', name: 'Click' }],
      ),
    );
    expect(screen.getByText('Remove role hover in button (unlink)')).toBeTruthy();
    expect(screen.getByText('1 annotation(s), 1 unlinked')).toBeTruthy();
    expect(unlink.container.querySelector('p.notice.notice-error')?.textContent).toBe(
      'This update deletes 0 value(s) and 0 annotation(s) and 1 link(s).',
    );
    unlink.unmount();
    renderImpact(
      roleBase(),
      roleNext(
        [{ op: 'rename-role', type: 'button', from: 'click', to: 'hover' }],
        [{ id: 'hover', name: 'Focus' }],
      ),
    );
    expect(screen.getByText('Rename role click → hover in button')).toBeTruthy();
  });

  it('set-role', () => {
    renderImpact(
      libProject(roleLib(1, []), [{ id: 'B1', type: 'button' }]),
      roleNext([
        { op: 'set-role', type: 'button', role: 'click' },
        { op: 'set-role', type: 'button', childType: 'chip', role: 'hover' },
      ]),
    );
    expect(screen.getByText('Give role click to the children of button')).toBeTruthy();
    expect(
      screen.getByText('Give role hover to the chip children of button'),
    ).toBeTruthy();
  });
});

describe('SpecsDialog: update library v4', () => {
  const chooseZip = (file: File) => {
    const input = document.querySelector<HTMLInputElement>('input[accept^=".zip"]');
    if (!input) throw new Error('no zip input');
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
    libProject(libSpec(1), [{ id: 'G1', type: 'badge', values: { text: 'new' } }]);

  beforeEach(() => hideToolWindow('incomplete'));

  it('with pending items: shows the count, updates and opens Incomplete', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Update from zip…' }));
    chooseZip(await zipOf(pkg(spec)));
    const dialog = await dialogTitled('Package "Lib"', 30_000);
    expect(within(dialog).getByText(/1 pending item\(s\) remain/)).toBeTruthy();
    expect(isToolWindowOpen('incomplete')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await screen.findByText(/1 pending item\(s\) in Incomplete/);
    expect(harness.project().specializations[0]?.version).toBe(2);
    expect(isToolWindowOpen('incomplete')).toBe(true);
  }, 60_000);

  it('with pending items: Incomplete keeps the origin; without the dialog, closing takes the focus to the strip', async () => {
    const { harness, user, view } = setup(base());
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
    await user.click(screen.getByRole('button', { name: 'Update from zip…' }));
    chooseZip(await zipOf(pkg(spec)));
    const dialog = await dialogTitled('Package "Lib"', 30_000);
    const confirm = within(dialog).getByRole('button', { name: 'Update' });
    confirm.focus();
    fireEvent.click(confirm);
    await screen.findByText(/1 pending item\(s\) in Incomplete/);
    expect(isToolWindowOpen('incomplete')).toBe(true);
    // The dialog closes and takes the saved origin with it.
    view.unmount();
    render(
      <EditorContext.Provider value={harness.context}>
        <ToolStrip side="left" />
        <ToolWindow id="incomplete">
          <button type="button">incomplete control</button>
        </ToolWindow>
      </EditorContext.Provider>,
    );
    expect(confirm.isConnected).toBe(false);
    screen.getByRole('button', { name: 'incomplete control' }).focus();
    closeToolWindow('incomplete');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      document.querySelector('[data-strip-window="incomplete"]'),
    );
  }, 60_000);

  it('refused: Update stays disabled and the version does not change', async () => {
    const { harness, user } = setup(base());
    const spec = renameLabel(libNext([]));
    await user.click(screen.getByRole('button', { name: 'Update from zip…' }));
    chooseZip(await zipOf(pkg(spec)));
    const dialog = await dialogTitled('Package "Lib"', 30_000);
    expect(within(dialog).getByRole('button', { name: 'Update' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(dialog).getByText(/declared migrations are missing/)).toBeTruthy();
    expect(harness.project().specializations[0]?.version).toBe(1);
  }, 60_000);

  it('role break without a step: Update stays disabled and the message cites the role', async () => {
    const { harness, user } = setup(roleBase());
    // v11 (no role step): the `hover` role leaves the `childRoles` of the button.
    const spec = { ...roleLib(2, [{ id: 'click', name: 'Click' }]), formatVersion: 11 };
    await user.click(screen.getByRole('button', { name: 'Update from zip…' }));
    chooseZip(await zipOf(pkg(spec as Spec)));
    const dialog = await dialogTitled('Package "Lib"', 30_000);
    expect(within(dialog).getByRole('button', { name: 'Update' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(dialog).getByText(/declared migrations are missing/)).toBeTruthy();
    expect(
      within(dialog).getAllByText(/hover/, { selector: 'li' }).length,
    ).toBeGreaterThan(0);
    expect(harness.project().specializations[0]?.version).toBe(1);
  }, 60_000);
});

// MB3 (#1358): the refused loose specialization and the update refused for a missing migration
// come out in the app language (decision 5); in en-US without any Portuguese word outside the parameters.
// pt-BR kept: the regex detects Portuguese characters in the en-US output, and the pt-BR tests check the model text
const PORTUGUESE = /[ãõçáéíóúâêô]/i;

describe('model messages in the app language (MB3)', () => {
  const looseSpec = JSON.stringify({
    format: 'mapping-spec',
    formatVersion: 15,
    id: 's',
    name: 'S',
    version: 1,
    platforms: [{ id: 'a', name: 'A', repo: { url: 'x' } }],
    layers: [],
  });

  it('en-US: the refused loose specialization shows the path and the problem in English', async () => {
    locale.value = 'en-US';
    const { choose } = setup();
    choose(looseSpec);
    const dialog = await dialogTitled('Invalid specialization file');
    expect(dialog.textContent).toContain(
      'platforms[0].repo.url: must start with http:// or https://, without spaces',
    );
    expect(dialog.textContent).not.toMatch(PORTUGUESE);
  });

  it('pt-BR: the refused loose specialization keeps the model text', async () => {
    locale.value = 'pt-BR';
    const { choose } = setup();
    choose(looseSpec);
    // pt-BR kept: the pt-BR text of the dialog and of the model message is the object of the test
    const dialog = await dialogTitled('Arquivo de especialização inválido');
    expect(dialog.textContent).toContain(
      'platforms[0].repo.url: deve começar com http:// ou https://, sem espaços',
    );
  });

  it('en-US: the refused update lists the breaks without migration in English', () => {
    locale.value = 'en-US';
    const base = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const { container } = renderImpact(base, renameLabel(libNext([])));
    const items = [
      ...(container.querySelectorAll('div.notice.notice-error li') ?? []),
    ].map((li) => li.textContent ?? '');
    expect(items.length).toBeGreaterThan(0);
    expect(items).toContain(
      'the field "label" of the type "button" was removed; declare a "remove-field" or "rename-field" step in migrations',
    );
    for (const item of items) expect(item).not.toMatch(PORTUGUESE);
  });

  it('pt-BR: the refused update keeps the model text', () => {
    locale.value = 'pt-BR';
    const base = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const { container } = renderImpact(base, renameLabel(libNext([])));
    const items = [...container.querySelectorAll('div.notice.notice-error li')].map(
      (li) => li.textContent ?? '',
    );
    // pt-BR kept: the pt-BR text of the model message is the object of the test
    expect(items).toContain(
      'o campo "label" do tipo "button" foi removido; declare um passo "remove-field" ou "rename-field" em migrations',
    );
  });
});
