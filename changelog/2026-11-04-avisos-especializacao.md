# Avisos na especialização — 2026-11-04 (épico `epic/avisos-especializacao`, PR #498, MCP 0.15.0, schema v13)

## Adicionado

- **`formatVersion` 10 da especialização, com avisos (`notices`)** em tipo, campo e coluna de `table`: cada aviso tem `kind` (`pending`, `deprecated`, `diverges` ou `removed`), `message` e, opcionais, `since` (data) e `ref` (de onde vem). Os avisos só informam: nenhum impede importar, aplicar, criar anotação nem aceitar proposta, e não são pendência. Ficam fora do contrato de versão (incluir, mudar ou tirar avisos nunca pede migração), então quem gera a especialização pode regravar todos a cada rodada e o aviso some sozinho quando a diferença entre as fontes some. Documentado em `docs/SPEC-FORMAT.md` (seção "Avisos (notices)"), na ajuda "Especializações", no `docs/spec.schema.json` e na skill `spec-author`.
- **Selo de aviso na escolha de tipo e no Catálogo.** Um tipo com aviso mostra um selo (Removido, Obsoleto, Diverge ou Pendente, sempre com ícone e texto) em "+ Anotação", na aba Componentes e na Paleta; o selo mostra o aviso de maior gravidade entre o do tipo, dos campos e das colunas, e a dica lista todos.
- **Avisos do tipo, dos campos e das colunas nos Detalhes.** O aviso do tipo fica no topo da anotação (com `since` e `ref`), o do campo abaixo do controle (e o rótulo ganha o ícone) e o da coluna abaixo da tabela. Aparecem também em só leitura, não bloqueiam nada e não tornam a anotação incompleta.
- **Janela Avisos (`Ctrl+Shift+8`)** na janela inferior, entre Incompletas e Diagnóstico: lista cada aviso da especialização, do mais grave ao menos, com o lugar, a mensagem e as anotações que ele afeta (marcação, camada, anotação e o valor no campo). Filtra por tipo de aviso (com a contagem), por "Só avisos em uso" e por "Só camadas visíveis", e escolher uma linha leva à anotação. A aba mostra quantas anotações têm aviso e a **barra de status** ganha "Avisos: N" (some quando é 0; o clique abre a janela). A contagem de Incompletas não muda por causa de aviso.
- **Avisos na revisão de propostas.** A mudança que cria uma anotação de um tipo com aviso, troca o tipo para um com aviso ou grava valor num campo ou coluna com aviso mostra o aviso no popover dela, no estilo do tipo de aviso. Aceitar e Aplicar continuam habilitados.
- **MCP 0.15.0: avisos para o agente.** `get_specialization` mostra os `notices` do tipo, do campo e da coluna; `plan_changes` e `propose_changes` ganham a chave `notices` (`{ new: [{ annotation, type, kind, message, key?, column? }] }`, do mais grave ao menos; `new: []` sem aviso), ao lado de `issues` e sem misturar com ela. Aviso não bloqueia o lote nem a proposta. `docs/MCP.md` e `docs/AGENT-GUIDE.md` dizem o que fazer com cada `kind`; `validate_specialization` aceita a v10 e recusa `notices` na v1 a v9 com o caminho exato.
- **Roteiro R18 — Avisos na especialização** no guia de testes (12 passos, para o testador da nuvem rodar sozinho), no bloco 1 da rodada completa (agora com 94 passos; 269 no total).

## Alterado

—

## Corrigido

—
