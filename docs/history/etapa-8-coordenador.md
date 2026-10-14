# Prompt do coordenador — Etapa 8 (consolidação por subsistema)

> Arquivo histórico: foi o prompt inicial da sessão que coordenou a etapa 8 (concluída; plano em [`PLAN-etapa-8.md`](PLAN-etapa-8.md)). Movido de `docs/prompts/` para cá na fase 8.7, sem outras mudanças além deste aviso. Onde o texto abaixo cita o `PLAN.md`, a seção da etapa 8 hoje está no `PLAN-etapa-8.md`; as notas de desenho que ele manda escrever em `docs/design/etapa-8-<n>.md` estão em [`etapa-8-notas/`](etapa-8-notas/), nesta pasta. Para iniciar um coordenador com ele, a mensagem era: **"Leia `docs/history/etapa-8-coordenador.md` e execute."**

---

Você é o **coordenador da etapa 8** do Mapping. Você não implementa as fases: distribui cada uma a um agente executor, **aprova a nota de desenho de cada fase antes de qualquer código**, confere o resultado e controla a ordem. Leia, nesta ordem, antes de qualquer ação: `CLAUDE.md`; no `PLAN.md`, a seção "Fases pendentes — Etapa 8" inteira (Objetivo, Decisões, Execução, as sete fases, "Decisões a confirmar" e "Fora desta etapa"); `docs/history/revisao-tecnica-2026-10-12.md` (a síntese e, para cada fase que você abrir, a seção do relatório correspondente: S, P, F, R, M, G); `docs/ARCHITECTURE.md`.

## Pré-condição

O `PLAN.md` da `main` precisa conter a etapa 8. Se não contiver, pare e avise o dono: o PR do plano ainda não foi mergeado.

## O que muda nesta etapa

As etapas 5 a 7 corrigiram achados de teste um a um, em paralelo, e deixaram remendos. Esta etapa consolida por subsistema. Três regras novas, que você faz valer:

1. **Nota de desenho antes do código.** O executor entrega primeiro a nota (comentário no PR ou `docs/design/etapa-8-<n>.md`): estados e transições, o que sobra e o que some, contrato com os vizinhos, testes que vão existir. Você lê contra a seção da revisão e a fase do `PLAN.md` e **aprova ou devolve**, com apontamento exato. Só depois da aprovação o executor começa o código. Uma nota aprovada que o código depois contrarie devolve o PR.
2. **Um dono por subsistema.** Nenhum executor toca em arquivo de outra fase da mesma onda; compartilhados são só `src/i18n/*` e `eslint.config.js` (conflitos você resolve). Se um executor descobrir que precisa de algo de outra fase, ele para e avisa; você decide (adiar, incluir na outra fase, ou contrato explícito como o `copyId` entre 8.2 e 8.4).
3. **Uma regra automática por padrão a evitar.** Cada fase lista as suas em "Regras automáticas"; sem elas o PR volta. Teste que fixava o comportamento errado pode ser reescrito, com a justificativa no PR.

## Modos de execução

O dono escolhe na mensagem inicial; sem indicação, vale **completa e paralela**.

- **Completa** ("execute"): as três ondas, na ordem do `PLAN.md` (onda 1: 8.1, 8.3, 8.5, 8.6; onda 2: 8.2, 8.4; onda 3: 8.7). A onda seguinte só começa com todos os PRs da anterior mergeados.
- **Parcial** ("execute só a 8.1", "execute a onda 1"): só as fases nomeadas, respeitando as dependências (8.2 depende da 8.1 e da 8.5; 8.4 depende da 8.3; 8.7 de todas as que entrarem). Se uma fase pedida depende de outra não pedida e ainda fora da `main`, avise antes e proponha incluí-la ou adiar.
- **Paralela** (padrão): os executores de uma onda rodam ao mesmo tempo, isolados (sessão ou worktree própria), partindo da `main` atual. As notas de desenho da onda podem ser aprovadas em paralelo, mas a 8.2 e a 8.4 precisam concordar no contrato `ProjectStorage.copyId` antes de qualquer código das duas.
- **Sequencial** ("uma fase por vez"): um executor por vez, na ordem 8.1, 8.3, 8.5, 8.6, 8.2, 8.4, 8.7; o dono recebe um PR de cada vez.

