// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createFolderStorage,
  ensureGitignore,
  ensurePermission,
  findExistingImages,
  hasMappingFile,
  isReopenable,
} from '../../src/storage/folder';
import { MemoryDirectory, PermissionDirectory } from './memoryFs';

describe('FolderStorage', () => {
  it('reads null when there is no mapping.json and writes to the root', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    expect(storage.kind).toBe('folder');
    expect(await storage.loadMapping()).toBeNull();
    await storage.saveMapping('{"a":1}\n');
    expect(await storage.loadMapping()).toBe('{"a":1}\n');
    await storage.saveMapping('{"a":2}\n');
    expect(await root.read('mapping.json')).toBe('{"a":2}\n');
  });

  it('writes, reads and removes images, creating the images/ folder', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    await storage.writeImage('images/a.jpg', new Blob(['AAA']));
    expect(root.dirs.has('images')).toBe(true);
    expect(await (await storage.readImage('images/a.jpg'))?.text()).toBe('AAA');
    await storage.removeImage('images/a.jpg');
    expect(await storage.readImage('images/a.jpg')).toBeNull();
    // Removing again (or in a missing folder) does not fail.
    await storage.removeImage('images/a.jpg');
    await storage.removeImage('other/b.jpg');
  });

  it('lists the files in images/ (cited or not), without the subfolders', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    expect(await storage.listImages()).toEqual([]);
    await storage.writeImage('images/b.jpg', new Blob(['B']));
    await storage.writeImage('images/A.png', new Blob(['A']));
    root.put('images/notes.txt', 'loose');
    root.put('photo.jpg', 'in the root');
    expect(await storage.listImages()).toEqual([
      'images/A.png',
      'images/b.jpg',
      'images/notes.txt',
    ]);
  });

  it('writes, reads and removes the copies in specs/', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    expect(await storage.readSpec('specs/sdui.json')).toBeNull();
    await storage.writeSpec('specs/sdui.json', '{"id":"sdui"}\n');
    expect(await root.read('specs/sdui.json')).toBe('{"id":"sdui"}\n');
    expect(await storage.readSpec('specs/sdui.json')).toBe('{"id":"sdui"}\n');
    await storage.removeSpec('specs/sdui.json');
    expect(await storage.readSpec('specs/sdui.json')).toBeNull();
    await storage.removeSpec('specs/sdui.json');
  });

  it('lists, reads, writes and removes the files of a package folder', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    expect(await storage.listSpecDir('specs/m3')).toEqual([]);
    expect(await storage.readSpecFile('specs/m3/fonts/R.ttf')).toBeNull();
    const bytes = new Uint8Array([0, 255, 128, 7]);
    await storage.writeSpecFile('specs/m3/fonts/R.ttf', new Blob([bytes]));
    await storage.writeSpecFile('specs/m3/components/b.json', '{"b":1}');
    await storage.writeSpec('specs/m3/m3.spec.json', '{"id":"m3"}\n');
    await storage.writeSpec('specs/other.json', '{}');
    expect(await storage.listSpecDir('specs/m3')).toEqual([
      'specs/m3/components/b.json',
      'specs/m3/fonts/R.ttf',
      'specs/m3/m3.spec.json',
    ]);
    const read = await storage.readSpecFile('specs/m3/fonts/R.ttf');
    expect([
      ...new Uint8Array((await read?.arrayBuffer()) ?? new ArrayBuffer(0)),
    ]).toEqual([...bytes]);
    expect(await storage.readSpec('specs/m3/m3.spec.json')).toBe('{"id":"m3"}\n');
    await storage.removeSpecFile('specs/m3/fonts/R.ttf');
    expect(await storage.readSpecFile('specs/m3/fonts/R.ttf')).toBeNull();
    expect(await storage.readSpec('specs/m3/m3.spec.json')).toBe('{"id":"m3"}\n');
    await storage.removeSpecFile('specs/m3/fonts/R.ttf'); // again: does not fail
    await storage.removeSpecDir('specs/m3');
    expect(await storage.listSpecDir('specs/m3')).toEqual([]);
    expect(await storage.readSpec('specs/other.json')).toBe('{}');
    // Removing again, or a folder that never existed, does not fail.
    await storage.removeSpecDir('specs/m3');
    await storage.removeSpecDir('specs/nunca/existiu');
  });

  it('refuses paths outside specs/ or with ..', async () => {
    const storage = createFolderStorage(new MemoryDirectory('project'));
    await expect(storage.writeSpecFile('specs/../mapping.json', 'x')).rejects.toThrow();
    await expect(storage.writeSpecFile('/specs/m3/a.json', 'x')).rejects.toThrow();
    await expect(storage.writeSpecFile('images/a.png', 'x')).rejects.toThrow();
    await expect(storage.writeSpecFile('specs/a.bin', 'x')).rejects.toThrow();
    await expect(storage.readSpecFile('specs/m3/../../mapping.json')).rejects.toThrow();
    await expect(storage.listSpecDir('images')).rejects.toThrow();
    await expect(storage.removeSpecDir('specs')).rejects.toThrow();
    await expect(storage.removeSpecDir('specs/../images')).rejects.toThrow();
    await expect(storage.writeSpec('specs/m3/../x.json', '{}')).rejects.toThrow();
  });

  it('keeps mapping backups in backups/ without touching mapping.json', async () => {
    const root = new MemoryDirectory('project');
    const storage = createFolderStorage(root);
    await storage.saveMapping('{"schemaVersion":1}');
    await storage.writeBackup('mapping.v1.20260930-120000.json', '{"schemaVersion":1}');
    expect(await root.read('backups/mapping.v1.20260930-120000.json')).toBe(
      '{"schemaVersion":1}',
    );
    expect(await root.read('mapping.json')).toBe('{"schemaVersion":1}');
  });

  it('rejects paths with ..', async () => {
    const storage = createFolderStorage(new MemoryDirectory('project'));
    await expect(storage.writeImage('../outside.jpg', new Blob(['x']))).rejects.toThrow();
  });

  it('propagates a write error and discards the writable with abort()', async () => {
    const root = new MemoryDirectory('project');
    root.put('mapping.json', '{"a":1}\n');
    root.failWrites = new Error('disk full');
    await expect(createFolderStorage(root).saveMapping('{}')).rejects.toThrow(
      'disk full',
    );
    expect(root.abortedWrites).toBe(1);
    // The previous content is still there.
    expect(await root.read('mapping.json')).toBe('{"a":1}\n');
  });

  it('does not call abort() when the write succeeds', async () => {
    const root = new MemoryDirectory('project');
    await createFolderStorage(root).saveMapping('{}');
    expect(root.abortedWrites).toBe(0);
  });

  it('finds images in images/ and in the root, ignoring other files', async () => {
    const root = new MemoryDirectory('project');
    root.put('images/b.png', 'b');
    root.put('images/a.JPG', 'a');
    root.put('images/notes.txt', 'x');
    root.put('root.jpeg', 'r');
    root.put('readme.md', 'x');
    root.put('other/c.jpg', 'c');
    expect(await findExistingImages(root)).toEqual([
      { path: 'images/a.JPG', name: 'a.JPG' },
      { path: 'images/b.png', name: 'b.png' },
      { path: 'root.jpeg', name: 'root.jpeg' },
    ]);
  });
});

