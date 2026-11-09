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
/** Cópias de projeto lembradas (as tocadas mais recentemente; etapa #940, decisão 15). */
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
 * O que a pessoa leu, por cópia e conversa. Ler `.value` num `computed` ou componente faz o
 * "não lida" se atualizar quando `markThreadRead` grava.
 */
export const threadReads: { readonly value: Reads } = {
  get value() {
    return reads.value;
  },
};

/**
 * Aplica `change` à cópia sobre o blob relido do armazenamento (etapa #940, decisão 15): outra
 * aba pode ter gravado desde a nossa leitura, e juntar por chave não apaga a lida dela. Sem
 * armazenamento legível, parte do que a sessão já sabe. A cópia tocada vai para o fim e o limite
 * tira as mais antigas.
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

/** Quando a pessoa leu a conversa por último nesta cópia, ou `null` se nunca. */
export function lastReadAt(copyId: string, threadId: string): string | null {
  return reads.value[copyId]?.[threadId] ?? null;
}

/** Marca a conversa como lida em `at`. Nunca recua: uma data anterior à guardada é ignorada. */
export function markThreadRead(copyId: string, threadId: string, at: string): void {
  const previous = reads.peek()[copyId]?.[threadId];
  if (previous !== undefined && Date.parse(previous) >= Date.parse(at)) return;
  update(copyId, (copy) => {
    // Reinsere no fim: a ordem das chaves é a da leitura mais recente, e o limite tira as mais antigas.
    const others = Object.entries(copy).filter(([id]) => id !== threadId);
    return Object.fromEntries(
      [...others, [threadId, at] as const].slice(-MAX_READS_PER_COPY),
    );
  });
}

/** Esquece a conversa (apagada): ela não deixa entrada no blob. */
export function forgetThreadRead(copyId: string, threadId: string): void {
  const copy = reads.peek()[copyId];
  if (copy === undefined || !(threadId in copy)) return;
  update(copyId, (current) =>
    Object.fromEntries(Object.entries(current).filter(([id]) => id !== threadId)),
  );
}