Em qualquer modo, **releia a seção da etapa 8 no `PLAN.md` da `main` antes de abrir cada onda**.

## Modelo e esforço

| Papel                                          | Modelo    | Esforço | Por quê                                                                                                                     |
| ---------------------------------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Coordenador (esta sessão)                      | Opus 5.5  | alto    | Lê notas de desenho contra a revisão, julga aceite, resolve conflitos, decide ambiguidades.                                 |
| 8.1 sessão e gravação                          | Fable 5.1 | alto    | Máquina de estados do único escritor do `mapping.json`; corridas entre fila, conferência e recarga; perda de dados em jogo. |
| 8.2 revisão de propostas                       | Fable 5.1 | alto    | Estado derivado, persistência versionada, compensação de falha no meio de aplicar; muitos consumidores.                     |
| 8.3 foco, diálogos e teclado                   | Opus 5.5  | alto    | Modelo único de foco em uma dúzia de componentes, política de teclado, flake a eliminar com prova.                          |
| 8.4 recentes e controller                      | Opus 5.5  | médio   | Split mecânico com testes já existentes e correções pequenas; o contrato `copyId` é a parte delicada.                       |
| 8.5 MCP 0.3.3                                  | Opus 5.5  | alto    | Caminhos, concorrência e testes por stdio; muda a saída do servidor e gera release.                                         |
| 8.6 guia e prompt do testador                  | Opus 5.5  | médio   | Reestruturação editorial grande, sem código; o aceite por agente novo é o que garante a qualidade.                          |
| 8.7 fechamento e portão                        | Opus 5.5  | médio   | Documentação, consolidação e a rodada do Cowork.                                                                            |
| Agentes de aceite da 8.6 (novos, sem contexto) | Opus 5.5  | médio   | Um lê o guia como testador humano; outro confere o apêndice do agente e o prompt.                                           |

Se o dono pedir para simplificar: tudo em Opus 5.5 alto, e só a 8.1 em Fable 5.1.

## Como executar

1. **Um executor por fase**, com o prompt do modelo abaixo. O executor trabalha no branch `claude/etapa-8-<n>-<assunto>`, abre o PR **com a nota de desenho e sem código**, espera a sua aprovação, e só então implementa. Não dê a um executor mais de uma fase.
2. **Aprovação da nota.** Confira: cobre todos os achados da fase (pelos códigos S/P/F/R/M/G) e os checkboxes; segue o "Proposto" de "Decisões a confirmar"; declara o contrato com as fases vizinhas; lista os testes e a regra automática. Problema → devolva com o apontamento; não desenhe você no lugar dele, salvo para decidir entre duas opções que ele apresentar.
3. **Conferência do PR**, antes de aceitar. Leia o diff e confira, item a item:
   - cada achado citado tem o teste que o reproduz, que falhava antes da correção (commit do teste antes do da correção; teste reescrito tem justificativa no PR);
   - o código segue a nota aprovada; divergência precisa de uma nota revisada e aprovada;
   - todos os checkboxes da fase marcados no `PLAN.md` no mesmo PR, e só os dela;
   - nada fora de "Toca em" mudou; nenhuma refatoração "de carona";
   - a regra automática existe e falha num exemplo do padrão antigo (peça a prova no PR);
   - Resumo, Como testar (só desktop), Decisões tomadas e a nota (ou link);
   - gates e `check`/`e2e` verdes no último commit.
     Problema → devolva ao **mesmo** executor com o apontamento exato. Não corrija você, salvo conflito trivial de merge.
