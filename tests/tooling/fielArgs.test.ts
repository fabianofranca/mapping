import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Argument validation of scripts/testing/fiel.mjs (R25 setup). The warnings it produces are
// tested in fielWarnings.test.ts.

const SCRIPT = path.resolve('scripts/testing/fiel.mjs');
const USAGE = 'Usage: node fiel.mjs <library folder> [formatVersion]';
const folders: string[] = [];

function tmp(withComponents: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiel-args-'));
  folders.push(dir);
  if (withComponents) fs.mkdirSync(path.join(dir, 'components'));
  return dir;
}

function run(...args: string[]) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

afterEach(() => {
  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('fiel.mjs arguments', () => {
  it('without the folder prints the usage and exits with 2', () => {
    const r = run();
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(USAGE);
  });

  it('with a folder that has no components/ exits with 2 and writes nothing', () => {
    const dir = tmp(false);
    const r = run(dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(USAGE);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('with a missing folder exits with 2', () => {
    const r = run(path.join(os.tmpdir(), 'fiel-args-does-not-exist'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(USAGE);
  });

  it('with a formatVersion other than 3 or 4 exits with 2 and writes nothing', () => {
    const dir = tmp(true);
    for (const bad of ['5', 'x', '']) {
      const r = run(dir, bad);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(USAGE);
    }
    expect(fs.readdirSync(path.join(dir, 'components'))).toEqual([]);
  });

  it('with a valid call writes the components (default 4, or 3 when asked)', () => {
    const dir = tmp(true);
    // The script also rewrites the package's spec; an empty one is enough here.
    fs.writeFileSync(path.join(dir, 'material3-compose.spec.json'), '{"layers":[]}');
    execFileSync('node', [SCRIPT, dir], { stdio: 'pipe' });
    const file = path.join(dir, 'components', 'divider.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).formatVersion).toBe(4);
    execFileSync('node', [SCRIPT, dir, '3'], { stdio: 'pipe' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).formatVersion).toBe(3);
  });
});
