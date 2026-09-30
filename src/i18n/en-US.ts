import type { Dictionary } from './pt-BR';

export const enUS: Dictionary = {
  'app.title': 'Image Mapper',
  'app.loading': 'Loading…',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'language.pt-BR': 'Português (Brasil)',
  'language.en-US': 'English (US)',

  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.delete': 'Delete',
  'common.open': 'Open',
  'common.close': 'Close',

  'layer.defaultName': 'Layer 1',
  'project.untitled': 'Untitled project',
  'project.name': 'Project name',

  'home.start': 'Get started',
  'home.newProject': 'New project',
  'home.newProjectHint': 'Stored on this device',
  'home.openFolder': 'Open folder',
  'home.openFolderHint': 'Saves straight to the folder files',
  'home.openZip': 'Open zip',
  'home.openZipHint': 'Imports an exported project',
  'home.localProjects': 'Projects on this device',
  'home.noLocalProjects': 'No projects stored on this device yet.',
  'home.unsupported':
    'This browser cannot open folders or store projects. Use Chrome or Edge on a computer, or the hosted version on your phone.',
  'home.fileProtocolWarning':
    'Opened as a file: projects "on this device" may not be kept by the browser. On a computer, prefer Open folder.',
  'home.updatedAt': 'Changed {date}',
  'home.deleteTitle': 'Delete project?',
  'home.deleteMessage':
    '"{name}" will be removed from this device, with all its images. This cannot be undone.',
  'home.folderSetupTitle': 'Create a project in this folder?',
  'home.folderSetupEmpty': 'The folder "{folder}" has no mapping.json.',
  'home.folderSetupImages':
    'The folder "{folder}" has no mapping.json. {count} image(s) found will be added to the project (those in the root move to images/).',
  'home.folderSkipped':
    '{count} image(s) could not be read and were left out of the project.',

  'status.saved': 'Saved',
  'status.saving': 'Saving…',
  'status.error': 'Save failed',
  'status.retry': 'Retry',
  'status.unexported': 'Unexported changes',
  'status.readOnly': 'Read-only',

  'editor.addImages': 'Add images',
  'editor.importing': 'Importing {current} of {total}…',
  'editor.importFailed': 'Could not import: {names}',
  'editor.export': 'Export',
  'editor.exporting': 'Building zip…',
  'editor.images': 'Images',
  'editor.noImages': 'No images yet. Tap "Add images".',
  'editor.imageMissing': 'Missing image',
  'editor.imageError': 'Cannot display',
  'editor.dimensions': '{width} × {height} px',
  'editor.provisional': 'Provisional editor: the canvas arrives in the next phase.',
  'editor.readOnlyNotice':
    'This file was made by a newer version of the app and is open read-only.',
  'editor.closeUnsavedTitle': 'Close without saving?',
  'editor.closeUnsavedMessage':
    'The latest changes were not saved. If you close now, they will be lost.',
  'editor.closeAnyway': 'Close anyway',

  'export.title': 'Export project',
  'export.ready': '{file} is ready.',
  'export.share': 'Share',
  'export.download': 'Download',
  'export.shareFailed': 'Could not share. Try downloading.',

  'error.invalid-json': 'mapping.json is not valid JSON.',
  'error.invalid-schema': 'mapping.json does not follow the expected format.',
  'error.unsupported-version': 'The project was made with an incompatible app version.',
  'error.missing-migration': 'Could not upgrade the project to this version.',
  'error.invariant-violation': 'mapping.json has inconsistent data.',
  'error.invalid-zip': 'The file is not a valid zip.',
  'error.missing-mapping': 'The zip has no mapping.json.',
  'error.not-found': 'Project not found.',
  'error.storage-failed': 'Could not access the files. Try again.',
};
