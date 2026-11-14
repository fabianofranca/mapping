import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { clearIdentity, identity, isValidEmail, setIdentity } from '../store/identity';
import { Button, TextField } from './controls';

interface IdentityForm {
  readonly name: string;
  readonly email: string;
  readonly emailInvalid: boolean;
  readonly canSave: boolean;
  readonly confirmed: boolean;
  readonly setName: (value: string) => void;
  readonly setEmail: (value: string) => void;
  readonly save: () => void;
  readonly forget: () => void;
}

/** The form state: what the person typed, whether it can be saved and the confirmation. */
function useIdentityForm(): IdentityForm {
  const saved = identity.value;
  const [name, setName] = useState(saved?.name ?? '');
  const [email, setEmail] = useState(saved?.email ?? '');
  const [confirmed, setConfirmed] = useState(false);

  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const unchanged = saved?.name === cleanName && saved.email === cleanEmail;
  return {
    name,
    email,
    emailInvalid: cleanEmail !== '' && !isValidEmail(cleanEmail),
    canSave: cleanName !== '' && isValidEmail(cleanEmail) && !unchanged,
    confirmed,
    setName: (value) => {
      setName(value);
      setConfirmed(false);
    },
    setEmail: (value) => {
      setEmail(value);
      setConfirmed(false);
    },
    save: () => setConfirmed(setIdentity(cleanName, cleanEmail) === 'ok'),
    forget: () => {
      clearIdentity();
      setName('');
      setEmail('');
      setConfirmed(false);
    },
  };
}

/**
 * Settings › Identity (Comments stage, decisions 10 and 11): this person's name and e-mail,
 * kept only on this device. Without them the person reads threads but does not write, resolve,
 * reopen or delete. The e-mail gets a light check (`something@something`).
 */
export function IdentitySettings() {
  const form = useIdentityForm();
  const hasIdentity = identity.value !== null;
  return (
    <section class="repos" aria-labelledby="identity-title">
      <h3 id="identity-title" class="repos-title">
        {t('identity.title')}
      </h3>
      <p class="muted">{t('identity.intro')}</p>
      <TextField
        label={t('identity.name')}
        value={form.name}
        autoComplete="name"
        onInput={(e) => form.setName(e.currentTarget.value)}
      />
      <TextField
        label={t('identity.email')}
        type="email"
        value={form.email}
        invalid={form.emailInvalid}
        autoComplete="email"
        onInput={(e) => form.setEmail(e.currentTarget.value)}
      />
      {form.emailInvalid && (
        <p class="muted" role="alert">
          {t('identity.emailInvalid')}
        </p>
      )}
      <div class="identity-actions">
        <Button variant="primary" size="sm" disabled={!form.canSave} onClick={form.save}>
          {t('identity.save')}
        </Button>
        {hasIdentity && (
          <Button size="sm" onClick={form.forget}>
            {t('identity.clear')}
          </Button>
        )}
        <span class="muted" role="status">
          {form.confirmed ? t('identity.saved') : ''}
        </span>
      </div>
      {!hasIdentity && <p class="muted">{t('identity.missing')}</p>}
    </section>
  );
}
