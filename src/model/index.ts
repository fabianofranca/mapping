// API pública do modelo: tipos, operações puras, validação e serialização.
export * from './types';
export * from './errors';
export * from './geometry';
export * from './hierarchy';
export * from './invariants';
export * from './migrations';
export * from './schema';
export * from './serialization';
export {
  createProject,
  renameProject,
  touchProject,
  type NewProjectArgs,
} from './project';
export * from './layers';
export * from './images';
export * from './imageOptimization';
export * from './markings';
export * from './annotations';
export * from './links';
export * from './listing';
