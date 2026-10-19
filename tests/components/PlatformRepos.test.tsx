import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { PlatformRepos } from '../../src/ui/PlatformRepos';
import { ANDROID_REPO, codeProject, withSpecRepo } from '../model/specFixtures';
import { createHarness, renderLive } from './harness';

// Código de instanciação: Configurações › Repositórios de código mostra o `repo` que a
// especialização declara (só leitura) e deixa editar apenas o caminho local do clone.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(project = codeProject(), readOnly = false) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => <PlatformRepos project={p} readOnly={readOnly} />);
  return { harness, user: userEvent.setup() };
}
const group = (name: string) => within(screen.getByRole('group', { name, hidden: true }));
const LOCAL = 'Caminho local da raiz';

describe('PlatformRepos', () => {
  it('mostra o repo da especialização em leitura: nome, link comum e ref', () => {
    setup();
    const android = group('Android');
    const link = android.getByRole('link', { name: ANDROID_REPO.url, hidden: true });
    expect(link.getAttribute('href')).toBe(ANDROID_REPO.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(android.getByText('referência v1.2.0')).toBeTruthy();
    expect(android.getByText('SDUI')).toBeTruthy();
    // Só o caminho local é editável.
    expect(android.getAllByRole('textbox', { hidden: true })).toHaveLength(1);
    expect(android.queryByText(/não declara o repositório/)).toBeNull();
  });

  it('plataforma sem repo mostra o texto discreto, sem aviso', () => {
    setup();
    const ios = group('iOS');
    expect(
      ios.getByText('A especialização não declara o repositório desta plataforma.'),
    ).toBeTruthy();
    expect(ios.queryByRole('link', { hidden: true })).toBeNull();
    expect(ios.queryByRole('status', { hidden: true })).toBeNull();
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('repo sem ref não mostra a ref', () => {
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

  it('o caminho local grava pela action e mostra o erro de caminho inválido', async () => {
    const { harness, user } = setup();
    const ios = group('iOS');
    const local = ios.getByLabelText(LOCAL, { selector: 'input' });
    await user.type(local, '/absoluto{Enter}');
    expect(ios.getByRole('alert', { hidden: true }).textContent).toMatch(
      /relativo à pasta do projeto/,
    );
    expect(harness.project().platformRepos.ios).toBeUndefined();
    await user.clear(local);
    await user.type(local, '../ios{Enter}');
    expect(harness.project().platformRepos.ios).toEqual({ localPath: '../ios' });
    expect(ios.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('limpar remove a sobreposição local; sem ela o botão fica desabilitado', async () => {
    const { harness, user } = setup();
    const clear = (name: string) =>
      group(name).getByRole('button', {
        name: `Limpar repositório de ${name}`,
        hidden: true,
      });
    expect((clear('iOS') as HTMLButtonElement).disabled).toBe(true);
    await user.click(clear('Android'));
    expect(harness.project().platformRepos.android).toBeUndefined();
    expect(
      (group('Android').getByLabelText(LOCAL, { selector: 'input' }) as HTMLInputElement)
        .value,
    ).toBe('');
    // O repo da especialização continua: limpar só tira o clone local.
    expect(
      group('Android').getByRole('link', { name: ANDROID_REPO.url, hidden: true }),
    ).toBeTruthy();
  });

  it('somente leitura desabilita o campo e o limpar', () => {
    setup(codeProject(), true);
    expect(
      (group('Android').getByLabelText(LOCAL, { selector: 'input' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});
