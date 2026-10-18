import { PreviewBanner } from '../ui/PreviewBanner';
import { UpdateBanner } from '../ui/UpdateBanner';
import { openLibrary, openProject } from './controller';
import { CatalogScreen } from './CatalogScreen';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  const open = openProject.value;
  if (open) {
    return (
      <div class="app app-editor" data-focus-root>
        <PreviewBanner />
        <UpdateBanner />
        <Editor open={open} />
      </div>
    );
  }
  const library = openLibrary.value;
  if (library) {
    return (
      <div class="app" data-focus-root>
        <PreviewBanner />
        <UpdateBanner />
        <CatalogScreen library={library} />
      </div>
    );
  }
  return (
    <div class="app" data-focus-root>
      <PreviewBanner />
      <UpdateBanner />
      <Home />
    </div>
  );
}
