// API pública do modelo: tipos, operações puras, validação e serialização.
export * from './types';
export * from './errors';
export * from './modelMessage';
export * from './messages';
export * from './geometry';
export * from './hierarchy';
export * from './hierarchySettle';
export * from './projectIndex';
export * from './perspective';
export * from './perspectiveReconcile';
export * from './perspectivePlace';
export * from './perspectiveOps';
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
export * from './containers';
export * from './freePlacement';
export * from './density';
export * from './direction';
export * from './drawingMode';
export * from './imageOptimization';
export * from './exif';
export * from './markings';
export * from './arrows';
export * from './anchors';
export * from './anchorPlacement';
export * from './multiSelection';
// Motor dos componentes: só o que quem desenha ou mede precisa pelo índice do modelo.
export { approximateMeasurer, type TextMeasurer } from './components/instantiate';
export { cachedMeasurer, MEASURE_CACHE_LIMIT } from './components/measureCache';
export type { ComponentFile, FieldValues } from './components/componentFormat';
export { fitComponentSize, resolveSizing } from './components/sizing';
export type { FrameNode } from './components/scene';
export * from './componentCatalog';
export * from './structural';
export * from './componentValues';
export * from './componentDrawings';
export * from './componentMarkings';
export * from './componentArrange';
export * from './locks';
export * from './annotations';
export * from './links';
export * from './linkedByRole';
export * from './listing';
export * from './display';
export * from './spec';
export * from './notices';
export * from './noticeList';
export * from './specLookup';
export * from './specializations';
export * from './libraryPackage';
export * from './bundledLibrary';
export * from './catalog';
export * from './specVersions';
export * from './libraryMigrations';
export * from './typed';
export * from './refs';
export * from './itemRef';
export * from './refGrammar';
export * from './clipboard';
export * from './revision';
export * from './backups';
export * from './issues';
export * from './typedDisplay';
export * from './codeLocations';
export * from './codeBlueprint';
export * from './codeVariants';
export * from './codeParams';
export * from './signatures';
export * from './sources';
export * from './remoteImages';
export * from './proposal';
export * from './proposalChanges';
export * from './proposalReview';
export * from './proposalApply';
export * from './proposalOrder';
export * from './membership';
export * from './proposalCompare';
export * from './proposalView';
export * from './proposalRevise';
export * from './proposalRevisions';
// Conversas ancoradas (formato mapping-thread 1): formato e operações puras.
export * from './thread';
export * from './threadOps';
export * from './citations';
export * from './composerDoc';
export * from './citeTargets';
export * from './threadUsers';
export * from './threadView';
export * from './threadFilters';
export * from './threadCites';
export * from './threadPins';
export * from './threadDelete';
// Valor de um campo na forma de `from`/`to` (os marcadores dos Detalhes na revisão).
export { annotationField, imageField, markingField } from './proposalValues';
export * from './specWarnings';
// Subconjunto de markdown dos documentos da biblioteca (Catálogo).
export * from './markdown';
// Escolha de tipo: agrupar por grupo e filtrar pela busca.
export * from './typeChoice';
