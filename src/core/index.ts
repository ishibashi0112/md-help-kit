// md-help-kit（コア層）の公開API
export { HelpLoadError, type HelpLoadErrorOptions, HelpNotFoundError } from "./errors.js";
export { bundled } from "./source-bundled.js";
export { type RemoteOptions, remote } from "./source-remote.js";
export type { HelpHeading, HelpIndexNode, HelpSearchHit, HelpSource } from "./types.js";
