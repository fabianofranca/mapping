import { channelStorageKey } from './channel';

// localStorage can throw (private mode, file://, blocked data).
// Keys go through `channelStorageKey`: the preview does not read the main version's.
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(channelStorageKey(key));
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(channelStorageKey(key), value);
  } catch {
    // No persistence: the setting only holds for this session.
  }
}

// The same for `sessionStorage`: what only holds while the tab exists (survives
// reloading the page, not another tab). Phase 8.4: the per-tab id of a folder with no recents.
export function readSessionSetting(key: string): string | null {
  try {
    return sessionStorage.getItem(channelStorageKey(key));
  } catch {
    return null;
  }
}

export function writeSessionSetting(key: string, value: string): void {
  try {
    sessionStorage.setItem(channelStorageKey(key), value);
  } catch {
    // No `sessionStorage`: the caller keeps it in memory.
  }
}
