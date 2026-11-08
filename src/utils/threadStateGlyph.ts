// Traços dos glifos de estado da conversa na grade de 16px, compartilhados pelos ícones da interface
// (`ui/icons.tsx`: selos da janela Comentários e da seção Conversas) e pelo pino desenhado no canvas
// (`canvas/renderers/commentPins.ts`). Só traço, sem preenchimento (como o cadeado em `lockGlyph.ts`).

/** O estado que o glifo marca; os mesmos nomes de `PinColor` (o estado mais urgente do pino). */
export type ThreadStateKey = 'awaitingHuman' | 'awaitingAgent' | 'resolved';

/** Resolvida: o visto (o mesmo traço do ícone `check`). */
export const CHECK_PATHS: readonly string[] = ['m3 8.5 3.2 3.2L13 4.8'];

/** Aguardando você: a silhueta de uma pessoa (cabeça e ombros). */
export const AWAITING_HUMAN_PATHS: readonly string[] = [
  'M10.25 5.25a2.25 2.25 0 1 0-4.5 0a2.25 2.25 0 1 0 4.5 0Z',
  'M3.5 13.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2',
];

/** Aguardando o agente: a faísca de quatro pontas. */
export const AWAITING_AGENT_PATHS: readonly string[] = [
  'M8 2c.5 3.3 2.7 5.5 6 6-3.3.5-5.5 2.7-6 6-.5-3.3-2.7-5.5-6-6 3.3-.5 5.5-2.7 6-6Z',
];

/** Os traços de cada estado. */
export const THREAD_STATE_GLYPHS: Readonly<Record<ThreadStateKey, readonly string[]>> = {
  awaitingHuman: AWAITING_HUMAN_PATHS,
  awaitingAgent: AWAITING_AGENT_PATHS,
  resolved: CHECK_PATHS,
};
