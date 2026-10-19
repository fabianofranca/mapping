# Relato de teste — Mapping (conferência curta do PR #179)

- Modo: dirigido, sem interação — R0.1; R5.2 (até a revisão aberta); R5.3d1, R5.3d2 e R5.3a na anotação Button do Entrar; visual a ~900 px (Árvore, Diagnóstico, Detalhes). R6.1 fora (pendente de decisão do dono).
- **Build id conferido (Configurações › Sobre): `7dcee05 · 2026-10-19`** (o preview mostrava `bcfbaf1`; **Atualizar** trouxe o esperado, sem Deploy novo)
- Painel de acompanhamento: https://claude.ai/artifact/UEi4pd2QB8LysQdfoANjxB
- PR: https://github.com/fabianofranca/mapping/pull/179 (Deploy #265 do preview)
- Navegador: Chrome 155 (extensão Claude in Chrome), Windows 10/11; DPR 1,25; viewport 1527 × 634 e 903 × 634
- MCP: 0.5.0-rc.1 por stdio (`scripts/testing/mcp-stdio-client.mjs`)
- Data: 2026-10-19, das 03:19 às 03:32

## Resumo

- Passos: 6, 6 ✅, 0 ❌, 0 não executados. Achados: nenhum.
- As correções do R5.3d (teclado) e das laterais a ~900 px se confirmaram no build `7dcee05`; a nota sugerida pelo mouse (R5.3a) continua certa.

## Passos

| Passo | Resultado | Observação |
| --- | --- | --- |
| R0.1 | ✅ | `7dcee05 · 2026-10-19`, canal prévia. **Ver os atalhos de teclado** abre a Ajuda; **Esc** fecha e o foco vai para **Configurações**. |
| R5.2 | ✅ | `create_project` (revision 0, sem `images/`) e `propose_changes` (22 operações) por stdio; `mapping.json` sem mudança. **Revisar**: 25 sem decisão; Proposto com Cadastro e Login; Atual "Nenhuma imagem ainda.". |
| R5.3d1 | ✅ | Tab até o ✕ do cartão, **Enter**: 0 `textarea`; foco no ✕ "Rejeitada: Anotação Button criada" (`aria-pressed=true`). **Enter** de novo: decisão limpa e o foco continua no ✕. |
| R5.3d2 | ✅ | **Rejeitar** do popover pelo teclado: 0 `textarea`; popover aberto e foco no "Rejeitada: …" do próprio popover, nunca no `body`. |
| R5.3a | ✅ | Clique de mouse no ✕ do cartão: `textarea` "Nota para o agente" vazio e com o foco; **Tab**: o campo some e o foco vai para o "Aceitar" do cartão. |
| Visual 900 | ✅ | 1527 px: Árvore 271, Diagnóstico 616, Detalhes 560. 903 px: 223 / 320 / 280, ✕ do Detalhes visível (831–859), `scrollWidth` 903, aba Diagnóstico visível. De volta a 1527: 271 / 616 / 560. |

## Achados

Nenhum.

## Observações (sem severidade)

- Depois de **Limpar** (mouse) no popover, o foco ficou no `body` (o popover continuou aberto).
- A ~903 px a faixa de abas de baixo rola para mostrar a aba ativa: "Lista" some e "Incompletas" aparece cortada; a aba **Diagnóstico** fica inteira.
- O clique no marcador do canvas não abriu o popover; ele abriu pelo marcador do cabeçalho da anotação em Detalhes (como o guia diz no R5.3).
- A proposta da `importacao` ficou "Em revisão" (24 sem decisão, 1 rejeitada); nada aplicado.

## O que atrapalhou

- `git checkout` no `repo/` da pasta montada ficou pela metade sem a permissão de exclusão (13 arquivos com conteúdo antigo, `.lock` em `.git/`); resolvido com a permissão e `git checkout -f`. O guia deveria dizer que a exclusão precisa estar liberada antes de trocar de commit.
- Coordenada de clique velha depois de a altura da janela mudar (medida de novo; não é da app).
- "Voltar a sem decisão" só funciona pelo **Limpar** do popover; o passo poderia dizer isso.
