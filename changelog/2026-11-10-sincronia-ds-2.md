# Sincronia do DS — 2026-11-10 (épico `epic/sincronia-ds-2`, PR #1439, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- DS1: as pendências abertas em `## Ficou sem gravar` de `docs/design-system/` (30 registros da tabela da #1390, mais os que entraram depois) passam para `docs/design-system/sincronia-ds-2.md`, conferidas contra a `main`, cada uma com a classe, a prova e a fase que a grava (DS3 texto, DS4 e DS5 prévias e conferências). Nos registros antigos, cada item vira "Passou para o registro do épico `epic/sincronia-ds-2`".
- `docs/DESIGN-SYSTEM.md`: o mapa ganha a tabela "Componentes: conversas e comentários" (`CommentPin`, `CitationChip`, `ThreadMessage`, `ThreadsSection`, `Composer`, `CommentsWindow`, `ProposalCard`, `DeleteThreadDialogs`, `ReferencedByRow`), o `InstallHint` aparece como usuário do `Notice`, `LayerCell` e `MarkingCell` ficam anotados no `DataGrid`, e `src/ui/comments/**` entra em "Quando verificar".
- Regra nova do fechamento (DS2): o fechamento de todo épico grava no artefato do DS as `## Pendências` do registro, por um subagente Sonnet com a ferramenta `Artifact` (`docs/DESIGN-SYSTEM.md` › "Ao gravar"); "curado à mão" não é motivo para não gravar. Fechamento que não gravou, tendo pendências reais, é defeito pendente e segura o merge; falha real da ferramenta deixa a etapa `esperando dono`. O `designSystemLog.test.ts` reprova o registro com data que não gravou e não explica cada item de `## Ficou sem gravar` (`Motivo:` ou "Passou para o registro do épico"). `Artifact` entrou em `permissions.allow` do `.claude/settings.json`, com teste.

## Corrigido

- `Notice` em linha (`size="line"`): a regra `flex: 1` pegava também a âncora do X (`IconButton`) e o afastava do botão de ação; agora vale só para a âncora do texto (`.notice-box-line > .tooltip-anchor:has(> .notice-box-text)`) (#1468).
- Botões da barra de status que abrem janela (conversas e avisos): `.status-item-button` ganha `color: inherit`, então usam a cor do item (`color-text-muted`) e o hover para `color-text` passa a ter efeito (#1468).
- Selo numérico do `IconButton` (`.icon-button-badge`): fica no canto do botão (`translate(50%, -50%)`) e não cobre mais o glifo ⋯ de "Mais controles" a 360px (#1468).
- Plural de containers: "1 container" (chave nova `perspective.count.containersOne`, pt-BR e en-US) no seletor de perspectivas, no Gerenciar e no Apagar; o seletor passa a usar o texto compartilhado `perspectiveContentText` em vez de uma cópia (#1468).
