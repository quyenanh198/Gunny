import test from "node:test";
import assert from "node:assert/strict";
import { PresenceService } from "../server/presence.js";

test("presence exposes reconnect routing and expires it to offline", () => {
  let now = 1000;
  const presence = new PresenceService({ now: () => now });
  presence.set("user", "reconnecting", { roomId: "ABC123", role: "player", reconnectUntil: 2000 });
  assert.deepEqual(presence.get("user"), { userId: "user", state: "reconnecting", roomId: "ABC123",
    role: "player", reconnectUntil: 2000, updatedAt: 1000 });
  now = 2001;
  assert.equal(presence.get("user").state, "offline");
  assert.equal(presence.get("missing").state, "offline");
});
