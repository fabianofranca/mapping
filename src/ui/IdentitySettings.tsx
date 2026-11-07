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

/** O estado do formulário: o que a pessoa digitou, se dá para salvar e a confirmação. */
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
 * Configurações › Identidade (etapa Comentários, decisões 10 e 11): nome e e-mail desta pessoa,
 * guardados só neste dispositivo. Sem eles a pessoa lê as conversas, mas não escreve, resolve,
 * reabre nem apaga. O e-mail passa por uma conferência leve (`algo@algo`).
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
