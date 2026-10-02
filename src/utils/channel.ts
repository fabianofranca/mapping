// Canal do build: `main` (produção) ou `preview` (um branch publicado em /preview/
// pelo `workflow_dispatch`). O preview usa armazenamento separado para nunca migrar
// nem apagar os projetos da versão principal (ver PLAN.md 14.3, "Preview isolado").

export type Channel = 'main' | 'preview';

export function parseChannel(value: unknown): Channel {
  return value === 'preview' ? 'preview' : 'main';
}

/** Canal deste build, definido por `VITE_CHANNEL` na hora do build. */
export const CHANNEL: Channel = parseChannel(import.meta.env.VITE_CHANNEL);

export const isPreview = CHANNEL === 'preview';

/** Chave do `localStorage` no canal: o preview ganha o prefixo `preview:`. */
export function channelStorageKey(key: string, channel: Channel = CHANNEL): string {
  return channel === 'preview' ? `preview:${key}` : key;
}

/** Nome do banco IndexedDB no canal: o preview ganha o sufixo `-preview`. */
export function channelDbName(name: string, channel: Channel = CHANNEL): string {
  return channel === 'preview' ? `${name}-preview` : name;
}
