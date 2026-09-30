import { t } from '../i18n';
import { SettingsBar } from '../ui/SettingsBar';
import { openProject } from './controller';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  const open = openProject.value;
  if (open) {
    return (
      <div class="app">
        <Editor open={open} />
      </div>
    );
  }
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
