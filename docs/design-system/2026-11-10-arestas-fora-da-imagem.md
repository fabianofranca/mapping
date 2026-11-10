# Arestas do conteúdo fora da imagem — 2026-11-10 (épico `epic/arestas-fora-da-imagem`)

## Pendências

- `.ref-control` (Detalhes, `src/ui/TypedFields.tsx`, `src/ui/RefCell.tsx`): o controle passa a vir dentro do `Tooltip` (no lugar do `title` nativo), com o alvo, a camada e a dica de atalho por inteiro; a âncora do `Tooltip` ocupa a largura do campo. O rótulo do alvo já tem prioridade sobre o nome da camada (`.ref-control-layer` cede primeiro). Sem token novo; nada muda a 1280×720.
- Célula `ref` da tabela (`.ref-cell`, CL1): sem largura mínima própria, o ✕ desce para a linha de baixo quando a coluna é estreita e o ícone some na tabela (CL2 removeu o token `size-grid-ref-col-min`, que fazia a tabela rolar na horizontal a 1280 e 900 px): a coluna divide a tabela como as outras. O ✕ não estica mais (só a âncora do controle), o controle encolhe dentro da célula e a referência quebrada quebra entre as palavras, sem corte. `.ref-control-layer` passa a encolher com fator `1000000`. Nos temas claro e escuro só usam tokens de cor já existentes.
- Revisão do épico: no campo `ref` dos Detalhes só a âncora do controle estica (`.ref-field > .tooltip-anchor:first-child`); as dos botões ↗ e ✕ mantêm o tamanho do botão (antes do ajuste, o `Tooltip` esticava cada uma a uma linha inteira). Sem token novo.

## Sincronização

Não gravado: a ferramenta Artifact foi negada pelo classificador de permissões neste fechamento (ver abaixo). Nenhuma versão do artefato mudou; o índice não foi tocado.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: guia `ReferenceField` (o `Tooltip` no lugar do `title`, a camada que cede primeiro, o botão quebrado que quebra linha) e `bundle.css` (texto, DS3; mudou: a troca do registro vira o texto de hoje, no plano).
- Passou para o registro do épico `epic/sincronia-ds-2`: guia `RefCell` (`Tooltip`, coluna sem largura mínima, ✕ que desce, texto que quebra) (texto, DS3; mudou: o motivo da pendência agora vai no `Tooltip`).
- Passou para o registro do épico `epic/sincronia-ds-2`: `lastChange` do índice `design-system.json`: não é pendência (o índice é gravado por quem grava, por último, ver "Quando atualizar" do `docs/DESIGN-SYSTEM.md`).
- Passou para o registro do épico `epic/sincronia-ds-2`: previews de `ReferenceField` e `RefCell` ainda imitam o `title` nativo do botão `ref-control`: trocar pelo `Tooltip` (prévia, DS5).
