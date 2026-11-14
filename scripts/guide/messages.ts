// Texts of the interactive guide, one entry per language (the page picks one with `pickLocale`).
//
// Tokens, resolved by `resolveMessages` (scripts/guide.ts) at build time:
//   {ui:key}              the exact text of an app UI term, from src/i18n/<locale>.ts. A key that is
//                         missing from the dictionary fails the build (and tests/examples/guide.test.ts).
//   {ui:key|param=value}  the same, with the `{param}` of the dictionary text filled in.
//   {exampleZip}          the example project zip path.
// Tokens left for the page (they depend on the example project's data):
//   {n:name}              the name, in the example project, of a screen, marking, layer or annotation
//                         (`NAMES` below: the page looks for the name of any language in the data,
//                         so the text always matches what the project shows).
//   %count, %names, %item, %from   values filled in at run time.
import type { GuideLocale } from './pickLocale';

export interface GuideStep {
  readonly t: string;
  readonly p: string;
  readonly try: string;
}

export interface GuideMessages {
  readonly pageTitle: string;
  readonly noscript: string;
  readonly heading: string;
  readonly intro: string;
  readonly openInApp: string;
  readonly catalogLabel: string;
  readonly openApp: string;
  readonly stepsHeading: string;
  readonly previous: string;
  readonly next: string;
  readonly perspectiveLabel: string;
  readonly stageLabel: string;
  readonly svgLabel: string;
  readonly main: string;
  readonly layersLabel: string;
  readonly detailsLabel: string;
  readonly hint: string;
  readonly proposalHeading: string;
  readonly proposalText: string;
  readonly diffCurrentLabel: string;
  readonly diffCurrent: string;
  readonly diffProposedLabel: string;
  readonly diffProposed: string;
  readonly shortcutsHeading: string;
  readonly shortcutNote: string;
  readonly mcpHeading: string;
  readonly mcpText: string;
  readonly try: string;
  readonly noPhoto: string;
  readonly free: string;
  readonly freeLayer: string;
  readonly locked: string;
  readonly needsReview: string;
  readonly noAnnotations: string;
  readonly note: string;
  readonly noteKind: string;
  readonly detailsEmpty: string;
  readonly and: string;
  readonly perspectivesIntro: string;
  readonly perspectivesApp: string;
  readonly perspectivesArrival: string;
  readonly perspectivesEnd: string;
  readonly steps: readonly GuideStep[];
}

