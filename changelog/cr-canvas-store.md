# CR do canvas e do store — [Não lançado] (épico `epic/cr-canvas-store`, PR #1238, MCP 0.28.11, schema v18)

## Corrigido

- Canvas: ao rejeitar a remoção proposta da marcação selecionada, o risco da etiqueta do nome some no mesmo quadro (antes ficava até um pan ou outra seleção), e o risco não passa mais da largura da etiqueta quando o nome é longo e aparece cortado.
- Canvas: o selo "Veio de <nome>" deixa de sair cortado no primeiro desenho (a largura passa a ser medida com a fonte do tema).
- Canvas: o clique curto do botão do meio não seleciona, não limpa a seleção nem põe o pino do Comentar.
- Canvas: soltar o Espaço com o foco num campo não deixa mais o arrasto preso no pan; o Espaço também não é cancelado em links e botões.
- Canvas: Ctrl+clique abre o menu de contexto (no macOS), sem virar um clique de seleção.

## Alterado

- Canvas: menos trabalho por quadro e por gesto: arrastar não recalcula mais a lista de imagens a carregar, medir o tamanho do canvas sem mudança não agenda quadro à toa, a hachura da marcação removida desenha só a parte visível e o selo de chegada não força o layout da página a cada quadro. O desenho não muda.
