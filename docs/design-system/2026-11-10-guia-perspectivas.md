# Perspectivas no guia e no exemplo — 2026-11-10 (épico `epic/guia-perspectivas`)

## Pendências

O épico só muda o projeto de exemplo, o guia gerado, a documentação e o texto `help.guide.intro` (13 → 14 passos, cita as perspectivas). Nenhum componente, token ou ícone muda. Efeito no DS: o preview do `HelpDialog` no artefato mostra o texto antigo do guia ("12 passos", sem as perspectivas).

## Sincronização

Nada foi gravado no artefato **Mapping**: a gravação do preview do `HelpDialog` foi negada pelo classificador de permissões da sessão (ver abaixo). Sem token, ícone nem guia de componente afetados.

## Ficou sem gravar

- `components/HelpDialog/preview.html`: trocar "Um passeio de 12 passos … containers com Material 3 e a revisão de uma proposta." por "Um passeio de 14 passos … containers com Material 3, a revisão de uma proposta e as perspectivas." (igual a `help.guide.intro` em `src/i18n/pt-BR.ts`), com `lastChange` do índice atualizado. Motivo: a chamada de publicação no artefato foi negada pela permissão da sessão; o README do `HelpDialog` não cita a contagem e não muda.
