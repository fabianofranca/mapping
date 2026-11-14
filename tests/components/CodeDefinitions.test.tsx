import { cleanup, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { AnnotationLines } from '../../src/ui/AnnotationSummary';
import { HelpDialog } from '../../src/ui/HelpDialog';
import { SettingsDialog } from '../../src/ui/SettingsDialog';
import { SpecsDialog } from '../../src/ui/SpecsDialog';
import { ANDROID_REPO, codeProject, withSpecRepo } from '../model/specFixtures';
import { variantsProject } from '../model/variantsFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

// Stages 3b.3, 9 and Instantiation code: the "Definition" line (the `path` of the type's `code`,
// with the link through the specialization's `repo`) in the Details, the List without a reference
// to the generated code, the local clone per platform in the Settings, the platforms in the
// specializations dialog and the usage Help.

// The SDUI example may rename the `bff` platform: the name comes from the specialization itself.
const BFF = codeProject()
  .specializations.flatMap((s) => s.spec?.platforms ?? [])
  .find((platform) => platform.id === 'bff');
const BFF_NAME = BFF?.name ?? 'bff';
const BFF_LANGUAGE = BFF?.language ?? '';

beforeEach(() => {
  locale.value = 'en-US';
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

describe('List and inherited (AnnotationLines)', () => {
  it('the Screen shows only the type fields, with no code entries or actions', () => {
    const harness = createHarness(codeProject());
    renderLive(harness, (p) => (
      <AnnotationLines
        project={p}
        annotation={annotationOf(p, 'AS')}
        lineClass="list-entry"
        keyClass="list-key"
      />
    ));
    expect(
      Array.from(document.querySelectorAll('.list-entry')).map((l) => l.textContent),
    // pt-BR kept: shared fixture data asserted by tests/model (specFixtures)
    ).toEqual(['nome: Cadastro', 'rota: /cadastro']);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Details: type "Definition" line (code.<platform>.path)', () => {
  function setupDetails(annotationId: string, readOnly = false) {
    const harness = createHarness(codeProject(), readOnly);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={readOnly}
      />
    ));
    const lines = () => Array.from(document.querySelectorAll('[data-definition]'));
    return { lines, user: userEvent.setup() };
  }

  it('one line per platform with a path: "Platform · file", with the path and symbol hint', () => {
    const { lines } = setupDetails('AB');
    expect(screen.getByText('Definition')).toBeTruthy();
    expect(
      lines().map((l) => l.querySelector('.code-definition-name')?.textContent),
    ).toEqual(expect.arrayContaining(['Android · DSButton.kt', 'iOS · DSButton.swift']));
    expect(
      screen.getByText('app/src/main/java/com/app/ds/DSButton.kt · com.app.ds.DSButton'),
    ).toBeTruthy();
  });

  it('"Open in repository" only where there is a repository; "Copy path" on all', async () => {
    const { lines, user } = setupDetails('AB');
    const [android, ios] = lines() as HTMLElement[];
    const link = within(android!).getByRole('link', { name: /^Open in repository/ });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // iOS has no repository: shows the path and "Copy path", without a link.
    expect(within(ios!).queryByRole('link')).toBeNull();
    await user.click(within(ios!).getByRole('button', { name: /^Copy path/ }));
    expect(await navigator.clipboard.readText()).toBe('App/DesignSystem/DSButton.swift');
    await waitFor(() =>
      expect(within(ios!).getByRole('status').textContent).toBe('Path copied'),
    );
  });

  it('the link comes only from the specialization: nothing in Settings; without urlTemplate only the path', () => {
    const base = codeProject();
    const project = { ...base, platformRepos: {} };
    const harness = createHarness(project);
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AB')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    expect(
      screen.getByRole('link', { name: /^Open in repository/ }).getAttribute('href'),
    ).toBe(
      'https://github.com/org/app-android/blob/main/app/src/main/java/com/app/ds/DSButton.kt',
    );
    cleanup();
    const noTemplate = withSpecRepo(project, 'sdui', 'android', {
      url: ANDROID_REPO.url,
    });
    renderLive(createHarness(noTemplate), (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, 'AB')}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Copy path/ })).not.toHaveLength(
      0,
    );
  });

  it('also appears with a read-only project (there is nothing to edit)', () => {
    const { lines } = setupDetails('AB', true);
    expect(lines().length).toBeGreaterThanOrEqual(2);
  });

  it('a type without a path (Screen) has no line', () => {
    for (const id of ['AS']) {
      cleanup();
      const { lines } = setupDetails(id);
      expect(lines()).toHaveLength(0);
      expect(screen.queryByText('Definition')).toBeNull();
    }
  });

  it('the label is "Definition"', () => {
    locale.value = 'en-US';
    setupDetails('AB');
    expect(screen.getByText('Definition')).toBeTruthy();
  });
});

