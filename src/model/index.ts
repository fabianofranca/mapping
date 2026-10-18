// API pública do modelo: tipos, operações puras, validação e serialização.
export * from './types';
export * from './errors';
export * from './geometry';
export * from './hierarchy';
export * from './projectIndex';
export * from './invariants';
export * from './migrations';
export * from './schema';
export * from './serialization';
export * from './repair';
export {
  createProject,
  renameProject,
  touchProject,
  type NewProjectArgs,
} from './project';
export * from './layers';
export * from './images';
export * from './imageOptimization';
export * from './exif';
export * from './markings';
// Motor dos componentes: só o que quem desenha ou mede precisa pelo índice do modelo.
export { approximateMeasurer, type TextMeasurer } from './components/instantiate';
export type { ComponentFile, FieldValues } from './components/componentFormat';
export type { FrameNode } from './components/scene';
export * from './componentCatalog';
export * from './componentValues';
export * from './componentDrawings';
export * from './componentMarkings';
export * from './componentArrange';
export * from './locks';
export * from './annotations';
export * from './links';
export * from './listing';
export * from './display';
export * from './spec';
export * from './specLookup';
export * from './specializations';
export * from './libraryPackage';
export * from './specVersions';
export * from './typed';
export * from './refs';
export * from './itemRef';
export * from './clipboard';
export * from './revision';
export * from './backups';
export * from './issues';
export * from './typedDisplay';
export * from './codeLocations';
export * from './codeBlueprint';
export * from './sources';
export * from './proposal';
export * from './proposalChanges';
export * from './proposalReview';
export * from './proposalApply';
export * from './proposalCompare';
export * from './proposalView';
// Valor de um campo na forma de `from`/`to` (os marcadores dos Detalhes na revisão).
export { annotationField, imageField, markingField } from './proposalValues';
export * from './specWarnings';
