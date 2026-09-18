export const DEFAULT_FEATURE_FLAGS = Object.freeze({
  quickJoin: true,
  roomChat: true,
  experimentalCombat: false,
});

export function featureFlags(overrides = globalThis.__GUNNY_FEATURES__) {
  const source = overrides && typeof overrides === "object" ? overrides : {};
  return Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_FEATURE_FLAGS).map(([name, fallback]) => [
      name,
      typeof source[name] === "boolean" ? source[name] : fallback,
    ]),
  ));
}

export function isFeatureEnabled(name, overrides) {
  return featureFlags(overrides)[name] === true;
}
