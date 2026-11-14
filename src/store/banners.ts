import { signal } from '@preact/signals';

// Banners the user can dismiss. It is session-only UI state (the open app):
// it does not go to `localStorage`, to `mapping.json` or to undo (B9, P8).

/** The preview build's banner was dismissed in this session (the PREVIEW badge stays). */
export const previewBannerDismissed = signal(false);

export function dismissPreviewBanner(): void {
  previewBannerDismissed.value = true;
}

/** Opening notice keys that may stay at the top after the home screen leaves. */
export type ProjectNoticeKey = 'home.folderHasProject';

/** Notice of the last project opening (session UI state; the key, to follow the language). */
export const projectNotice = signal<ProjectNoticeKey | null>(null);

export function dismissProjectNotice(): void {
  projectNotice.value = null;
}
