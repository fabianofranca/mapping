import { signal } from '@preact/signals';
import { z } from 'zod';
import { readSetting, writeSetting } from '../utils/safeStorage';

// "Não lida" por dispositivo (etapa Comentários, decisão 16): o `lastReadAt` de cada conversa,
// por cópia do projeto (`ProjectStorage.copyId`, como o `mapping.reviewResume`), num blob
// versionado e validado do `localStorage`, sempre pelo `safeStorage`. Nunca vai para o arquivo
// da conversa nem para o projeto. Versão desconhecida, texto corrompido ou formato errado são
// descartados (a conversa volta a contar como não lida), não migrados.

const READS_KEY = 'mapping.threadReads';
const READS_VERSION = 1;
/** Conversas lembradas por cópia (as lidas mais recentemente). */
export const MAX_READS_PER_COPY = 500;

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
 * O que a pessoa leu, por cópia e conversa. Ler `.value` num `computed` ou componente faz o
 * "não lida" se atualizar quando `markThreadRead` grava.
 */
export const threadReads: { readonly value: Reads } = {
  get value() {
    return reads.value;
  },
};

function persist(next: Reads): void {
  reads.value = next;
  writeSetting(READS_KEY, JSON.stringify({ v: READS_VERSION, reads: next }));
}

/** Quando a pessoa leu a conversa por último nesta cópia, ou `null` se nunca. */
export function lastReadAt(copyId: string, threadId: string): string | null {
  return reads.value[copyId]?.[threadId] ?? null;
}

/** Marca a conversa como lida em `at`. Nunca recua: uma data anterior à guardada é ignorada. */
export function markThreadRead(copyId: string, threadId: string, at: string): void {
  const copy = reads.peek()[copyId] ?? {};
  const previous = copy[threadId];
  if (previous !== undefined && Date.parse(previous) >= Date.parse(at)) return;
  // Reinsere no fim: a ordem das chaves é a da leitura mais recente, e o limite tira as mais antigas.
  const others = Object.entries(copy).filter(([id]) => id !== threadId);
  const entries = [...others, [threadId, at] as const].slice(-MAX_READS_PER_COPY);
  persist({ ...reads.peek(), [copyId]: Object.fromEntries(entries) });
}

/** Esquece a conversa (apagada): ela não deixa entrada no blob. */
export function forgetThreadRead(copyId: string, threadId: string): void {
  const copy = reads.peek()[copyId];
  if (copy === undefined || !(threadId in copy)) return;
  const rest = Object.fromEntries(Object.entries(copy).filter(([id]) => id !== threadId));
  persist({ ...reads.peek(), [copyId]: rest });
}