describe('ensureGitignore', () => {
  it('creates the .gitignore with backups/ in a folder without one', async () => {
    const root = new MemoryDirectory('project');
    expect(await ensureGitignore(root)).toBe(true);
    expect(await root.read('.gitignore')).toBe('backups/\n');
  });

  it('appends the line to the existing .gitignore, without deleting what was there', async () => {
    const root = new MemoryDirectory('project');
    root.files.set('.gitignore', new Blob(['node_modules/\n.DS_Store']));
    expect(await ensureGitignore(root)).toBe(true);
    expect(await root.read('.gitignore')).toBe('node_modules/\n.DS_Store\nbackups/\n');
  });

  it.each(['backups/', '/backups/', 'backups', '  backups/  '])(
    'leaves it alone if the .gitignore already covers backups (%j)',
    async (line) => {
      const root = new MemoryDirectory('project');
      const text = `dist/\r\n${line}\r\n`;
      root.files.set('.gitignore', new Blob([text]));
      expect(await ensureGitignore(root)).toBe(false);
      expect(await root.read('.gitignore')).toBe(text);
    },
  );

  it('does not mistake another folder for backups', async () => {
    const root = new MemoryDirectory('project');
    root.files.set('.gitignore', new Blob(['my-backups/\n']));
    expect(await ensureGitignore(root)).toBe(true);
    expect(await root.read('.gitignore')).toBe('my-backups/\nbackups/\n');
  });

  it('running twice writes only once', async () => {
    const root = new MemoryDirectory('project');
    expect(await ensureGitignore(root)).toBe(true);
    expect(await ensureGitignore(root)).toBe(false);
    expect(await root.read('.gitignore')).toBe('backups/\n');
  });
});

