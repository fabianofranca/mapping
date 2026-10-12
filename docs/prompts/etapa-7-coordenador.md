# Prompt do coordenador — Etapa 7 (correções da rodada dirigida)

> Prompt inicial da sessão que coordena a etapa 7 (plano na seção "Fases pendentes — Etapa 7" do `PLAN.md`). Para iniciar: numa sessão do Claude Code com este repositório, mande **"Leia `docs/prompts/etapa-7-coordenador.md` e execute."** (ou com um dos modos abaixo). No fechamento (fase 7.4) este arquivo vai para `docs/history/`.

---

Você é o **coordenador da etapa 7** do Mapping. Você não implementa as fases: distribui cada uma a um agente executor, confere o resultado e controla a ordem. Leia, nesta ordem, antes de qualquer ação: `CLAUDE.md`; no `PLAN.md`, a seção "Fases pendentes — Etapa 7" inteira (Objetivo, Decisões, Execução, as quatro fases, "Decisões a confirmar" e "Fora desta etapa"); `docs/history/relato-2026-10-12-dirigida.md` (o relato que originou a etapa: cada fase cita os achados por código, A1 a A3 e G1 a G4, e os pontos de "O que atrapalhou"); `docs/ARCHITECTURE.md`.

## Pré-condição

O `PLAN.md` da `main` precisa conter a etapa 7. Se não contiver, pare e avise o dono: o PR do plano ainda não foi mergeado.

## Modos de execução

O dono escolhe na mensagem inicial; sem indicação, vale **completa e paralela**.

- **Completa** ("execute"): as duas ondas, na ordem do `PLAN.md` (onda 1: 7.1, 7.2, 7.3; onda 2: 7.4). A onda 2 só começa com os três PRs da onda 1 mergeados.
- **Parcial** ("execute só a 7.1", "execute tudo menos a 7.3"): só as fases nomeadas. A 7.4 depende de todas as que entrarem; se o dono pedir a 7.4 com alguma fase da onda 1 fora, avise antes e proponha incluí-la ou adiar o fechamento.
- **Paralela** (padrão): os executores da onda 1 rodam ao mesmo tempo, cada um isolado (sessão ou worktree própria), partindo da `main` atual. Os arquivos das três fases são disjuntos (só `src/i18n/*` pode cruzar).
- **Sequencial** ("uma fase por vez"): um executor por vez, na ordem numérica; o dono recebe um PR de cada vez para revisar pelo celular.

Em qualquer modo, **releia a seção da etapa 7 no `PLAN.md` da `main` antes de abrir cada onda**: o plano pode ter mudado.

## Modelo e esforço

| Papel                                        | Modelo   | Esforço | Por quê                                                                                                             |
| -------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Coordenador (esta sessão)                    | Opus 5.5 | alto    | Lê diffs, julga aceite, resolve conflito de i18n, decide ambiguidades.                                              |
| 7.1 foco e Detalhes                          | Opus 5.5 | alto    | Foco e DOM em quatro lugares diferentes; é fácil "resolver" um caso e quebrar outro; precisa de testes por diálogo. |
| 7.2 canvas                                   | Opus 5.5 | médio   | Duas correções localizadas (colisão de rótulo, medição antes de enquadrar) com testes do canvas já existentes.      |
| 7.3 revisão, recentes e guia                 | Opus 5.5 | médio   | Duas mudanças de uma linha com teste e várias correções de texto no guia e no prompt do testador.                   |
| 7.4 fechamento                               | Opus 5.5 | médio   | Documentação e consolidação.                                                                                        |
| Agente do aceite da 7.3 (novo, sem contexto) | Opus 5.5 | médio   | Lê só os passos alterados de `docs/TESTING.md` e aponta o que ficou ambíguo.                                        |

Nenhuma fase pede Fable 5.1: são correções pequenas e bem delimitadas. Se o dono pedir para simplificar: tudo em Opus 5.5 médio, exceto a 7.1 em alto.

## Como executar

1. **Um executor por fase**, com o prompt do modelo abaixo. O executor trabalha no branch `claude/etapa-7-<n>-<assunto>`, abre o PR e devolve a URL. Não dê a um executor mais de uma fase, nem permita que ele toque em arquivos fora de "Toca em" da fase dele (exceção: `src/i18n/pt-BR.ts` e `en-US.ts`).
2. **Conferência de cada PR**, antes de aceitar. Leia o diff você mesmo e confira, item a item:
   - o teste que **reproduz o achado** existe, falha sem a correção (o commit do teste vem antes do da correção) e está citado no PR;
   - todos os checkboxes da fase estão marcados no `PLAN.md` no mesmo PR, e só os dela;
   - a descrição tem Resumo, Como testar (só desktop) e Decisões tomadas;
   - nada fora de "Toca em" mudou, e nenhuma refatoração "de carona" entrou;
   - o Aceite da fase está demonstrado (saída dos gates no PR; `check` e `e2e` verdes no último commit).
     Problema encontrado → devolva ao **mesmo** executor com o apontamento exato. Não corrija você, salvo conflito trivial de merge.
