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
export * from './locks';
export * from './annotations';
export * from './links';
export * from './listing';
export * from './display';
export * from './spec';
export * from './specLookup';
export * from './specializations';
export * from './typed';
export * from './refs';
export * from './itemRef';
export * from './clipboard';
export * from './revision';
export * from './backups';
export * from './issues';
export * from './typedDisplay';
export * from './codeRefs';
export * from './codeBlueprint';
export * from './sources';
export * from './proposal';
export * from './proposalChanges';
export * from './proposalReview';
export * from './proposalApply';
export * from './proposalCompare';
export * from './proposalView';
export * from './specWarnings';