describe('Settings: local clone per platform', () => {
  function setupSettings(project: Project = codeProject(), readOnly = false) {
    const harness = createHarness(project, readOnly);
    renderLive(harness, (p) => (
      <SettingsDialog
        project={p}
        readOnly={readOnly}
        onClose={() => undefined}
        onShowShortcuts={() => undefined}
      />
    ));
    return { harness, user: userEvent.setup() };
  }
  const group = (name: string) =>
    within(screen.getByRole('group', { name, hidden: true }));

  it('one line per declared platform, with only the local path and no warning', () => {
    setupSettings();
    expect(
      screen
        .getAllByRole('group', { hidden: true })
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(expect.arrayContaining(['Android', 'iOS', BFF_NAME]));
    expect(
      group('Android').getByLabelText('Local path of the root', { selector: 'input' }),
    ).toHaveProperty('value', '../../..');
    expect(
      group('iOS').getByLabelText('Local path of the root', { selector: 'input' }),
    ).toHaveProperty('value', '');
    // The address comes from the specialization: there is no field or missing-repository warning.
    expect(screen.queryByLabelText('File address')).toBeNull();
    for (const name of ['Android', 'iOS', BFF_NAME]) {
      expect(group(name).queryByRole('status', { hidden: true })).toBeNull();
    }
  });

  it('saves through the actions, with translated errors, and clears the configuration', async () => {
    const { harness, user } = setupSettings();
    const ios = group('iOS');
    const local = ios.getByLabelText('Local path of the root', { selector: 'input' });
    await user.type(local, '/absolute{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relative to the project folder/,
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();

    await user.clear(local);
    await user.type(local, '../ios{Enter}');
    expect(harness.project().platformRepos.ios).toEqual({ localPath: '../ios' });
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();

    await user.click(
      ios.getByRole('button', { name: 'Clear the repository of iOS', hidden: true }),
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();
    expect((local as HTMLInputElement).value).toBe('');
    // One undo step per action.
    harness.store.undo();
    expect(harness.project().platformRepos.ios?.localPath).toBe('../ios');
  });

  it('without platforms (or outside the editor) the section does not appear', () => {
    const harness = createHarness({ ...codeProject(), specializations: [] });
    renderLive(harness, (p) => (
      <SettingsDialog
        project={p}
        onClose={() => undefined}
        onShowShortcuts={() => undefined}
      />
    ));
    expect(screen.queryByText('Repositories')).toBeNull();
  });
});

describe('Specializations and Help', () => {
  it('the dialog shows the platforms of each specialization: name, id and language', () => {
    const harness = createHarness(codeProject());
    renderLive(harness, (p) => (
      <SpecsDialog project={p} readOnly={false} onClose={() => undefined} />
    ));
    expect(screen.getByText('Android · android · kotlin')).toBeTruthy();
    expect(screen.getByText('iOS · ios · swift')).toBeTruthy();
    expect(screen.getByText(`${BFF_NAME} · bff · ${BFF_LANGUAGE}`)).toBeTruthy();
    // The declared repo appears as a plain link, with the ref (only Android declares it).
    const link = screen.getByRole('link', { name: ANDROID_REPO.url });
    expect(link.getAttribute('href')).toBe(ANDROID_REPO.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('ref v1.2.0')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    // The Data model (v1) declares no platforms: just one list.
    expect(screen.getAllByText('Platforms')).toHaveLength(1);
  });

  it('the Help has the usage section for the platforms and the code, in both languages', () => {
    // pt-BR kept: the Help section must exist in both locales
    for (const l of ['pt-BR', 'en-US'] as const) {
      locale.value = l;
      cleanup();
      renderLive(createHarness(codeProject()), () => (
        <HelpDialog onClose={() => undefined} />
      ));
      const section = document.getElementById('help-code-usage');
      expect(section, l).not.toBeNull();
      expect(section?.querySelectorAll('li').length, l).toBe(4);
      expect(section?.textContent, l).not.toMatch(/codeRef/);
    }
  });
});

describe('Details: the Definition through the variants case (formatVersion 9)', () => {
  function definitionOf(annotationId: string) {
    const harness = createHarness(variantsProject());
    renderLive(harness, (p) => (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, annotationId)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={() => undefined}
        onShowLayer={() => undefined}
        readOnly={false}
      />
    ));
    return document.querySelector('[data-definition="compose"]') as HTMLElement;
  }

  it('the text button shows the case file, with the link through the repo', () => {
    const line = definitionOf('BT');
    expect(line.querySelector('.code-definition-name')?.textContent).toBe(
      'Compose · TextButton.kt',
    );
    expect(
      within(line)
        .getByRole('link', { name: /^Open in repository/ })
        .getAttribute('href'),
    ).toBe(
      'https://github.com/androidx/androidx/blob/main/compose/material3/TextButton.kt',
    );
    expect(
      screen.getByText(
        'compose/material3/TextButton.kt · androidx.compose.material3.TextButton',
      ),
    ).toBeTruthy();
  });

  it('the outlined shows the case symbol over the base file; the filled shows the base', () => {
    expect(definitionOf('BO').querySelector('.code-definition-name')?.textContent).toBe(
      'Compose · Button.kt',
    );
    expect(
      screen.getByText(
        'compose/material3/Button.kt · androidx.compose.material3.OutlinedButton',
      ),
    ).toBeTruthy();
    cleanup();
    definitionOf('BF');
    expect(
      screen.getByText('compose/material3/Button.kt · androidx.compose.material3.Button'),
    ).toBeTruthy();
  });
});
