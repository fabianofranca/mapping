import { signal } from '@preact/signals';
import { z } from 'zod';
import { readSetting, writeSetting } from '../utils/safeStorage';

// "Unread" per device (Comments stage, decision 16): the `lastReadAt` of each thread,
// per project copy (`ProjectStorage.copyId`, like `mapping.reviewResume`), in a versioned,
// validated `localStorage` blob, always through `safeStorage`. It never goes into the thread
// file or the project. An unknown version, corrupted text or wrong format are
// discarded (the thread goes back to counting as unread), not migrated.

const READS_KEY = 'mapping.threadReads';
const READS_VERSION = 1;
/** Threads remembered per copy (the most recently read). */
export const MAX_READS_PER_COPY = 500;
/** Project copies remembered (the most recently touched; stage #940, decision 15). */
export const MAX_COPIES = 20;

const blobSchema = z.object({
  v: z.literal(READS_VERSION),
  reads: z.record(z.string(), z.record(z.string(), z.string())),
});

type Reads = Readonly<Record<string, Readonly<Record<string, string>>>>;

function parseBlob(raw: string | null): Reads {
  if (raw === null || raw === '') return {};
  try {
    const parsed = blobSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.reads : {};
  } catch {
    return {};
  }
}

const reads = signal<Reads>(parseBlob(readSetting(READS_KEY)));

/**
 * What the person has read, per copy and thread. Reading `.value` in a `computed` or component
 * makes "unread" update when `markThreadRead` writes.
 */
export const threadReads: { readonly value: Reads } = {
  get value() {
    return reads.value;
  },
};

/**
 * Applies `change` to the copy over the blob re-read from the storage (stage #940, decision 15):
 * another tab may have written since our read, and merging by key does not erase its read
 * mark. With no readable storage, it starts from what the session already knows. The touched
 * copy goes to the end and the limit drops the oldest.
 */
function update(
  copyId: string,
  change: (copy: Readonly<Record<string, string>>) => Readonly<Record<string, string>>,
): void {
  const raw = readSetting(READS_KEY);
  const base = raw === null ? reads.peek() : parseBlob(raw);
  const others = Object.entries(base).filter(([id]) => id !== copyId);
  const next = Object.fromEntries(
    [...others, [copyId, change(base[copyId] ?? {})] as const].slice(-MAX_COPIES),
  );
  reads.value = next;
  writeSetting(READS_KEY, JSON.stringify({ v: READS_VERSION, reads: next }));
}

/** When the person last read the thread in this copy, or `null` if never. */
export function lastReadAt(copyId: string, threadId: string): string | null {
  return reads.value[copyId]?.[threadId] ?? null;
}

/** Marks the thread as read at `at`. Never goes back: a date before the stored one is ignored. */
export function markThreadRead(copyId: string, threadId: string, at: string): void {
  const previous = reads.peek()[copyId]?.[threadId];
  if (previous !== undefined && Date.parse(previous) >= Date.parse(at)) return;
  update(copyId, (copy) => {
    // Reinserts at the end: key order is the most recent read first, and the limit drops the oldest.
    const others = Object.entries(copy).filter(([id]) => id !== threadId);
    return Object.fromEntries(
      [...others, [threadId, at] as const].slice(-MAX_READS_PER_COPY),
    );
  });
}

/** Forgets the thread (deleted): it leaves no entry in the blob. */
export function forgetThreadRead(copyId: string, threadId: string): void {
  const copy = reads.peek()[copyId];
  if (copy === undefined || !(threadId in copy)) return;
  update(copyId, (current) =>
    Object.fromEntries(Object.entries(current).filter(([id]) => id !== threadId)),
  );
}