3. **Conflitos.** Se dois PRs da onda 1 conflitam (esperado só em i18n), mergeie a `main` no branch do segundo e resolva; não use rebase nem force-push em branch de executor.
4. **Merge.** Quando o PR está verde e aceito, faça o merge pelo botão comum (merge commit). Não mergeie se o dono tiver comentado pedindo para esperar. _(Se o dono preferir mergear ele mesmo, remova esta linha e, em vez de mergear, avise-o por PR.)_
5. **Decisões.** Siga o "Proposto" de "Decisões a confirmar" do `PLAN.md`, salvo comentário do dono. Ambiguidade que **mude comportamento visível** vira pergunta no PR da fase e uma linha na sua mensagem ao dono; as demais fases continuam.
6. **Fase 7.3.** O Aceite exige um agente **novo, sem contexto**, que leia só os passos alterados de `docs/TESTING.md` (seção 4, R0.3, R1.1, R4.2, R4.5, R4.6, R5.4) e o prompt do testador, e aponte o que ficou ambíguo ou contradiz a app (confira a lista de "O que atrapalhou" do relato). Você lança esse agente, cola o resultado no PR e corrige com o executor até zerar.
7. **Relatório.** Uma mensagem curta ao dono ao fim de cada onda: PRs mergeados, pendentes, bloqueios e decisões tomadas. Ao fim da etapa, um relatório final com os links de todos os PRs e as decisões consolidadas (que o executor da 7.4 leva para `docs/history/PLAN-etapa-7.md`). Lembre o dono de que a próxima rodada do Cowork, se ele quiser, é dirigida nos itens A1 a A3 e G1 a G4.

## Nunca

Não pule, desabilite ou afrouxe teste para ficar verde; não aceite PR que mude schema, formato da proposta ou comportamento do MCP (a etapa não toca em `mcp/`); não amplie o escopo de uma fase; não implemente nada de "Fora desta etapa"; não faça force-push; não comece a 7.4 com PR da onda 1 aberto.

## Prompt do executor (modelo)

Preencha `<n>`, `<título>` e `<assunto>` e envie ao agente da fase, no modelo e esforço da tabela acima:

> Você é o executor da **fase 7.<n> — <título>** da etapa 7 do Mapping. Leia, nesta ordem: `CLAUDE.md` inteiro; no `PLAN.md`, a seção "Fases pendentes — Etapa 7" até o fim de "Decisões" e depois **só** a sua fase (7.<n>) e "Decisões a confirmar"; no `docs/history/relato-2026-10-12-dirigida.md`, os achados e regressões que a sua fase cita (A1 a A3, G1 a G4, O2) e os pontos de "O que atrapalhou" que ela lista; `docs/ARCHITECTURE.md` nas partes que tocam os arquivos da sua fase. Ignore as outras fases.
>
> Regras: trabalhe no branch `claude/etapa-7-<n>-<assunto>` a partir da `main`. **Comece pelo teste que reproduz o achado** (ele precisa falhar antes da correção; faça o commit do teste antes do da correção). Mexa só nos arquivos de "Toca em" da sua fase (mais `src/i18n/pt-BR.ts` e `en-US.ts` se precisar de texto novo). Nenhuma refatoração além do necessário; nada do schema, do formato da proposta nem do MCP muda. Siga o "Proposto" de "Decisões a confirmar"; se algo ambíguo mudar comportamento visível, registre a pergunta no PR e escolha a opção mais conservadora.
>
> Antes de abrir o PR: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar. Marque os checkboxes da sua fase no `PLAN.md` no mesmo PR. A descrição do PR tem três seções: **Resumo**, **Como testar** (passos manuais no desktop, citando o passo do `docs/TESTING.md` que o achado afetava; o deploy do branch pode ser disparado por `workflow_dispatch`) e **Decisões tomadas**; cite o teste que reproduz o achado e cole a saída resumida dos gates.
>
> Entregue: a URL do PR, o resumo dos gates e a lista de decisões. Se ficar bloqueado por outra fase ou por algo fora do seu escopo, pare e diga exatamente o que falta; não contorne.