/** Names of the example project's items that the texts mention: `[en-US, pt-BR]` per key. */
export const NAMES: Readonly<Record<string, Readonly<Record<GuideLocale, string>>>> = {
  signup: { 'en-US': 'Sign up', 'pt-BR': 'Cadastro' },
  login: { 'en-US': 'Login', 'pt-BR': 'Login' },
  settings: { 'en-US': 'Settings', 'pt-BR': 'Configurações' },
  orderDetails: { 'en-US': 'Order details', 'pt-BR': 'Detalhes do pedido' },
  name: { 'en-US': 'Name', 'pt-BR': 'Nome' },
  form: { 'en-US': 'Form', 'pt-BR': 'Formulário' },
  registerButton: { 'en-US': 'Register', 'pt-BR': 'Cadastrar' },
  email: { 'en-US': 'Email', 'pt-BR': 'E-mail' },
  age: { 'en-US': 'Age', 'pt-BR': 'Idade' },
  title: { 'en-US': 'Title', 'pt-BR': 'Título' },
  loginForm: { 'en-US': 'Login form', 'pt-BR': 'Formulário de login' },
  filters: { 'en-US': 'Filters', 'pt-BR': 'Filtros' },
  notifications: { 'en-US': 'Notifications', 'pt-BR': 'Notificações' },
  preferences: { 'en-US': 'Preferences', 'pt-BR': 'Preferências' },
  help: { 'en-US': 'Help', 'pt-BR': 'Ajuda' },
  signIn: { 'en-US': 'Sign in', 'pt-BR': 'Entrar' },
  events: { 'en-US': 'Events', 'pt-BR': 'Eventos' },
  questions: { 'en-US': 'Questions', 'pt-BR': 'Dúvidas' },
  notes: { 'en-US': 'Notes', 'pt-BR': 'Notas' },
  question: { 'en-US': 'Question', 'pt-BR': 'Dúvida' },
  userModel: { 'en-US': 'User', 'pt-BR': 'Usuário' },
  credentialsModel: { 'en-US': 'Credentials', 'pt-BR': 'Credenciais' },
  dataField: { 'en-US': 'data', 'pt-BR': 'dado' },
  sessionsEndpoint: { 'en-US': 'POST /v1/sessions', 'pt-BR': 'POST /v1/sessoes' },
  profile: { 'en-US': 'Profile', 'pt-BR': 'Perfil' },
  signOut: { 'en-US': 'Sign out', 'pt-BR': 'Sair' },
  renamedButton: { 'en-US': 'Register button', 'pt-BR': 'Botão cadastrar' },
  proposalTitle: {
    'en-US': 'Profile screen and Sign up tweak',
    'pt-BR': 'Tela de Perfil e ajuste no Cadastro',
  },
  sdui: { 'en-US': 'SDUI', 'pt-BR': 'SDUI' },
  dataModel: { 'en-US': 'Data model', 'pt-BR': 'Modelo de dados' },
  material3Compose: {
    'en-US': 'Material 3 for Compose',
    'pt-BR': 'Material 3 para Compose',
  },
  roleAction: { 'en-US': 'Action', 'pt-BR': 'Ação' },
  roleFeedback: { 'en-US': 'Feedback', 'pt-BR': 'Feedback' },
  triggerClick: { 'en-US': 'Click', 'pt-BR': 'Clique' },
  triggerPress: { 'en-US': 'Press', 'pt-BR': 'Pressionar' },
};