describe('FolderStorage: what the app checks from outside (stage 3a.2)', () => {
  it('folderName is the folder name (the <project> of the references)', () => {
    expect(createFolderStorage(new MemoryDirectory('car-mapping')).folderName).toBe(
      'car-mapping',
    );
  });

  // Stage 8 (8.4): the copy (key of the per-device state) is given at creation, immutable.
  it('copyId comes from creation; without it, it is absent', () => {
    const dir = new MemoryDirectory('folder');
    expect(createFolderStorage(dir, { copyId: 'entrada-1' }).copyId).toBe('entrada-1');
    expect(createFolderStorage(dir).copyId).toBeUndefined();
  });

  // Stage 8 (8.4): check whether the folder has a project without going through the session's loadMapping.
  it('hasMappingFile: true with mapping.json, false without it or with the folder gone', async () => {
    const dir = new PermissionDirectory('folder');
    expect(await hasMappingFile(dir)).toBe(false);
    dir.put('mapping.json', '{}');
    expect(await hasMappingFile(dir)).toBe(true);
    dir.gone = true;
    expect(await hasMappingFile(dir)).toBe(false);
  });

  it('statMapping returns the lastModified, or null without the file', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.statMapping?.()).toBeNull();
    await storage.saveMapping('{}');
    const first = await storage.statMapping?.();
    expect(first).toEqual(expect.any(Number));
    // Rewriting (or an outside touch) changes the value.
    await storage.saveMapping('{}');
    const second = await storage.statMapping?.();
    expect(second).toBeGreaterThan(first ?? 0);
    root.touch('mapping.json');
    expect(await storage.statMapping?.()).toBeGreaterThan(second ?? 0);
  });

  it('statImage changes when the file is replaced and is null if it does not exist', async () => {
    const root = new MemoryDirectory('p');
    const storage = createFolderStorage(root);
    expect(await storage.statImage?.('images/a.jpg')).toBeNull();
    await storage.writeImage('images/a.jpg', new Blob(['AAA']));
    const first = await storage.statImage?.('images/a.jpg');
    expect(first).toMatch(/^3:\d+$/);
    await storage.writeImage('images/a.jpg', new Blob(['AAAA']));
    const second = await storage.statImage?.('images/a.jpg');
    expect(second).toMatch(/^4:\d+$/);
    expect(second).not.toBe(first);
  });
});

describe('folder permission (recents, phase 6.6)', () => {
  it('isReopenable exige queryPermission, requestPermission e isSameEntry', () => {
    expect(isReopenable(new PermissionDirectory('p'))).toBe(true);
    expect(isReopenable(new MemoryDirectory('p'))).toBe(false);
  });

  it('already granted: does not ask again', async () => {
    const root = new PermissionDirectory('p');
    expect(await ensurePermission(root)).toBe(true);
    expect(root.requests).toBe(0);
  });

  it('to ask: asks once and returns the answer', async () => {
    const root = new PermissionDirectory('p');
    root.permission = 'prompt';
    expect(await ensurePermission(root)).toBe(true);
    expect(root.requests).toBe(1);
    root.permission = 'prompt';
    root.answer = 'denied';
    expect(await ensurePermission(root)).toBe(false);
  });

  // Hand-back of the 8.4 gate: the trace of Open (`folders.reopen`) says whether there was a request.
  it('the observer receives the query and, when it asks, the request; the return does not change', async () => {
    const root = new PermissionDirectory('p');
    const seen: string[] = [];
    const observe = (step: string, state: string) => seen.push(`${step}=${state}`);
    expect(await ensurePermission(root, observe)).toBe(true);
    expect(seen).toEqual(['query=granted']);
    seen.length = 0;
    root.permission = 'prompt';
    root.answer = 'denied';
    expect(await ensurePermission(root, observe)).toBe(false);
    expect(seen).toEqual(['query=prompt', 'request=denied']);
  });
});
