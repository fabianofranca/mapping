# Estado do pino — 2026-11-08 (épico `epic/estado-do-pino`)

## Pendências

- **EP1 — glifo de estado no pino e nos selos** (`src/utils/threadStateGlyph.ts`, `src/canvas/commentPins.ts`, `src/canvas/renderers/commentPins.ts`, `src/ui/icons.tsx`, `src/ui/comments/CommentsWindow.tsx`, `src/ui/comments/ThreadView.tsx`, `src/theme/panels.css`, `src/theme/threads.css`). Componentes: o **`CommentPin`** ganha o glifo do estado à esquerda do rótulo (12px de tela na grade de 16, traço 2, cor `cv-pin-text`): pessoa (aguardando humano), faísca de 4 pontas (aguardando agente) e visto (resolvida); a pílula cresce 14px, e o pino de rascunho (tracejado) não tem glifo; com várias conversas vale o estado mais urgente. `Canvas.md` e `Contraste.md` ("Pinos das conversas"): o estado se distingue em tons de cinza pelo glifo, e o texto do glifo tem o mesmo contraste do rótulo. Os **selos de estado** (`comments-badge` da janela Comentários e `thread-state` do `ThreadMessage`/seção Conversas) ganham o ícone antes do texto (`inline-flex`, `gap: var(--space-1)`; o texto continua sendo o nome acessível). Ícones novos no grupo `Icons` (grupo "Conversas"; 90 com os dois): `thread-awaiting-human` (silhueta de pessoa: `M10.25 5.25a2.25 2.25 0 1 0-4.5 0a2.25 2.25 0 1 0 4.5 0Z`, `M3.5 13.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2`) e `thread-awaiting-agent` (faísca: `M8 2c.5 3.3 2.7 5.5 6 6-3.3.5-5.5 2.7-6 6-.5-3.3-2.7-5.5-6-6 3.3-.5 5.5-2.7 6-6Z`); `check` segue com o mesmo desenho (agora lido de `threadStateGlyph.ts`). Tokens novos: nenhum.

## Sincronização

Nenhuma gravação no artefato Mapping do Claude Design: o artefato é curado à mão e a sessão do orquestrador não tem acesso a ele. A pendência acima passa para "Ficou sem gravar", para quem edita o artefato aplicar.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: glifo de estado no `CommentPin` (guia), selos de estado com ícone (`CommentsWindow`, `ThreadMessage`), ícones `thread-awaiting-human` e `thread-awaiting-agent` (upload no grupo Icons, contagem 90 para 92 e o grupo "Conversas") e os trechos de `Canvas.md` e `Contraste.md` (DS3).
- Passou para o registro do épico `epic/sincronia-ds-2`: cor do estado unificada entre pino, janela e Detalhes (#925): já resolvida pelo épico `epic/cor-do-estado` (`2026-11-09-cor-do-estado`), sem edição.
