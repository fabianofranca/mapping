import { t } from '../i18n';

export function Home() {
  return (
    <main class="home">
      <h2>{t('home.welcome')}</h2>
      <p>{t('home.empty')}</p>
    </main>
  );
}
