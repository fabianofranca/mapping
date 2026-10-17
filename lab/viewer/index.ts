/**
 * Visualizador embutível: a entrada pública do núcleo (sem framework). O hospedeiro monta a
 * biblioteca com `loadLibrary`, descreve a tela (`parseScreen` ou um objeto `Screen`) e chama
 * `createViewer`. Em vez da tela pronta, pode passar `source` (um JSON externo): a origem
 * declarada na especialização o traduz (`translateSource`) e `layoutScreen` o arruma, tudo em
 * `screenFromSource`, que também serve a quem quer a tela sem desenhar. As fontes são do hospedeiro (CSS `@font-face` ou `FontFace`); depois que
 * carregarem, `viewer.redraw()`. Para o site que serve a pasta da biblioteca por URL,
 * `loadLibraryFromUrl` e `registerLibraryFonts` (funções do hospedeiro, fora do núcleo).
 */
export { createViewer } from './viewer';
export type { Viewer, ViewerInput, ViewerOptions } from './viewer';
export { ScreenRenderer } from './screenRenderer';
export type {
  InstanceWarnings,
  ScreenRendererOptions,
  ScreenRendererUpdateOptions,
} from './screenRenderer';
export { konvaMeasurer } from './measure';
export { instanceLabel, loadLibrary, resolvePath } from '../components/library';
export type {
  FieldDef,
  Library,
  LoadedFont,
  TextFile,
  TypeDef,
} from '../components/library';
export {
  childrenOf,
  parseScreen,
  renderOrder,
  serializeScreen,
} from '../components/screen';
export type { Box, Instance, Screen } from '../components/screen';
export type {
  ComponentFile,
  FieldValue,
  FieldValues,
} from '../components/componentFormat';
export { approximateMeasurer } from '../components/instantiate';
export type { TextMeasurer } from '../components/instantiate';
export { flattenTree, screenTree } from './tree';
export type { TreeNode } from './tree';
export { screenFromSource, translateSource } from '../components/origin';
export type { SourceOptions, SourceResult, TranslateResult } from '../components/origin';
export { SCREEN_ANCHORS, layoutScreen } from '../components/layout';
export type {
  LayoutNode,
  LayoutResult,
  LayoutRoot,
  LayoutScreen,
  ScreenAnchor,
} from '../components/layout';
export { loadLibraryFromUrl, registerLibraryFonts } from './host';
export type { FontHost, FontStatus, LoadFromUrlOptions } from './host';
