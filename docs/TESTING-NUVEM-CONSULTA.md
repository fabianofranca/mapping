# Consulta do testador — leitura sob demanda

Trechos do prompt do testador ([`docs/TESTING-NUVEM.md`](TESTING-NUVEM.md)) que só alguns testadores leem. Cada seção tem uma chave do `node scripts/testing/cloud.mjs secao <chave>` (corte de 25.000 caracteres): `consulta.subagente`, `consulta.grupos`, `consulta.passada`, `consulta.regras` e `consulta.historico`. Os parágrafos vieram do prompt sem reescrita (etapa #1533, TE1).

## Subagente por lote

A sessão principal do testador não executa passos: entrega cada **lote** a um **subagente** (ferramenta `Agent`, o mesmo modelo da sessão, Sonnet) na mesma máquina, com o mesmo Chrome, o mesmo disco e o mesmo servidor do `cloud.mjs run` (com o `ctx`), e **um lote por vez, nunca dois ao mesmo tempo**, na ordem da lista da rodada (etapa [#1639](https://github.com/fabianofranca/mapping/issues/1639)). As cadeias (`principal`, `loja`, `telas`) ficam intactas, porque a pasta e o `ctx` são os mesmos.

**Os lotes.** O **R0** (inteiro, ou só o R0.1 pela regra do modo) e a **seção 6** (repositório de teste e MCP) são lotes próprios; a **passada visual** é o lote `visual`; os roteiros da lista saem de `node scripts/testing/round-guide.mjs --faixas <lista sem o R0>`, que imprime uma linha por lote, na ordem do guia: o roteiro de até 20 passos é um lote (`R13`), e acima disso vêm faixas consecutivas de até 20 passos (`R25.1-R25.20`, `R25.21-R25.40`…); uma faixa pedida (`R6.3-R6.7`) é respeitada e só se parte acima de 20; o passo que o `passo` junta ao anterior (R22.6a com o R22.6) não se separa. Roteiros pequenos não se juntam.

**Briefing.** A sessão principal preenche o modelo abaixo para cada lote e o passa como o prompt do subagente:

```text
Você executa o lote <lote> da rodada de teste da app Mapping, como subagente da sessão principal do testador. Não há dono para perguntar: o que impedir o lote vai para o relato.

Dados do lote
- Lote: <R25.21-R25.40 | R13 | R0 | R0.1 | secao6 | visual>
- Pasta de trabalho: ~/mapping-testes/<AAAA-MM-DD>-<alvo>/ (o `apoio/` é <pasta>/apoio; as capturas vão para <pasta>/anexos/)
- Pasta do projeto do roteiro: <pasta>/<nome> (a do `run`)
- Modo: <dirigido | completo, bloco k de 5 | dirigido, grupo k de n | reteste>
- Próximo número livre de achado: <k.n | n>

O que ler, nesta ordem
1. `docs/TESTING-NUVEM.md` inteiro e o `apoio/guia-base.md` inteiro (em pedaços abaixo de 25 mil tokens).
2. `node scripts/testing/cloud.mjs passo <Rn> --preparo` (todo lote de roteiro, inclusive a primeira faixa) e depois os passos do lote em grupos de até 8, com `cloud.mjs passo <Rn.a>-<Rn.b>`; o esperado vem do trecho impresso, não da memória.
3. As seções sob demanda com `cloud.mjs secao <chave>`, na hora que a linha delas na base indica.

Como agir
As regras de "Como agir", "Conferir e registrar" e "Nunca" do `docs/TESTING-NUVEM.md` valem para você como para a sessão principal: um `run` por grupo de até 8 passos, um `check` por esperado da Tela, o `state()` no fim para o Disco, a Reprodução de cada ❌ rodada duas vezes.

O que gravar
- Em `apoio/relato-<lote>.md`, no template da seção 10 do guia: as linhas da tabela de passos do lote (✅ seguidos sem observação em faixa de uma linha; ❌, "não executado (motivo)" e passos com observação em linha própria) e os achados, **já com o código final** (<k.n | n>, na ordem a partir do número livre), a severidade da escala do guia e a Reprodução de cada ❌.
- As capturas e os anexos em `anexos/`.
- No fim do arquivo, uma linha "Chamadas: passo <n>, secao <n>; guia.md lido por Read: sim|não", mais o que atrapalhou (passo ambíguo, contorno, `.mjs` próprio).

O que não fazer
Não poste nada no GitHub, não avise ninguém, não use `mark` (os `start` e `end` do roteiro são da sessão principal), não edite o `relato.md` nem nada no repositório.

O que devolver (uma linha só)
<lote>: N ✅, N ❌, N não executado; achados: <código severidade título curto…> ou nenhum; <caminho completo do arquivo>
```

**Montagem.** A sessão principal acrescenta cada `apoio/relato-<lote>.md` ao `relato.md` com `cat >>`, **sem abrir o arquivo**: os totais e os achados vêm da linha de retorno, e os códigos já chegam certos. O `mark(apoioDir, '<roteiro>', 'start' | 'end')` é dela: antes do primeiro lote do roteiro e depois do último. Para os anexos dos ❌ (as evidências no branch `evidencias` e o `mapping.json` em bloco de código), ela lê só o achado, pelo trecho do arquivo que o `relato-<lote>.md` indica.

**O subagente que falha.** O subagente que volta sem terminar o lote (erro, ferramenta, limite) é trocado **uma vez** por um novo, com o mesmo briefing e o pedido de começar no passo seguinte ao último gravado no `relato-<lote>.md`. Se o segundo também falhar, o resto do lote fica "não executado (subagente falhou: <motivo>)", e o fato vai para "O que atrapalhou".

## Rodada dirigida em grupos

Uma rodada dirigida (inclusive um reteste) cuja lista, **sem o R0**, passa de **40 passos** é dividida em **grupos de até ~40 passos**, no máximo **5 sessões ao mesmo tempo** (decisão do dono, 2026-11-09, etapa [#1148](https://github.com/fabianofranca/mapping/issues/1148)). Um roteiro sozinho acima de 40 (R12, R19, R25) é um grupo só; até 40 passos, uma sessão, como sempre. A granularidade é o roteiro (ou a faixa de passos que a lista já pedia, como `R6.3-R6.7`): nunca se parte um roteiro entre grupos.

**Quem divide é o coordenador**, não o testador: no clone do épico, `node scripts/testing/round-guide.mjs --grupos <roteiros>` conta os passos de cada item (sem o R0), soma e, acima do limite, imprime uma linha pronta para a mensagem por grupo, `grupo k de n: <roteiros>`, do maior para o menor; até o limite, imprime "uma sessão". O comando agrupa sozinho as cadeias abaixo e nunca passa de 5 grupos.

**Cadeias que não se separam** (da seção 8 do guia e da tabela dos blocos; cada cadeia fica inteira no mesmo grupo, e um item pedido de uma cadeia leva consigo os outros itens dela que a lista também pedir):

| Cadeia      | Itens                                           | Por quê                                                   |
| ----------- | ----------------------------------------------- | --------------------------------------------------------- |
| `principal` | R1, R3, R5, R6.3 a R6.7, R6.12 a R6.14, R7 e R8 | usam o projeto `principal` e o repositório de teste do R1 |
| `loja`      | R4 e R6.8a a R6.11                              | o R6.8a a R6.11 usam a pasta `loja` do R4.11              |
| `telas`     | R9 e R10                                        | o R10.7 usa o projeto `telas` do R9                       |

Os outros roteiros usam pastas próprias e podem ir a qualquer grupo. O `tests/tooling/roundBlocks.test.ts` confere que cada item da tabela existe no guia e que os de uma cadeia estão no mesmo bloco da tabela dos 5 blocos.

**Modo "dirigido, grupo k de n".** A mensagem "execute no modo dirigido, grupo k de n: `<roteiros>`" (k de 1 a n, n de 2 a 5) manda:

1. Gerar o guia da rodada só com os roteiros do grupo: `node scripts/testing/round-guide.mjs <roteiros do grupo> --out …/apoio/guia.md`; leia o `guia-base.md` inteiro e peça os roteiros pelo `passo` e as seções sob demanda pelo `secao` (item 3). O ambiente, as pastas de trabalho, o perfil do Chrome e o MCP são seus, de mais ninguém: os grupos não dividem pasta, perfil nem porta (como os blocos).
2. **R0:** o **grupo 1** executa o **R0 inteiro** primeiro; os grupos 2 em diante executam só o **R0.1** (build id do commit) e, do resto do R0, os passos de que os roteiros do grupo dependem (a regra do reteste), nunca o R0 inteiro. Depois, os roteiros do grupo, na ordem do guia.
3. Relatar no template da seção 10: `Modo: dirigido, grupo k de n (<roteiros>)`; a primeira linha do comentário é "Rodada dirigida — grupo k de n"; os achados são numerados `k.1`, `k.2`… (o código carrega o grupo, para o reteste achar de onde veio).
4. O aviso ao coordenador (item 5 da "Entrega") cita o grupo: "Grupo k de n: relato em <link>: …".

"Grupo" não colide com o "Parte i de n" dos comentários acima de 65 mil caracteres: um relato longo vira "Rodada dirigida — grupo k de n · Parte i de n".

**Retestes juntos.** O reteste de uma etapa é **uma sessão só**, com os achados de **todos** os grupos (ou blocos) e os passos que as correções dos defeitos pendentes afetam; só se divide em grupos se passar do limite acima, e cada grupo parte das **faixas** dos passos dos achados (o guia do grupo sai por elas, não pelos roteiros inteiros) e roda primeiro a **Reprodução** de cada achado, como no reteste restrito de "O que executar". Uma correção mesclada enquanto o reteste ainda não começou entra no mesmo reteste (mensagem em [`docs/FLOW.md`](FLOW.md)).

## Passada visual

Detalhe da passada visual: a regra de quem a faz em cada modo está em "O que executar", no prompt.

**Lista padrão:** as oito janelas (**Árvore**, **Camadas**, **Detalhes**, **Lista**, **Incompletas**, **Diagnóstico**, **Propostas** e **Comentários**) e os diálogos **Configurações**, **Exportar**, **Especializações**, **Pasta indisponível** e **Sair da revisão?**. Entra também a barra dos breadcrumbs com o **Enquadrar seleção**, habilitado (com uma marcação selecionada) e desabilitado (sem seleção), com o tooltip do **Shift+2**, a 1280×720 e a 900×720.

**Perspectivas:** o R23.12 e o R23.13 trazem a passada própria delas (seletor aberto, **Nova perspectiva…**, **Gerenciar perspectivas…**, a confirmação de apagar, o menu **Enviar para perspectiva** e a Principal com a área de chegada), a 1280×720 e a 900×720. Elas fazem parte do R23, entram em qualquer rodada que o rode (o bloco 5 na rodada em blocos) e não mudam a lista padrão acima.

**Conteúdo fora da imagem:** o R24.14 e o R24.15 trazem a passada própria dele (o canvas com a tela, o container "depois" e a seta; os Detalhes do evento com a tabela de alvos; os Detalhes de um item com **Referenciada por**; o seletor da célula aberto), a 1280×720 e a 900×720. Fazem parte do R24, entram em qualquer rodada que o rode (o bloco 4 na rodada em blocos) e não mudam a lista padrão acima.

Procure texto cortado ou sobreposto, barra de rolagem horizontal (a rolagem horizontal dentro da moldura da tabela de campos do **Catálogo**, `.catalog-table-wrap` com `overflow-x: auto`, é intencional e não é falha; a da página ou da janela inteira do **Catálogo** a 900×720, com `scrollWidth` maior que `clientWidth` fora da moldura, é falha), dica cobrindo menu e foco perdido ao fechar um diálogo: feche cada diálogo uma vez pelo teclado (Esc) e uma pelo mouse (**Cancelar** ou o X) e confira que o foco volta ao controle que o abriu, nunca ao `body` (em **Pasta indisponível**, o **Abrir** da linha que abriu o aviso, mesmo que não seja a primeira da lista: abra por uma linha de baixo). A regra do foco vale para os diálogos e para as janelas de ferramenta (**Árvore**, **Camadas**, **Catálogo**, **Detalhes** e as abas da janela inferior): fechar uma janela com o foco dentro devolve o foco a quem a abriu, senão ao botão da faixa, senão ao canvas, e trocar de aba da janela inferior (clique ou atalho) deixa o foco na aba ativa. Foco no `body` ou na seção da janela depois dessas ações é falha, não observação. Registre cada janela ou diálogo como uma linha da tabela ("Visual: Camadas"). Se a janela não redimensionar, marque a passada estreita como "não executado (janela não redimensionou; layout estreito coberto pelo e2e `narrowLayout.spec.ts`)".

## Regras de exceção

**R21 e a tag da release.** O R21 testa a **release real** no GitHub, não o build do commit, e não usa a app nem o Chrome: use a tag da lacuna "Tag da release: `mcp-v…-rc.n`" da mensagem; numa rodada completa na `main`, sem tag, a última estável (`releases/latest`, como o Preparo do R21 mostra). Com `sem R21`, o R21 não faz parte da rodada (pule-o, sem marcá-lo como falha nem como não executado; o relato só cita a frase). Dirigida que pede o R21 sem a lacuna: marque-o "não executado (a mensagem não trouxe a tag da release)".

**Regra para o que não dá para automatizar.** Se um passo dos roteiros principais exigir interação do dono e **não for muito relevante**, proponha no relato movê-lo para os roteiros sob demanda. Se for **muito relevante** (perda de dados, integridade do `mapping.json`, segurança), não decida: avise o dono no relato e na conversa; o passo fica onde está, "pendente de decisão". O R0.5 (`index.html` por `file://`) e o R6.2 (fechar a aba no meio da gravação) já estão nos roteiros sob demanda RF e RA (o R6.2 tem o e2e `tests/e2e/folder.spec.ts` no CI): não os tente.

## Histórico dos blocos

Por quê: o limite é o **tamanho do guia gerado** de cada bloco: até 200 mil caracteres, com 500 de folga desde a etapa #1502 (`MAX_BLOCK_GUIDE_CHARS`, 200.500, no `tests/tooling/roundBlocks.test.ts`, que gera o guia de cada bloco com o `round-guide.mjs` e mede; medido em 2026-11-13, na etapa #1712: guia de 157.215, 195.835, 156.787, 185.441 e 173.616, e base de 37.125, 43.218, 39.510, 40.503 e 36.869 contra o teto de 45.000 (`MAX_BLOCK_BASE_CHARS`); o maior passo, o R17.46, tem 1.693 contra o limite de 1.700; os tetos não mudaram na #1712, porque desde a TE1 (#1533) o limite mede só o que o testador lê), porque o bloco 3 da #747 (242 mil) acabou o orçamento de contexto. Com a base do guia (~85 mil, inclusive o R0) em todo bloco e ~499 mil dos roteiros, 4 blocos dariam ~210 mil em média; por isso são 5 (decisão do dono, 2026-11-09). A coluna **Passos** conta o R0, que está nos cinco; são 530 passos distintos, e ela é informativa. As dependências da seção 8 do guia mandam: R1, R3, R5, R6.3 a R6.7, R7 e R8 usam o `principal` e o repositório de teste (bloco 1, com o R17); R6.8a a R6.11 usam a pasta `loja` do R4.11 (bloco 4, com o R4); o R10.7 usa o projeto `telas` do R9 (bloco 4); o resto usa pastas próprias. A passada visual fica no bloco 4 (decisão 6 da etapa #841): é o que tem o que a lista padrão abre, **Pasta indisponível** pelo R0.7 (nos cinco blocos), **Sair da revisão?** pelo R4 e as propostas e a revisão do R4, e **Especializações**, **Exportar** e **Configurações** com qualquer projeto, e um guia de 185 mil, abaixo do teto. A seção 6 (repositório de teste e MCP) está nos cinco blocos. O R25 (Componentes fiéis) usa a pasta própria `fiel` e as bibliotecas `m3-fiel*` e fica no bloco 2 (a FX4 da etapa #896 trocou o R13, que passou ao bloco 4, pelo R2, que veio do bloco 4, para os passos novos do R25 caberem; R2 e R13 não dependem de ninguém); o R12 e o R19, os mais longos, ficam juntos no bloco 3. O teste `tests/tooling/roundBlocks.test.ts` confere a tabela contra os passos do guia e o limite por bloco: um roteiro novo, ou um que estoure o limite, o faz falhar até ser posto num bloco; e confere que a passada visual está em exatamente um bloco, o da tabela.

**Linha de base do fluxo enxuto (etapa #1533, commit `7a11ccb`, relatos na [#1543](https://github.com/fabianofranca/mapping/issues/1543); medida de custo e contexto da etapa #1712, lida no `get_session` em 2026-11-13):** o contexto final é o `context_usage.used_tokens` e o custo é o `cost_usd` de cada sessão "Testador — testador-enxuto, bloco k de 5"; os retestes são "Reteste — testador-enxuto (CL1, #1603)" e "(CL2, #1606)". O contexto do bloco 4, que a própria sessão não mediu (`used_tokens` 0), vale pelo `get_session` lido depois.

| Sessão      | Contexto final | Custo     | Passos, tempo, `run`, checks                                                                                                    |
| ----------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bloco 1     | 747.481        | US$ 23,04 | 129 passos, 63min28s, 307 `run`, 517 checks                                                                                     |
| Bloco 2     | 489.804        | US$ 11,21 | 108 passos, 37min24s, 143 `run`, 90 checks                                                                                      |
| Bloco 3     | 537.350        | US$ 14,13 | 35min06s, 182 `run`, 360 checks                                                                                                 |
| Bloco 4     | 527.364        | US$ 13,19 | 135 passos, 40min10s, 196 `run`, 24 checks                                                                                      |
| Bloco 5     | 471.215        | US$ 10,76 | 100 passos, 33min13s, 173 `run`, 380 checks                                                                                     |
| Reteste CL1 | 365.904        | US$ 5,78  | 32 passos, 14min56s, 79 `run`, 31 checks                                                                                        |
| Reteste CL2 | 210.450        | US$ 1,63  | R0.1, R18.1 a R18.4, R24: 4min56s, 23 `run`, 9 checks (relato da [#1606](https://github.com/fabianofranca/mapping/issues/1606)) |

Dos 5 blocos: custo somado US$ 72,33 e mediana US$ 13,19; contexto final de 471 a 747 mil, com mediana de 527 mil. O custo por check (US$ 0,03 no bloco 5, US$ 0,04 nos blocos 1 e 3, US$ 0,13 no 2 e US$ 0,55 no 4; US$ 0,19 no reteste da CL1) é só informativo: a contagem de checks varia muito por bloco (24 no bloco 4, 517 no bloco 1) e ele não serve para comparar blocos. Contra a linha de base da #1532 (US$ 0,11 a 0,13 por check e mediana de US$ 5,25), os blocos da #1543 saem mais caros por sessão.

**Critério dos 300 mil (decisão 11 da #1533):** nenhuma das 5 sessões ficou abaixo de 300 mil (471 a 747 mil), nem o reteste da CL1 (366 mil); só o reteste da CL2 (210 mil) ficou abaixo. A medida é de antes do subagente por lote (TC1, #1639), que é o que passou a garantir o teto, e a tabela de blocos não muda por isso: desde a TC2 (#1639, decisão 8) o excesso se registra sem mover roteiros. A `roadmap` "Teto de contexto do testador" é da fila, para as rodadas de agora.

**Linha de base da #747 (tempos da [#778](https://github.com/fabianofranca/mapping/issues/778) e da [#807](https://github.com/fabianofranca/mapping/issues/807), em 3 blocos que não terminaram: o bloco 1 parou no R25.23 por tempo, o bloco 3 acabou o contexto com 42 passos não executados):** R1 12:54, R3 11:33, R5 8:38, R12 22:51, R22 7:20, R23 8:29 e R25.24 a R25.66 17:17. A desta rodada em 5 blocos está abaixo.

**Linha de base da rodada em 5 blocos (etapa [#841](https://github.com/fabianofranca/mapping/issues/841), commit `1dd6114`, relatos nos comentários da [#852](https://github.com/fabianofranca/mapping/issues/852)):** os cinco blocos terminaram, sem passo "não executado" por tempo ou por contexto (o único não executado, o arrastar da Paleta do R12.12, é por ferramenta: o guia manda marcá-lo "precisa do dono"). Tempo por bloco e passos: bloco 1 48:02 (113 passos, 113 ✅), bloco 2 38:04 (96, 93 ✅ e 3 ❌), bloco 3 37:34 (108, 107 ✅ e 1 não executado), bloco 4 42:51 (99, 99 ✅) e bloco 5 30:14 (108, 108 ✅); soma 197:45, e só o bloco 1 passa dos 45 min indicativos. Tempo por roteiro: R1 14:02, R3 10:43, R5 8:10, R12 20:48, R19 10:00, R22 7:15, R23 8:48, R9 11:35 e R25 inteiro (R25.1 a R25.66) 27:41; contra a #747: R1 12:54, R3 11:33, R5 8:38, R12 22:51, R22 7:20 e R23 8:29. O R25 inteiro leva 27:41 (a #747 mediu só o R25.24 a R25.66, 17:17), por isso fica sozinho no bloco 2. Os 3 ❌ (R13.9, R25.18 e R25.48) e o chip de 1 px do **Arrumar** (R11.7) foram corrigidos em quatro fases de correção e reteste dirigido na mesma etapa (o R13.9 virou a decisão do dono na [#1196](https://github.com/fabianofranca/mapping/issues/1196)).

**Linha de base anterior (3 blocos; tempo medido por bloco, etapa #482, commit `159f46d`):** bloco 1 43:44, bloco 2 36:33 (com a passada visual) e bloco 3 33:52 ([resumo](https://github.com/fabianofranca/mapping/issues/485#issuecomment-6643772361)); a da etapa #424 era 47:18, 35:13 e 38:11 ([resumo](https://github.com/fabianofranca/mapping/issues/424)). Meta indicativa de 45 min, sem ser critério de falha.
