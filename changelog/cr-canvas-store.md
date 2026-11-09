# CR do canvas e do store — [Não lançado] (épico `epic/cr-canvas-store`, PR #1238, MCP 0.28.11, schema v18)

## Corrigido

- Canvas: ao rejeitar a remoção proposta da marcação selecionada, o risco da etiqueta do nome some no mesmo quadro (antes ficava até um pan ou outra seleção), e o risco não passa mais da largura da etiqueta quando o nome é longo e aparece cortado.
- Canvas: o selo "Veio de <nome>" deixa de sair cortado no primeiro desenho (a largura passa a ser medida com a fonte do tema).
- Canvas: o clique curto do botão do meio não seleciona, não limpa a seleção nem põe o pino do Comentar.
- Canvas: soltar o Espaço com o foco num campo não deixa mais o arrasto preso no pan; o Espaço também não é cancelado em links e botões.
- Canvas: Ctrl+clique abre o menu de contexto (no macOS), sem virar um clique de seleção.
- Componentes: o texto rico com contorno (`stroke`) tem preenchimento e contorno, como o texto simples, em vez de sair oco.
- Componentes: a imagem embutida (`data:`) respeita o ajuste do preenchimento (`cover`, `contain`, `fill`; padrão `cover`) em vez de esticar, e não é decodificada de novo a cada desenho.
- Componentes: um quadro sem preenchimento nem traço mostra a sombra (ela vai para o primeiro filho).
- Catálogo: as imagens dos exemplos saem com as imagens embutidas (antes saíam com o reservado) e a galeria guarda uma imagem por exemplo, sem acumular as de épocas antigas.
- Componentes: com mais de 64 imagens remotas à vista, elas não piscam mais nem são baixadas de novo em ciclo.
- Catálogo e Playground: os avisos do desenho aparecem no idioma da app (antes saíam sempre em português); o texto e as cores da caixa de tipo sem componente vêm do tema.

## Alterado

- Canvas: menos trabalho por quadro e por gesto: arrastar não recalcula mais a lista de imagens a carregar, medir o tamanho do canvas sem mudança não agenda quadro à toa, a hachura da marcação removida desenha só a parte visível e o selo de chegada não força o layout da página a cada quadro. O desenho não muda.
- Visualizador embutível (`mapping-viewer`): o `ScreenRenderer` recebe os textos da caixa de tipo ausente e dos avisos do chamador (`labels`); o `createViewer` passa os dele, em português, como antes. Quem cria um `ScreenRenderer` direto precisa passar `labels` (há `VIEWER_LABELS` para o padrão).
