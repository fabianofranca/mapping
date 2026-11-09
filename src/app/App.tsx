import { useEffect } from 'preact/hooks';
import { installFileDropGuard } from './fileDropGuard';
import { PreviewBanner } from '../ui/PreviewBanner';
import { UpdateBanner } from '../ui/UpdateBanner';
import { ProjectNoticeBanner } from '../ui/ProjectNoticeBanner';
import { openLibrary, openProject } from './controller';
import { CatalogScreen } from './CatalogScreen';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  useEffect(() => installFileDropGuard(), []);
  const open = openProject.value;
  if (open) {
    return (
      <div class="app app-editor" data-focus-root>
        <PreviewBanner />
        <UpdateBanner />
        <ProjectNoticeBanner />
        <Editor open={open} />
      </div>
    );
  }
  const library = openLibrary.value;
  if (library) {
    return (
      <div class="app app-catalog" data-focus-root>
        <PreviewBanner />
        <UpdateBanner />
        <ProjectNoticeBanner />
        <CatalogScreen library={library} />
      </div>
    );
  }
  return (
    <div class="app" data-focus-root>
      <PreviewBanner />
      <UpdateBanner />
      <ProjectNoticeBanner />
      <Home />
    </div>
  );
}