const enUS: GuideMessages = {
  pageTitle: 'Mapping guide',
  noscript: 'This guide needs JavaScript.',
  heading: 'Mapping guide',
  intro:
    'A complete example project, drawn here the way the app shows it: containers (here, screens of an app), markings, layers and annotations. Click the markings to see what each one stores and follow the walkthrough on the left.',
  openInApp:
    'In the app: download <code>{exampleZip}</code> from the repository (github.com/fabianofranca/mapping) and use <code>{ui:home.openZip}</code>, on the home screen, to see the same project side by side.',
  catalogLabel: 'Catalog:',
  openApp: 'Open Mapping',
  stepsHeading: 'Walkthrough',
  previous: 'Previous',
  next: 'Next',
  perspectiveLabel: '{ui:inconsistent.entity.perspective}',
  stageLabel: 'Annotated container',
  svgLabel: 'Container with markings',
  main: '{ui:perspective.principal}',
  layersLabel: '{ui:layer.title}',
  detailsLabel: '{ui:panel.details}',
  hint: 'Each outline is a marking, in the color of the layer of its annotation. Click a layer to hide or show it. The perspective narrows the tabs and the layers.',
  proposalHeading: 'The example proposal',
  proposalText:
    'In the <b>{ui:proposals.title}</b> window (<kbd>Ctrl+Shift+7</kbd>) there is a ready-made proposal, written by an agent: <b>{n:proposalTitle}</b>. Click <b>{ui:proposals.action.review}</b>, compare <b>{ui:review.view.current}</b> × <b>{ui:review.view.proposed}</b> and accept or reject each change; at the end, <b>{ui:review.applyCount|count=N}</b>.',
  diffCurrentLabel: '{ui:review.view.current}',
  diffCurrent:
    'Sign up button: “{n:registerButton}”<br />Containers: {n:signup}, {n:login}, {n:settings}, {n:orderDetails}',
  diffProposedLabel: '{ui:review.view.proposed}',
  diffProposed:
    'Button renamed: “{n:renamedButton}”<br />New container <i>{n:profile}</i> 360 × 800 with Top app bar, 2 List items and Button “{n:signOut}”',
  shortcutsHeading: 'Shortcuts',
  shortcutNote:
    'With the focus outside the window, the shortcut moves the focus to it and opens it, if it is closed. With the focus inside it, the shortcut hides the window.',
  mcpHeading: 'For agents (MCP)',
  mcpText:
    'An agent reads the project with <code>get_project</code> and suggests changes with <code>propose_changes</code>. When the type is ambiguous (like “Button”), give <code>specId/typeId</code>, for example <code>material3-compose/button</code>. Suggestions arrive in the {ui:proposals.title} window, never straight in the project.',
  try: 'Try it:',
  noPhoto: 'container with no photo',
  free: 'free',
  freeLayer: 'free layer',
  locked: 'locked',
  needsReview: '{ui:marking.needsReview}',
  noAnnotations: 'No annotations.',
  note: 'Note',
  noteKind: 'note',
  detailsEmpty:
    'Click a marking in the container to see its annotations. This container has %count markings.',
  and: ' and ',
  perspectivesIntro:
    'A <b>perspective</b> is a slice of the project: which items show, where they sit and which layers are visible. <b>{ui:perspective.principal}</b> shows everything and is where proposals are accepted. The picker above the tabs does what the app’s does; this example has ',
  perspectivesApp:
    ': each one shows only its containers (in the tabs) and hides its layers (in the chips). In the app, <b>{ui:perspective.picker.new}</b> creates another, for <b>{ui:perspective.new.whoAll}</b> (saved in <code>mapping.json</code>) or <b>{ui:perspective.new.whoMine}</b> (stays in this browser, so it is not in the example). <b>{ui:perspective.menu.send}</b> shows an item in another one too and <b>{ui:perspective.menu.remove}</b> removes it only from there; dragging changes only the position in the open perspective. ',
  perspectivesArrival:
    'What is born in a perspective reaches {ui:perspective.principal} with the <b>{ui:perspective.canvas.cameFrom|name=…}</b> badge: the note “%item” came from %from (the status bar says <b>{ui:perspective.status.arrivals|count=%count}</b>), and <b>{ui:editor.dismiss}</b> removes the notice. ',
  perspectivesEnd: 'This guide does not draw the note or the positions.',
  steps: [
    {
      t: 'Containers and markings',
      p: 'A project is a folder: <code>mapping.json</code>, the containers (each image, or area with no photo, becomes a canvas) and the specializations. Each outline is a <b>marking</b>. This is the {n:signup} container, the photo of an app screen with 6 markings.',
      try: 'Move over the container and click any outline.',
    },
    {
      t: 'Markings inside markings',
      p: '“{n:name}” is inside “{n:form}”. That hierarchy is the <b>{ui:panel.tree}</b> (<kbd>Ctrl+Shift+1</kbd>). What is inside follows its parent when the parent changes.',
      try: 'In the panel on the right, click “{n:form}” in the path at the top.',
    },
    {
      t: 'Layers',
      p: 'A marking can have several annotations, each one in a <b>layer</b> (<b>{ui:layer.title}</b> window, <kbd>Ctrl+Shift+2</kbd>). The {n:registerButton} button has a component, two events and a note. Layers tied to a specialization ({n:sdui}, {n:dataModel}, {n:material3Compose}) come with ready-made fields; free ones ({n:questions}, Model) accept whatever you want.',
      try: 'Hide the “{n:events}” layer and watch the outline change color.',
    },
    {
      t: '{n:sdui} specialization',
      p: 'The <code>input</code> type of the <b>SDUI v2</b> specialization defines the fields: id, type, placeholder, required, maxLength and {n:dataField}. The app checks the values by the field type and lists the annotations with a problem, with the reason, in <b>{ui:incomplete.title}</b> (<kbd>Ctrl+Shift+5</kbd>).',
      try: 'Compare with “{n:age}”, which has a dashed outline.',
    },
    {
      t: 'Link to the data',
      p: 'The <code>{n:dataField}</code> field points to an entry of the “{n:userModel}” Model. If the data is renamed, the link follows. That way the screen and the API contract stay tied together.',
      try: 'Click the link in the {n:dataField} field to go to the {n:form}.',
    },
    {
      t: '{n:events}',
      p: 'The button has two events, each one in a <b>role</b>: the <b>{n:roleAction}</b> on <b>{n:triggerClick}</b> and the <b>{n:roleFeedback}</b> on <b>{n:triggerPress}</b>. They sit in the {n:events} layer, apart from the component’s look, and the button’s <b>{ui:typed.linkAction}</b> creates a new one in the chosen role.',
      try: 'See, under {ui:annotation.linkedHeading}, the event of each role and read the actions in the panel.',
    },
    {
      t: 'Locked and position to review',
      p: '“{n:age}” has <b>{ui:marking.needsReview}</b> (dashed outline): the warning that the rectangle may be out of place, for example after swapping the image for another of a different size. “{n:title}” is <b>locked</b>: it cannot be moved, resized or deleted by mistake (<kbd>Alt+L</kbd> locks and unlocks). Both states show in the {ui:panel.details}.',
      try: 'Select “{n:title}” and look at the badge.',
    },
    {
      t: 'Questions and notes',
      p: 'The <b>{n:questions}</b> layer has no specialization: it is for questions and decisions, with the fields you create. {n:registerButton} has a “{n:question}” annotation. The <b>{n:notes}</b> layer, from the notes library that the app applies to every new project, has the floating sticky note: it sits loose on the canvas, beside the screens (in the example project, a note about {n:signup}, which this guide does not draw).',
      try: 'Find the “{n:question}” annotation in the {n:registerButton} panel.',
    },
    {
      t: 'Conversations with agents',
      p: 'When a question does not fit in an annotation, open a <b>conversation</b> anchored on the item: people and agents exchange messages there, and it stays open until a person resolves it. The <b>{ui:comments.title}</b> window (<kbd>Ctrl+Shift+0</kbd>) lists them all; the <b>{ui:comments.pins}</b> and <b>{ui:comments.add}</b> buttons show the pins on the canvas. The example project has three, in the <code>comments/</code> folder: one waiting for you, one waiting for the agent and one resolved. This guide does not draw the pins.',
      try: 'Open the example zip in the app and look at the {ui:comments.title} window.',
    },
    {
      t: 'A second container',
      p: '{n:login} repeats the pattern with a Model of its own, “{n:credentialsModel}”, and a <code>{n:sessionsEndpoint}</code> endpoint in the Endpoints layer of the {n:dataModel}.',
      try: 'See that “{n:signIn}” and “{n:email}” point to the same Model.',
    },
    {
      t: 'Container with no photo, with Material 3',
      p: 'With no photo, the container is a plain-color canvas and the <b>Material 3</b> components (the <b>material3-compose</b> library) are drawn on the fly. The <b>Row</b> “{n:filters}” is a component with a slot: use <b>{ui:arrange.action}</b> (<kbd>Alt+Shift+A</kbd>) to distribute the chips.',
      try: 'Select a chip and see that the parent is the Row.',
    },
    {
      t: 'Component with a slot and a child',
      p: 'The two Switches and the Checkbox are inside the Column “{n:preferences}”. Box, Row, Column and Surface have a slot and carry their children along.',
      try: 'Click “{n:preferences}” and then “{n:notifications}”.',
    },
    {
      t: 'One more container',
      p: '{n:orderDetails} uses Top app bar, Card, List items, Button and FAB. All of it comes from the Material 3 catalog, <b>{ui:catalog.window.palette}</b> tab (<kbd>Ctrl+Shift+9</kbd>).',
      try: 'Open the {ui:catalog.window.title} in the app and add a component here.',
    },
    {
      t: 'Perspectives',
      p: '%perspectives',
      try: 'Switch the perspective in the picker above the tabs and watch the tabs and chips change.',
    },
  ],
};

