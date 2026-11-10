# Guia da rodada sob demanda — [Não lançado] (épico `epic/guia-sob-demanda`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- `round-guide.mjs --out <pasta>/<nome>.md` passa a gravar três arquivos: o `<nome>.md` (igual ao de antes), o `<nome>-base.md` (o guia sem as seções `### R<n>`, cada uma trocada por uma linha com o comando que a imprime) e o `<nome>-indice.tsv` (seção, roteiro e passo → linhas do `<nome>.md`). Sem `--out`, a saída não muda.
- Novo `node scripts/testing/cloud.mjs passo <item…> [--guia=<arquivo>]`: imprime do guia da rodada (`<APOIO>/guia.md`, ou o `--guia`) o roteiro sem as linhas de passo (`R12`), um passo (`R12.4`) ou uma faixa (`R12.1-R12.8`), com o cabeçalho da tabela. Corta em 25.000 caracteres, na última linha inteira, e diz como continuar. Item que o guia não tem sai com código 2 e diz o que o guia tem. Não abre o Chrome.
- O último passo pedido leva consigo os que dependem dele: `R22.3-R22.6` traz também o R22.6a.
- Um teste confere que toda linha do guia da rodada (`R0 R12 R22` e `all`) está na base ou no `passo` de algum roteiro: nada se perde.
