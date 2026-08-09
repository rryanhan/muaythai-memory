// Compatibility barrel for existing callers. Performance-sensitive features
// should import their domain entrypoint directly to keep client graphs narrow.
export * from "./api-core";
export * from "./capture";
export * from "./connections";
export * from "./drills";
export * from "./sharing";
export * from "./graph";
export * from "./journal";
export * from "./profile";
export * from "./taxonomy";
