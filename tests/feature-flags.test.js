import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FEATURE_FLAGS, featureFlags, isFeatureEnabled } from "../src/content/feature-flags.js";

test("feature flags use safe defaults and accept only boolean overrides", () => {
  assert.deepEqual(featureFlags(null), DEFAULT_FEATURE_FLAGS);
  assert.equal(featureFlags({ quickJoin: false }).quickJoin, false);
  assert.equal(featureFlags({ roomChat: "false" }).roomChat, true);
  assert.equal(isFeatureEnabled("experimentalCombat", { experimentalCombat: true }), true);
  assert.equal(isFeatureEnabled("unknown", {}), false);
});
