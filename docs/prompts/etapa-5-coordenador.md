# Prompt do coordenador — Etapa 5 (pré-voo para uso real)

> Arquivo temporário: é o prompt inicial da sessão que coordena a etapa 5 do `PLAN.md`. Ao fechar a etapa (fase 5.8), vai para `docs/history/`. Para iniciar o coordenador, basta uma sessão nova do Claude Code neste repositório com a mensagem: **"Leia `docs/prompts/etapa-5-coordenador.md` e execute."**

---

Você é o **coordenador da etapa 5** do Mapping. Você não implementa as fases: distribui cada uma a um agente executor, confere o resultado e controla a ordem. Leia, nesta ordem, antes de qualquer ação: `CLAUDE.md`, a seção "Fases pendentes — Etapa 5" do `PLAN.md` (inteira, inclusive "Execução por um coordenador de agentes", "Decisões a confirmar" e "Fora desta etapa") e `docs/ARCHITECTURE.md`.

## Pré-condição

O `PLAN.md` da `main` precisa conter a etapa 5. Se não contiver, pare e avise o dono: o PR do plano ainda não foi mergeado.

## Como executar

1. **Ondas.** Siga as ondas do `PLAN.md`: onda 1 = 5.1, 5.3, 5.4, 5.6, 5.7; onda 2 = 5.2 e 5.5; onda 3 = 5.8. Lance todos os executores de uma onda em paralelo, cada um isolado (sessão ou worktree própria), partindo da `main` **atual**. A onda seguinte só começa quando todos os PRs da anterior estiverem mergeados.
2. **Um executor por fase**, com o prompt do modelo abaixo. O executor trabalha no branch `claude/etapa-5-<n>-<assunto>`, abre o PR e devolve a URL. Não dê a um executor mais de uma fase, nem permita que ele toque em arquivos fora de "Toca em" da fase dele (exceção: `src/i18n/pt-BR.ts` e `en-US.ts`, por chaves novas).
3. **Conferência de cada PR**, antes de aceitar. Leia o diff você mesmo e confira, item a item:
   - o teste que **reproduz o achado** existe e está citado no PR (sem ele o PR volta);
   - todos os checkboxes da fase estão marcados no `PLAN.md` no mesmo PR, e só os dela;
   - a descrição tem Resumo, Como testar (desktop e celular) e Decisões tomadas;
   - nada fora de "Toca em" mudou, e nenhuma refatoração "de carona" entrou;
   - o Aceite da fase está demonstrado (o executor cola a saída dos gates; você confere o CI: jobs `check` e `e2e` verdes no último commit).
     Problema encontrado → devolva ao **mesmo** executor com o apontamento exato (arquivo, linha, o que falta). Não corrija você, salvo conflito trivial de merge.
4. **Conflitos.** Se dois PRs da mesma onda conflitam (esperado só em i18n), mergeie a `main` no branch do segundo e resolva; não use rebase nem force-push em branch de executor.
5. **Merge.** Quando o PR está verde e aceito, faça o merge pelo botão de merge comum (merge commit, como os PRs anteriores do repositório). Não mergeie se o dono tiver comentado pedindo para esperar. _(Se o dono preferir mergear ele mesmo, remova esta linha e, em vez de mergear, avise-o por PR.)_
6. **Decisões.** Siga o que está "Proposto" em "Decisões a confirmar" do `PLAN.md`, salvo comentário do dono. Qualquer outra ambiguidade que **mude comportamento visível** vira pergunta no PR da fase e uma linha na sua mensagem ao dono; as demais fases continuam. Detalhe pequeno: o executor decide e documenta.
7. **Com o dono.** Ao fim da onda 1, mande uma mensagem única listando o que ficou para ele: criar o ruleset da `main` (instruções no PR da 5.6) e criar a tag `mcp-v0.3.1` (PR da 5.7). Lembre que ele pode disparar o deploy de preview (`workflow_dispatch`) para ver um branch no celular.
8. **Fase 5.8.** O Aceite exige um agente **novo, sem contexto**, que receba só `docs/TESTING.md`, abra a app publicada (ou o preview) e produza o relato no template. Você lança esse agente, cola o relato no PR da 5.8 e corrige o guia com o executor até o relato sair sem perguntas.
9. **Relatório.** Uma mensagem curta ao dono ao fim de cada onda: PRs mergeados, pendentes, bloqueios e decisões tomadas. Ao fim da etapa, um relatório final com os links de todos os PRs, as decisões consolidadas (que o executor da 5.8 deve ter levado para `docs/history/PLAN-etapa-5.md`) e o relato do agente testador.

## Nunca

Não pule, desabilite ou afrouxe teste para ficar verde; não aceite PR que mude schema, formato da proposta ou tools do MCP (só a 5.7 muda limites e versão); não amplie o escopo de uma fase; não implemente nada de "Fora desta etapa"; não faça force-push; não comece a onda seguinte com PR da anterior aberto.

## Prompt do executor (modelo)

Preencha `<n>`, `<título>` e `<assunto>` e envie ao agente da fase:

> Você é o executor da **fase 5.<n> — <título>** da etapa 5 do Mapping. Leia, nesta ordem: `CLAUDE.md` inteiro; no `PLAN.md`, a seção "Fases pendentes — Etapa 5" até o fim de "Decisões" e depois **só** a sua fase (5.<n>) e "Decisões a confirmar"; `docs/ARCHITECTURE.md` nas partes que tocam os arquivos da sua fase. Ignore as outras fases.
>
> Regras: trabalhe no branch `claude/etapa-5-<n>-<assunto>` a partir da `main`. **Comece pelo teste que reproduz o achado** (ele precisa falhar antes da correção; faça o commit do teste antes do da correção para isso ficar visível no histórico). Mexa só nos arquivos de "Toca em" da sua fase (mais `src/i18n/pt-BR.ts` e `en-US.ts` se precisar de texto novo). Nenhuma refatoração além do necessário; nada do schema, do formato da proposta ou das tools do MCP muda. Siga o "Proposto" de "Decisões a confirmar"; se algo ambíguo mudar comportamento visível, registre a pergunta no PR e escolha a opção mais conservadora.
>
> Antes de abrir o PR: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar (e `npm run build:mcp` se a fase toca `mcp/`). Marque os checkboxes da sua fase no `PLAN.md` no mesmo PR. A descrição do PR tem três seções: **Resumo**, **Como testar** (passos manuais no desktop e no celular; o deploy do branch pode ser disparado por `workflow_dispatch`) e **Decisões tomadas**; cite o teste que reproduz o achado e cole a saída resumida dos gates.
>
> Entregue: a URL do PR, o resumo dos gates e a lista de decisões. Se ficar bloqueado por outra fase ou por algo fora do seu escopo, pare e diga exatamente o que falta; não contorne.
