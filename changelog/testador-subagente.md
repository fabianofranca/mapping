# Testador com subagente por lote — [Não lançado] (épico `epic/testador-subagente`, PR #0, MCP sem mudança, schema v18)

## Alterado

- Prompt do testador (`docs/TESTING-NUVEM.md`): a sessão principal não executa mais passos. Ela monta o ambiente (itens 1 a 6 de "Primeiros 10 minutos"), escreve o cabeçalho do relato, entrega cada lote a um subagente na mesma máquina (um lote por vez, nunca dois) e junta o relato com `cat >>`, sem abrir o arquivo. O item 7 manda montar os lotes e ler o briefing.
- `docs/TESTING-NUVEM-CONSULTA.md`: seção nova "Subagente por lote" (`cloud.mjs secao consulta.subagente`), com o modelo de briefing, a montagem do relato e a troca do subagente que falha. Lida antes do primeiro lote (o R0).
- `round-guide.mjs --faixas <roteiro|faixa…>`: imprime uma linha por lote, na ordem do guia, sem o R0. Roteiro de até 20 passos é um lote; acima, faixas de até 20 passos (`R25.1-R25.20`…); o passo que o `passo` junta ao anterior (R22.6a) não se separa.
- `cloud.mjs passo <Rn> --preparo`: imprime só o trecho do roteiro antes do primeiro passo (título, "O que cobre", Preparo e blocos de código, como as funções `tinta`, `sonda` e `medir` do R25), com o corte de 25 mil. Item que não é roteiro inteiro sai com código 2.
