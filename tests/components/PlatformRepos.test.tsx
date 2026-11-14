import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { PlatformRepos } from '../../src/ui/PlatformRepos';
import type { Project } from '../../src/model';
import { docReposProject } from '../model/roleFixtures';
import { ANDROID_REPO, codeProject, withSpecRepo } from '../model/specFixtures';
import { createHarness, renderLive } from './harness';

// Settings › Repositories: the Code subsection shows the `repo` that the specialization declares
// (read-only) and lets you edit only the local path of the clone; the Documents subsection does the same
// with the `docRepos` (stage #559, PD5).

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(project = codeProject(), readOnly = false) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => <PlatformRepos project={p} readOnly={readOnly} />);
  return { harness, user: userEvent.setup() };
}
const group = (name: string) => within(screen.getByRole('group', { name, hidden: true }));
const LOCAL = 'Local path of the root';

describe('PlatformRepos', () => {
  it('shows the specialization repo read-only: name, plain link and ref', () => {
    setup();
    const android = group('Android');
    const link = android.getByRole('link', { name: ANDROID_REPO.url, hidden: true });
    expect(link.getAttribute('href')).toBe(ANDROID_REPO.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(android.getByText('ref v1.2.0')).toBeTruthy();
    expect(android.getByText('SDUI')).toBeTruthy();
    // Only the local path is editable.
    expect(android.getAllByRole('textbox', { hidden: true })).toHaveLength(1);
    expect(android.queryByText(/does not declare the repository/)).toBeNull();
  });

  it('a platform without a repo shows the discreet text, without a warning', () => {
    setup();
    const ios = group('iOS');
    expect(
      ios.getByText(
        'The specialization does not declare the repository of this platform.',
      ),
    ).toBeTruthy();
    expect(ios.queryByRole('link', { hidden: true })).toBeNull();
    expect(ios.queryByRole('status', { hidden: true })).toBeNull();
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('a repo without a ref does not show the ref', () => {
    const project = withSpecRepo(codeProject(), 'sdui', 'ios', {
      url: 'https://github.com/org/app-ios',
    });
    setup(project);
    const ios = group('iOS');
    expect(
      ios.getByRole('link', { name: 'https://github.com/org/app-ios', hidden: true }),
    ).toBeTruthy();
    expect(ios.queryByText(/^ref /)).toBeNull();
  });

  it('the local path saves through the action and shows the invalid path error', async () => {
    const { harness, user } = setup();
    const ios = group('iOS');
    const local = ios.getByLabelText(LOCAL, { selector: 'input' });
    await user.type(local, '/absolute{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relative to the project folder/,
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();
    await user.clear(local);
    await user.type(local, '../ios{Enter}');
    expect(harness.project().platformRepos.ios).toEqual({ localPath: '../ios' });
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('clear removes the local override; without it the button is disabled', async () => {
    const { harness, user } = setup();
    const clear = (name: string) =>
      group(name).getByRole('button', {
        name: `Clear the repository of ${name}`,
        hidden: true,
      });
    expect((clear('iOS') as HTMLButtonElement).disabled).toBe(true);
    await user.click(clear('Android'));
    expect(harness.project().platformRepos.android).toBeUndefined();
    expect(
      (group('Android').getByLabelText(LOCAL, { selector: 'input' }) as HTMLInputElement)
        .value,
    ).toBe('');
    // The specialization repo stays: clearing only removes the local clone.
    expect(
      group('Android').getByRole('link', { name: ANDROID_REPO.url, hidden: true }),
    ).toBeTruthy();
  });

  it('read-only disables the field and the clear', () => {
    setup(codeProject(), true);
    expect(
      (group('Android').getByLabelText(LOCAL, { selector: 'input' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});

/** `codeProject` whose specialization also declares `docRepos`. */
function codeAndDocsProject(): Project {
  const p = codeProject();
  return {
    ...p,
    specializations: p.specializations.map((s) =>
      s.spec
        ? {
            ...s,
            spec: {
              ...s.spec,
              formatVersion: 11,
              docRepos: [
                { id: 'design-docs', url: 'https://gitlab.example.com/g/design-docs' },
              ],
            },
          }
        : s,
    ),
  };
}

const heading = (name: string) => screen.queryByRole('heading', { name, hidden: true });

describe('PlatformRepos › Documents', () => {
  it('lists the docRepos of the applied specializations: id, link and ref', () => {
    setup(docReposProject());
    const design = group('design-docs');
    expect(design.getByText('design-docs')).toBeTruthy();
    const link = design.getByRole('link', {
      name: 'https://gitlab.example.com/g/design-docs',
      hidden: true,
    });
    expect(link.getAttribute('href')).toBe('https://gitlab.example.com/g/design-docs');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(design.getByText('ref main')).toBeTruthy();
    // Only the local path is editable.
    expect(design.getAllByRole('textbox', { hidden: true })).toHaveLength(1);

    const wiki = group('wiki');
    expect(wiki.getByRole('link', { hidden: true }).getAttribute('href')).toBe(
      'https://gitlab.example.com/g/wiki',
    );
    expect(wiki.queryByText(/^ref /)).toBeNull();
  });

  it('the local path saves and clears (empty text) in one undo entry each', async () => {
    const { harness, user } = setup(docReposProject());
    const local = group('design-docs').getByLabelText(LOCAL, { selector: 'input' });
    await user.type(local, '../docs{Enter}');
    expect(harness.project().docRepos).toEqual({
      'design-docs': { localPath: '../docs' },
    });

    await user.clear(local);
    await user.keyboard('{Enter}');
    expect(harness.project().docRepos).toEqual({});

    harness.store.undo();
    expect(harness.project().docRepos).toEqual({
      'design-docs': { localPath: '../docs' },
    });
    harness.store.undo();
    expect(harness.project().docRepos).toEqual({});
  });

  it('the Clear button removes the local clone and is disabled without it', async () => {
    const { harness, user } = setup(docReposProject());
    const clear = () =>
      group('design-docs').getByRole('button', {
        name: 'Clear the document repository design-docs',
        hidden: true,
      }) as HTMLButtonElement;
    expect(clear().disabled).toBe(true);
    await user.type(
      group('design-docs').getByLabelText(LOCAL, { selector: 'input' }),
      '../docs{Enter}',
    );
    expect(clear().disabled).toBe(false);
    await user.click(clear());
    expect(harness.project().docRepos).toEqual({});
    harness.store.undo();
    expect(harness.project().docRepos).toEqual({
      'design-docs': { localPath: '../docs' },
    });
  });

  it('an invalid value shows the error and does not save', async () => {
    const { harness, user } = setup(docReposProject());
    const design = group('design-docs');
    await user.type(
      design.getByLabelText(LOCAL, { selector: 'input' }),
      '/absolute{Enter}',
    );
    expect(design.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relative to the project folder/,
    );
    expect(harness.project().docRepos).toEqual({});
  });

  it('read-only disables the field', () => {
    setup(docReposProject(), true);
    expect(
      (
        group('design-docs').getByLabelText(LOCAL, {
          selector: 'input',
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
  });

  it('the section is called Repositories, with the Code and Documents subsections', () => {
    setup(codeAndDocsProject());
    expect(heading('Repositories')).toBeTruthy();
    expect(heading('Code')).toBeTruthy();
    expect(heading('Documents')).toBeTruthy();
    expect(heading('Code repositories')).toBeNull();
  });

  it('without docRepos the Documents subsection does not appear', () => {
    setup(codeProject());
    expect(heading('Code')).toBeTruthy();
    expect(heading('Documents')).toBeNull();
  });

  it('without platforms the Code subsection does not appear', () => {
    setup(docReposProject());
    expect(heading('Documents')).toBeTruthy();
    expect(heading('Code')).toBeNull();
  });
});
