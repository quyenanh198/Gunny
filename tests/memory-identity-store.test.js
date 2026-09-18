import test from "node:test";
import assert from "node:assert/strict";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";

test("recordChat caps the in-memory buffer instead of growing without bound", async () => {
  const store = new MemoryIdentityStore();
  for (let i = 0; i < 1005; i++) await store.recordChat({ id: `m${i}`, roomId: "R1", senderId: "u1", text: `${i}` });
  assert.equal(store.chatMessages.length, 1000);
  assert.equal(store.chatMessages[0].id, "m5", "the oldest messages are dropped first");
  assert.equal(store.chatMessages.at(-1).id, "m1004");
});
