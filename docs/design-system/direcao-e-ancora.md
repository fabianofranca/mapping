# Direção de leitura (RTL) e âncora entre marcações — [Não lançado] (épico `epic/direcao-e-ancora`)

## Pendências

A fase R1 (direção no motor, no formato do componente, nas telas sem geometria e no visualizador) **não muda o design system da app**: nenhum componente, token ou ícone da app foi tocado. A R2 só monta a direção com controles existentes. As pendências do épico entram nas fases:

- **R2 (feito, sem token novo):** o campo **Direção** nos Detalhes do container (`ContainerDirectionField`, `Property` + `Select` no molde do Modo de desenho, mas sempre visível), a seção **Direção de leitura** nas Configurações do projeto (`ProjectDirectionSettings`, `Select` no molde do Modo do desenho) e a seção somente leitura do Diagnóstico (`DiagnosticsDirection`, só com `rtl`). Só controles e classes que já existem (`Select`, `Property`, `.repos`, `.diagnostics-modes`): nenhum componente, token ou ícone novo.
- **R4 (feito, sem token novo):** a seção **Âncora** nos Detalhes da marcação (`MarkingAnchorSection`: um `Select` **Ancorada a** com "Nenhuma" e as marcações do mesmo espaço, dois `Segmented` **Lado** e **Alinhamento**, dois `TextField` numéricos do **Deslocamento** com o prefixo curto `Dist.` e `Desl.` no molde do par X e Y, e o botão **Encostar na âncora**, em `Property` e `PropertyGrid`; seção recolhível como as outras, com o nome da âncora no resumo) e a **linha de ligação** no canvas (traço tracejado fino do centro da ancorada ao da âncora, na camada de sobreposições, só na ancorada selecionada ou sob o mouse: `--color-border-control`, que o canvas passou a ler, com o halo `--cv-halo` por baixo e o tracejado 6/4 de hoje). O botão **Adicionar** da Paleta ganha o rótulo "Adicionar ancorado a X" nos tipos com `anchor` na raiz. Só controles, classes e tokens que já existem: nenhum componente, token ou ícone novo.

## Sincronização

Preenchida no fechamento do épico.

## Ficou sem gravar

Preenchido no fechamento do épico.
