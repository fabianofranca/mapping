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

describe('Settings › Identity', () => {
  it('without an identity, warns that the person can only read and does not allow saving empty fields', () => {
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

  it('saves name and email on the device and confirms', async () => {
    const user = userEvent.setup();
    open();
    await user.type(within(section()).getByLabelText(t('identity.name')), 'Marina Alves');
    await user.type(
      within(section()).getByLabelText(t('identity.email')),
      'marina@example.com',
    );
    await user.click(within(section()).getByRole('button', { name: t('identity.save') }));
    expect(identity.value).toEqual({ name: 'Marina Alves', email: 'marina@example.com' });
    expect(within(section()).getByText(t('identity.saved'))).toBeTruthy();
    expect(within(section()).queryByText(t('identity.missing'))).toBeNull();
  });

  it('email without something@something becomes invalid and does not save', async () => {
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

  it('shows the stored identity and allows forgetting it', async () => {
    setIdentity('Marina Alves', 'marina@example.com');
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
