import { t } from '../i18n';
import { Home } from './Home';
import { SettingsBar } from '../ui/SettingsBar';

export function App() {
  return (
    <div class="app">
      <header class="topbar">
        <h1>{t('app.title')}</h1>
        <SettingsBar />
      </header>
      <Home />
    </div>
  );
}
