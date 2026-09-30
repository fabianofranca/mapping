import { effect } from '@preact/signals';
import { t } from '../i18n';
import { locale, theme } from '../store/settings';

/** Reflete tema e idioma no <html>. `system` remove o atributo e deixa o CSS seguir o SO. */
export function bindDocumentSettings(
  root: HTMLElement = document.documentElement,
): () => void {
  return effect(() => {
    if (theme.value === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme.value);
    root.lang = locale.value;
    document.title = t('app.title');
  });
}
