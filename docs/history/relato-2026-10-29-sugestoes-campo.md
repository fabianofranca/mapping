# Relato de teste — Mapping

- Modo: dirigido — lista de passos: R0 e R14.1 a R14.19 (etapa Sugestões no campo de texto, `docs/TESTING.md`); passada visual: Detalhes
- Build id: f034a3a · 2026-10-29
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`); estava em 5d7ac40 · 2026-10-28, atualizado pela faixa **Atualizar** (sem Deploy)
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows x64
- DPR e viewport: DPR 1,375; 998 × 635 (janela restaurada); passada estreita a 919 e 912 px de `innerWidth`
- Pasta de trabalho: `mapping-testes\2026-10-29-sugestoes-campo` (clone do branch `epic/sugestoes-campo`, PR #247, head f034a3a, merge do PR #249)
- Ferramenta: agente com extensão do navegador e shell; dialog-pilot (`select_folder` e `open_file` funcionaram); MCP não usado
- Data: 2026-10-29

## Resumo

- Passos: 26 no total (R0: 6; R14: 19; passada visual: 1 linha). ✅ 24, ❌ 2 (R14.19, achado 1; Visual: Detalhes, achado 2), não executados 0.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 2.
- Impede o uso com pessoas? não.
- Regressões fora do alvo: nenhuma. Console sem erros durante toda a rodada; Diagnóstico com "Nenhum erro registrado" no começo e no fim.

## Passos

Todos ✅, exceto R14.19 (achado 1) e a passada visual do Detalhes (achado 2). R0.1 a R0.7 e R14.1 a R14.18 bateram com o Esperado do guia na época, com as divergências de texto do roteiro listadas em "Observações" e "O que atrapalhou" abaixo.

## Achados

### 1. Apagar o texto de um campo com sugestões não reabre a lista (R14.19)

- Severidade: baixa
- Passos: abrir `sugestoes-kotlin.zip`; selecionar **Endereco**, **Detalhes**; clicar na célula **Tipo** da linha `rua` (texto `String`); apagar o texto (Ctrl+A e Backspace, ou Backspace seis vezes); ler `aria-expanded` e as opções.
- Esperado (R14.19, como estava escrito): "com o campo vazio a lista começa com `Usuario`".
- Observado: a lista fica fechada. Ela só abre por clique num campo que já estava vazio, `ArrowDown` ou `Ctrl+Espaço`; aberta assim, o conteúdo é o esperado. No R14.14 (Retorno) o mesmo.
- Reproduziu de novo? sim.

### 2. Barra de rolagem horizontal no Detalhes com a janela estreita (passada visual)

- Severidade: baixa
- Passos: com **Sugestões Kotlin** aberto, `innerWidth` 919 (e 912); selecionar **Usuario**; olhar a base do painel **Detalhes** (280 px).
- Esperado: sem barra de rolagem horizontal no painel.
- Observado: o corpo do painel tem `scrollWidth` 285 contra `clientWidth` 265: os campos **Nome**, **Pacote**, **Parâmetros de tipo**, **Anotações** e **Descrição** (164 px) terminam 6 px além da borda quando a barra vertical (14 px) aparece. A 998 px (painel de 327 px) não acontece.
- Reproduziu de novo? sim (919 e 912 px, tema claro e escuro).

## Regressões fora do alvo

- (nenhuma)

## Observações (sem severidade)

- Nesta build as células de tabela do Detalhes são sempre `<input>`: "editar a célula" e "sair da edição" só se medem pelo valor, pelo foco e pelo **Desfazer**.
- O `Ctrl+Z` com o foco **dentro** do campo faz o desfazer de texto do navegador (sem entrada de desfazer da app); com o foco fora do campo, desfaz a célula numa entrada só. O guia não dizia que o foco precisa sair do campo.
- O **Tipo mapeado** preenchido mostra `Endereco.Nome` (dica "→ Endereco.Nome (Classes Kotlin)"); o guia dizia "mostra `Endereco`" (R14.15, R14.16).
- O `Ctrl+Espaço` num campo de texto simples (**Nome** de Propriedades) insere um espaço; o Esc reverteu.
- O `Tab` do R14.8 grava `Bo` e leva o foco ao botão **Tipo mapeado** da mesma linha.
- O texto "Nenhuma anotação nesta camada." continua cortado a 998 px, agora com `title` com o texto inteiro.
- A tabela de Propriedades tem rolagem horizontal própria, por desenho.

## O que atrapalhou

- A extensão manda `ctrl+z` como tecla na página: com o foco no campo vira desfazer de texto. Contorno: clicar no título **Detalhes** antes de cada `Ctrl+Z`.
- R14.4: a captura da barra de status falhou; o indicador "Salvando" não foi visto, só o **Desfazer** desabilitado.
- R14.11 e R14.12: o **Desfazer** já estava habilitado pelas linhas adicionadas em Funções e Supertipos (R14.10, R14.11), então "não ganha entrada" não se mede pelo botão; antes do R14.15 foi preciso desfazer tudo (12 × `Ctrl+Z`).
- R14.14: o texto mandava clicar na célula **Retorno** "vazia" da linha criada no R14.10, mas o R14.10 grava `Boolean` nela.
- R14.19: o texto pedia "apague o texto e leia as opções", mas a lista não abre ao apagar (achado 1).

## Triagem (2026-10-29)

- **Achado 1:** não é defeito da app. A decisão 3 da etapa (`PLAN.md`) diz que a lista abre ao digitar uma palavra com correspondência, com ↓, com Ctrl+Espaço ou com clique no campo vazio; apagar o texto não abre. Corrigido o roteiro (R14.19 passa a abrir com `ArrowDown` e a conferir que a lista não abre sozinha).
- **Achado 2:** corrigido na app (CSS do Detalhes), fora da feature, como o MP1b.
- **Observações:** o guia ganhou a nota do foco antes do `Ctrl+Z`, o rótulo `Endereco.Nome` do Tipo mapeado, o indicador de gravação passageiro, e o R14.10 e o R14.11 agora desfazem as linhas no fim; o Retorno saiu do R14.14 (o R14.10 já confere que ele não oferece `Endereco`).