const ptBR: GuideMessages = {
  pageTitle: 'Guia do Mapping',
  noscript: 'Este guia precisa de JavaScript.',
  heading: 'Guia do Mapping',
  intro:
    'Um projeto de exemplo completo, desenhado aqui como a app o mostra: containers (aqui, telas de um app), marcações, camadas e anotações. Clique nas marcações para ver o que cada uma guarda e siga o roteiro à esquerda.',
  openInApp:
    'Na app: baixe <code>{exampleZip}</code> do repositório (github.com/fabianofranca/mapping) e use <code>{ui:home.openZip}</code>, na tela inicial, para ver o mesmo projeto lado a lado.',
  catalogLabel: 'Catálogo:',
  openApp: 'Abrir o Mapping',
  stepsHeading: 'Roteiro',
  previous: 'Anterior',
  next: 'Próximo',
  perspectiveLabel: '{ui:inconsistent.entity.perspective}',
  stageLabel: 'Container anotado',
  svgLabel: 'Container com marcações',
  main: '{ui:perspective.principal}',
  layersLabel: '{ui:layer.title}',
  detailsLabel: '{ui:panel.details}',
  hint: 'Cada contorno é uma marcação, na cor da camada da sua anotação. Clique na camada para ocultar ou mostrar. A perspectiva recorta as abas e as camadas.',
  proposalHeading: 'A proposta de exemplo',
  proposalText:
    'Na janela <b>{ui:proposals.title}</b> (<kbd>Ctrl+Shift+7</kbd>) há uma proposta pronta, escrita por um agente: <b>{n:proposalTitle}</b>. Clique em <b>{ui:proposals.action.review}</b>, compare <b>{ui:review.view.current}</b> × <b>{ui:review.view.proposed}</b> e aceite ou rejeite cada mudança; no fim, <b>{ui:review.applyCount|count=N}</b>.',
  diffCurrentLabel: '{ui:review.view.current}',
  diffCurrent:
    'Botão do {n:signup}: “{n:registerButton}”<br />Containers: {n:signup}, {n:login}, {n:settings}, {n:orderDetails}',
  diffProposedLabel: '{ui:review.view.proposed}',
  diffProposed:
    'Botão renomeado: “{n:renamedButton}”<br />Novo container <i>{n:profile}</i> 360 × 800 com Top app bar, 2 List items e Button “{n:signOut}”',
  shortcutsHeading: 'Atalhos',
  shortcutNote:
    'Com o foco fora da janela, o atalho leva o foco a ela e a abre, se estiver fechada. Com o foco dentro dela, o atalho esconde a janela.',
  mcpHeading: 'Para agentes (MCP)',
  mcpText:
    'Um agente lê o projeto com <code>get_project</code> e sugere mudanças com <code>propose_changes</code>. Quando o tipo é ambíguo (como “Button”), informe <code>specId/typeId</code>, por exemplo <code>material3-compose/button</code>. As sugestões chegam na janela {ui:proposals.title}, nunca direto no projeto.',
  try: 'Experimente:',
  noPhoto: 'container sem foto',
  free: 'livre',
  freeLayer: 'camada livre',
  locked: 'trancada',
  needsReview: '{ui:marking.needsReview}',
  noAnnotations: 'Sem anotações.',
  note: 'Nota',
  noteKind: 'nota',
  detailsEmpty:
    'Clique numa marcação do container para ver as anotações dela. Este container tem %count marcações.',
  and: ' e ',
  perspectivesIntro:
    'Uma <b>perspectiva</b> é um recorte do projeto: quais itens aparecem, onde ficam e quais camadas se veem. A <b>{ui:perspective.principal}</b> mostra tudo e é onde as propostas são aceitas. O seletor acima das abas faz o que o da app faz; este exemplo traz ',
  perspectivesApp:
    ': cada uma mostra só os containers dela (nas abas) e esconde as camadas dela (nos chips). Na app, <b>{ui:perspective.picker.new}</b> cria outra, para <b>{ui:perspective.new.whoAll}</b> (grava no <code>mapping.json</code>) ou <b>{ui:perspective.new.whoMine}</b> (fica neste navegador, por isso não está no exemplo). <b>{ui:perspective.menu.send}</b> mostra um item também em outra e <b>{ui:perspective.menu.remove}</b> o tira só dali; arrastar muda só a posição na perspectiva aberta. ',
  perspectivesArrival:
    'O que nasce numa perspectiva chega à {ui:perspective.principal} com o selo <b>{ui:perspective.canvas.cameFrom|name=…}</b>: a nota “%item” veio de %from (a barra de status diz <b>{ui:perspective.status.arrivals|count=%count}</b>), e <b>{ui:editor.dismiss}</b> tira o aviso. ',
  perspectivesEnd: 'Este guia não desenha a nota nem as posições.',
  steps: [
    {
      t: 'Containers e marcações',
      p: 'Um projeto é uma pasta: <code>mapping.json</code>, os containers (cada imagem, ou área sem foto, vira um canvas) e as especializações. Cada contorno é uma <b>marcação</b>. Este é o container {n:signup}, a foto de uma tela do app com 6 marcações.',
      try: 'Passe pelo container e clique em qualquer contorno.',
    },
    {
      t: 'Marcações dentro de marcações',
      p: '“{n:name}” está dentro de “{n:form}”. Essa hierarquia é a <b>{ui:panel.tree}</b> (<kbd>Ctrl+Shift+1</kbd>). Quem está dentro acompanha o pai quando ele muda.',
      try: 'No painel à direita, clique em “{n:form}” no caminho no topo.',
    },
    {
      t: 'Camadas',
      p: 'Uma marcação pode ter várias anotações, cada uma em uma <b>camada</b> (janela <b>{ui:layer.title}</b>, <kbd>Ctrl+Shift+2</kbd>). O botão {n:registerButton} tem componente, dois eventos e uma nota. Camadas ligadas a uma especialização ({n:sdui}, {n:dataModel}, {n:material3Compose}) trazem campos prontos; as livres ({n:questions}, Model) aceitam o que você quiser.',
      try: 'Oculte a camada “{n:events}” e veja o contorno mudar de cor.',
    },
    {
      t: 'Especialização {n:sdui}',
      p: 'O tipo <code>input</code> da especialização <b>SDUI v2</b> define os campos: id, tipo, placeholder, obrigatório, maxLength e {n:dataField}. A app confere os valores pelo tipo do campo e lista as anotações com problema, com o motivo, em <b>{ui:incomplete.title}</b> (<kbd>Ctrl+Shift+5</kbd>).',
      try: 'Compare com “{n:age}”, que tem o contorno tracejado.',
    },
    {
      t: 'Ligação com os dados',
      p: 'O campo <code>{n:dataField}</code> aponta para uma entrada do Model “{n:userModel}”. Se o dado mudar de nome, o vínculo acompanha. Assim a tela e o contrato da API ficam amarrados.',
      try: 'Clique no link do campo {n:dataField} para ir ao {n:form}.',
    },
    {
      t: '{n:events}',
      p: 'O botão tem dois eventos, cada um num <b>papel</b>: a <b>{n:roleAction}</b> no <b>{n:triggerClick}</b> e o <b>{n:roleFeedback}</b> em <b>{n:triggerPress}</b>. Eles ficam na camada {n:events}, separados do visual do componente, e o <b>{ui:typed.linkAction}</b> do botão cria um novo no papel escolhido.',
      try: 'Veja em {ui:annotation.linkedHeading} o evento de cada papel e leia as ações no painel.',
    },
    {
      t: 'Trancada e posição a revisar',
      p: '“{n:age}” está com <b>{ui:marking.needsReview}</b> (contorno tracejado): o aviso de que o retângulo pode estar fora do lugar, por exemplo depois de trocar a imagem por outra de tamanho diferente. O “{n:title}” está <b>trancado</b>: não se move, não se redimensiona e não se exclui por engano (<kbd>Alt+L</kbd> tranca e destranca). Os dois estados aparecem nos {ui:panel.details}.',
      try: 'Selecione “{n:title}” e veja o selo.',
    },
    {
      t: 'Dúvidas e notas',
      p: 'A camada <b>{n:questions}</b> não tem especialização: serve para dúvidas e decisões, com os campos que você criar. O {n:registerButton} tem uma anotação “{n:question}”. Já a camada <b>{n:notes}</b>, da biblioteca de notas que a app aplica em todo projeto novo, tem o post-it flutuante: ele fica solto no canvas, ao lado das telas (no projeto de exemplo, uma nota sobre o {n:signup}, que este guia não desenha).',
      try: 'Ache a anotação “{n:question}” no painel de {n:registerButton}.',
    },
    {
      t: 'Conversas com os agentes',
      p: 'Quando uma dúvida não cabe numa anotação, abra uma <b>conversa</b> ancorada no item: pessoas e agentes trocam mensagens ali, e ela fica aberta até uma pessoa resolver. A janela <b>{ui:comments.title}</b> (<kbd>Ctrl+Shift+0</kbd>) lista todas; os botões <b>{ui:comments.pins}</b> e <b>{ui:comments.add}</b> mostram os pinos no canvas. O projeto de exemplo traz três, na pasta <code>comments/</code>: uma que aguarda você, uma que aguarda o agente e uma resolvida. Este guia não desenha os pinos.',
      try: 'Abra o zip do exemplo na app e veja a janela {ui:comments.title}.',
    },
    {
      t: 'Um segundo container',
      p: 'O {n:login} repete o padrão com um Model próprio, “{n:credentialsModel}”, e um endpoint <code>{n:sessionsEndpoint}</code> na camada Endpoints do {n:dataModel}.',
      try: 'Veja que “{n:signIn}” e “{n:email}” apontam para o mesmo Model.',
    },
    {
      t: 'Container sem foto com Material 3',
      p: 'Sem foto, o container é um canvas de cor lisa e os componentes <b>Material 3</b> (a biblioteca <b>material3-compose</b>) são desenhados na hora. O <b>Row</b> “{n:filters}” é um componente com slot: use <b>{ui:arrange.action}</b> (<kbd>Alt+Shift+A</kbd>) para distribuir os chips.',
      try: 'Selecione um chip e veja que o pai é o Row.',
    },
    {
      t: 'Componente com slot e filho',
      p: 'Os dois Switches e o Checkbox estão dentro da Column “{n:preferences}”. Box, Row, Column e Surface têm slot e levam os filhos junto.',
      try: 'Clique em “{n:preferences}” e depois em “{n:notifications}”.',
    },
    {
      t: 'Mais um container',
      p: '{n:orderDetails} usa Top app bar, Card, List items, Button e FAB. Tudo vem do catálogo do Material 3, aba <b>{ui:catalog.window.palette}</b> (<kbd>Ctrl+Shift+9</kbd>).',
      try: 'Abra o {ui:catalog.window.title} na app e adicione um componente aqui.',
    },
    {
      t: 'Perspectivas',
      p: '%perspectives',
      try: 'Troque a perspectiva no seletor acima das abas e veja as abas e os chips mudarem.',
    },
  ],
};

export const GUIDE_MESSAGES: Readonly<Record<GuideLocale, GuideMessages>> = {
  'en-US': enUS,
  'pt-BR': ptBR,
};