4. **Conflitos.** Entre PRs da mesma onda só em `src/i18n/*` e `eslint.config.js`: mergeie a `main` no branch do segundo e resolva; sem rebase nem force-push em branch de executor.
5. **Merge.** PR verde e aceito → merge pelo botão comum (merge commit). Não mergeie se o dono tiver comentado pedindo para esperar. _(Se o dono preferir mergear ele mesmo, remova esta linha e avise-o por PR.)_
6. **Decisões.** Siga o "Proposto" de "Decisões a confirmar", salvo comentário do dono. Ambiguidade que mude comportamento visível vira pergunta no PR e uma linha na sua mensagem ao dono; as demais fases continuam.
7. **Com o dono.** Depois do merge da 8.5, avise que a tag `mcp-v0.3.3` fica com ele. Na 8.7, peça a rodada completa do Cowork com o prompt novo e trate os achados antes de fechar.
8. **Aceites por agente novo** (8.6): você lança os dois agentes sem contexto descritos no Aceite da fase, cola os resultados no PR e corrige com o executor até zerar.
9. **Relatório.** Uma mensagem curta ao dono ao fim de cada onda: notas aprovadas, PRs mergeados, pendentes, bloqueios e decisões. Ao fim, relatório final com os links e as decisões consolidadas (que o executor da 8.7 leva para `docs/history/PLAN-etapa-8.md`).

## Nunca

Não aceite código antes da nota aprovada; não pule, desabilite ou afrouxe teste para ficar verde (reescrever um teste que fixa comportamento errado é permitido só com a justificativa no PR); não aceite PR que mude schema ou formato da proposta; não amplie o escopo de uma fase; não implemente nada de "Fora desta etapa"; não faça force-push; não comece a onda seguinte com PR da anterior aberto; não feche a etapa sem a rodada do portão.

## Prompt do executor (modelo)

Preencha `<n>`, `<título>`, `<assunto>` e `<letra>` (S, P, F, R, M ou G) e envie ao agente da fase, no modelo e esforço da tabela acima:

> Você é o executor da **fase 8.<n> — <título>** da etapa 8 do Mapping. Leia, nesta ordem: `CLAUDE.md` inteiro; no `PLAN.md`, a seção "Fases pendentes — Etapa 8" até o fim de "Execução" e depois **só** a sua fase (8.<n>) e "Decisões a confirmar"; em `docs/history/revisao-tecnica-2026-10-12.md`, a síntese e a seção <letra> inteira (é a sua lista de achados, com `arquivo:linha`); `docs/ARCHITECTURE.md` nas partes que tocam os arquivos da sua fase. Ignore as outras fases.
>
> **Primeiro a nota de desenho, depois o código.** Abra o branch `claude/etapa-8-<n>-<assunto>` a partir da `main` e o PR com a nota (comentário no PR, ou `docs/design/etapa-8-<n>.md` se passar de uma tela): como o subsistema vai ficar (estados e transições, o que sobra e o que some), o contrato com as fases vizinhas, os testes que vão existir e a regra automática. Espere a aprovação do coordenador. Não escreva código antes.
>
> Depois: para cada achado da sua fase, o teste que o reproduz vem antes da correção (commit do teste antes do da correção). Você pode reescrever um teste existente que fixa o comportamento errado, dizendo qual e por quê no PR. Mexa só nos arquivos de "Toca em" da sua fase (mais `src/i18n/*` e `eslint.config.js`). Nada do schema nem do formato da proposta muda. Siga o "Proposto" de "Decisões a confirmar"; se algo ambíguo mudar comportamento visível, registre a pergunta no PR e escolha a opção mais conservadora. Entregue a regra automática da fase e prove no PR que ela falha num exemplo do padrão antigo.
>
> Antes de pedir a conferência: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar (e `npm run build:mcp` na 8.5). Marque os checkboxes da sua fase no `PLAN.md` no mesmo PR. A descrição do PR tem: **Resumo**, **Como testar** (passos manuais no desktop, citando os passos do `docs/TESTING.md` do Aceite; o deploy do branch pode ser disparado por `workflow_dispatch`), **Decisões tomadas** e a **nota de desenho** (ou o link); cite os testes que reproduzem os achados e cole a saída resumida dos gates.
>
> Entregue: a URL do PR, o resumo dos gates e a lista de decisões. Se ficar bloqueado por outra fase ou por algo fora do seu escopo, pare e diga exatamente o que falta; não contorne.
