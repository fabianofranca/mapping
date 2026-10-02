import { t } from '../i18n';
import { PreviewBanner } from '../ui/PreviewBanner';
import { SettingsBar } from '../ui/SettingsBar';
import { UpdateBanner } from '../ui/UpdateBanner';
import { openProject } from './controller';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  const open = openProject.value;
  if (open) {
    return (
      <div class="app app-editor">
        <PreviewBanner />
        <UpdateBanner />
        <Editor open={open} />
      </div>
    );
  }
  return (
    <div class="app">
      <PreviewBanner />
      <UpdateBanner />
      <header class="topbar">
        <h1>{t('app.title')}</h1>
        <SettingsBar />
      </header>
      <Home />
    </div>
  );
}
