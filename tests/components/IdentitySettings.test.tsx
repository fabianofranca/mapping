import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { clearIdentity, identity, setIdentity } from '../../src/store/identity';
import { SettingsDialog } from '../../src/ui/SettingsDialog';

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () => render(<SettingsDialog onClose={vi.fn()} onShowShortcuts={vi.fn()} />);
const section = () => screen.getByRole('region', { name: t('identity.title') });

describe('Configurações › Identidade', () => {
  it('sem identidade, avisa que a pessoa só lê e não deixa salvar campos vazios', () => {
    open();
    expect(within(section()).getByText(t('identity.missing'))).toBeTruthy();
    expect(
      (
        within(section()).getByRole('button', {
          name: t('identity.save'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('salva nome e e-mail no dispositivo e confirma', async () => {
    const user = userEvent.setup();
    open();
    await user.type(within(section()).getByLabelText(t('identity.name')), 'Marina Alves');
    await user.type(
      within(section()).getByLabelText(t('identity.email')),
      'marina@exemplo.com',
    );
    await user.click(within(section()).getByRole('button', { name: t('identity.save') }));
    expect(identity.value).toEqual({ name: 'Marina Alves', email: 'marina@exemplo.com' });
    expect(within(section()).getByText(t('identity.saved'))).toBeTruthy();
    expect(within(section()).queryByText(t('identity.missing'))).toBeNull();
  });

  it('e-mail sem algo@algo fica inválido e não salva', async () => {
    const user = userEvent.setup();
    open();
    await user.type(within(section()).getByLabelText(t('identity.name')), 'Marina');
    const email = within(section()).getByLabelText(t('identity.email'));
    await user.type(email, 'marina');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(within(section()).getByText(t('identity.emailInvalid'))).toBeTruthy();
    expect(
      (
        within(section()).getByRole('button', {
          name: t('identity.save'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(identity.value).toBeNull();
  });

  it('mostra a identidade guardada e permite esquecê-la', async () => {
    setIdentity('Marina Alves', 'marina@exemplo.com');
    const user = userEvent.setup();
    open();
    expect(
      (within(section()).getByLabelText(t('identity.name')) as HTMLInputElement).value,
    ).toBe('Marina Alves');
    await user.click(
      within(section()).getByRole('button', { name: t('identity.clear') }),
    );
    expect(identity.value).toBeNull();
    expect(within(section()).getByText(t('identity.missing'))).toBeTruthy();
  });
});
