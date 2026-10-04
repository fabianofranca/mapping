import { PreviewBanner } from '../ui/PreviewBanner';
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
      <Home />
    </div>
  );
}
