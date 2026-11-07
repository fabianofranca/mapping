# Comentários — [Não lançado] (épico `epic/comentarios`, PR #724, MCP 0.25.0, schema v15)

## Adicionado

- O formato **`mapping-thread` 1**, da conversa ancorada num item do mapeamento, documentado em `docs/COMMENT-FORMAT.md`: um arquivo por conversa em `comments/<id>.json` (as resolvidas em `comments/resolved/<id>.json`), fora do `mapping.json`, com as mensagens de pessoas e de agentes, as nove âncoras, o passo a passo para resolver um conflito do git e as regras de validade. É um formato novo: a app e o servidor MCP ainda não leem nem gravam a pasta `comments/`; isso chega nas próximas fases do épico.
- A **gramática da referência** `mapping://` ganha a camada (`l`) e a conversa (`c`), além dos segmentos de campo (`/f/`), par (`/e/`) e linha (`/r/`), e a citação passa a ser um link markdown comum com o nome atual do alvo. As referências de hoje (`m`, `i`, `a`, `p`) continuam valendo, e o servidor MCP não muda ainda.
