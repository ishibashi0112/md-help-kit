// md-help-kit（コア層）の公開API
export { HelpContent, type HelpContentProps } from "./content.js";
export { HelpLoadError, type HelpLoadErrorOptions, HelpNotFoundError } from "./errors.js";
export { useHelp, useHelpPage } from "./hooks.js";
export { HelpProvider, type HelpProviderProps } from "./provider.js";
export { bundled } from "./source-bundled.js";
export { type RemoteOptions, remote } from "./source-remote.js";
export type {
  HelpApi,
  HelpCodeBlockProps,
  HelpCurrentPage,
  HelpHeading,
  HelpIndexNode,
  HelpIndexStatus,
  HelpPageStatus,
  HelpSearchHit,
  HelpSource,
} from "./types.js";
