# Cor do estado da conversa — 2026-11-09 (épico `epic/cor-do-estado`)

## Pendências

- **Tokens novos:** `color-thread-human`, `color-thread-human-bg`, `color-thread-agent`, `color-thread-agent-bg`, `color-thread-resolved` e `color-thread-resolved-bg` (temas claro e escuro, em `src/theme/tokens.ts`): texto e fundo do selo de estado da conversa, do mesmo matiz do `cv-pin-*` do estado.
- **Selos recoloridos:** o selo de estado da janela **Comentários** (`.comments-badge-human`, `-agent`, `-resolved`) e o da seção **Conversas** dos Detalhes (`.thread-state-*`) leem só os papéis novos; deixam de usar `warning`, `accent`/`selection` e `success`.
- **Nota:** pino (laranja, ciano, cinza), janela e Detalhes usam o mesmo matiz por estado. O pino do canvas (`cv-pin-*`) e o selo "aberta" sem mensagem (neutro) não mudam.

## Sincronização

Não gravado no artefato Mapping do Claude Design: a sessão de fechamento não tem acesso ao artefato (nenhuma ferramenta do Claude Design disponível). As pendências acima seguem para a próxima sincronização.

## Ficou sem gravar

- **Tokens novos:** `color-thread-human`, `color-thread-human-bg`, `color-thread-agent`, `color-thread-agent-bg`, `color-thread-resolved` e `color-thread-resolved-bg` (temas claro e escuro, em `src/theme/tokens.ts`): texto e fundo do selo de estado da conversa, do mesmo matiz do `cv-pin-*` do estado.
- **Selos recoloridos:** o selo de estado da janela **Comentários** (`.comments-badge-human`, `-agent`, `-resolved`) e o da seção **Conversas** dos Detalhes (`.thread-state-*`) leem só os papéis novos; deixam de usar `warning`, `accent`/`selection` e `success`.
- **Nota:** pino (laranja, ciano, cinza), janela e Detalhes usam o mesmo matiz por estado. O pino do canvas (`cv-pin-*`) e o selo "aberta" sem mensagem (neutro) não mudam.
