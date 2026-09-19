import test from "node:test";
import assert from "node:assert/strict";
import { SocialSafety } from "../server/social-safety.js";

function fakeStore(seed = { blocks: [], mutes: [] }) {
  const blocks = [...seed.blocks];
  const mutes = [...seed.mutes];
  const reports = [];
  const chat = [];
  let loadCalls = 0;
  return {
    loadCalls: () => loadCalls,
    reports, chat,
    async loadSocial(userId) {
      loadCalls++;
      return {
        blocks: blocks.filter(([a, b]) => a === userId || b === userId),
        mutes: mutes.filter(([a]) => a === userId).map(([, b]) => b),
      };
    },
    async setBlock(userId, targetId, enabled) {
      if (enabled) blocks.push([userId, targetId]);
    },
    async setMute(userId, targetId, enabled) {
      if (enabled) mutes.push([userId, targetId]);
    },
    async createReport(report) { reports.push(report); },
    async recordChat(message) { chat.push(message); },
  };
}

test("load caches per user and only queries the store once", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  await safety.load("alice");
  await safety.load("alice");
  assert.equal(store.loadCalls(), 1);
});

test("a block is mutual for interaction and matchmaking regardless of who blocked whom", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  await safety.setBlock("alice", "bob", true);
  assert.equal(safety.canInteract("alice", "bob"), false);
  assert.equal(safety.canInteract("bob", "alice"), false, "block is symmetric for gameplay purposes");
  assert.equal(safety.canMatchGroups(["alice", "carol"], ["bob"]), false);
  assert.equal(safety.canMatchGroups(["dave"], ["erin"]), true);
});

test("unblocking restores interaction", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  await safety.setBlock("alice", "bob", true);
  await safety.setBlock("alice", "bob", false);
  assert.equal(safety.canInteract("alice", "bob"), true);
});

test("block or target validation rejects self and empty target", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  assert.equal(await safety.setBlock("alice", "alice", true), false);
  assert.equal(await safety.setBlock("alice", "", true), false);
  assert.equal(await safety.setMute("alice", "alice", true), false);
});

test("canView hides a blocked sender from the blocker only, and a mute hides it only for the muter", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  await safety.setBlock("alice", "bob", true);
  await safety.setMute("carol", "dave", true);
  assert.equal(safety.canView("alice", "bob"), false);
  assert.equal(safety.canView("bob", "alice"), false, "the blocked party also cannot see the blocker in a symmetric block");
  assert.equal(safety.canView("erin", "bob"), true, "an unrelated viewer is unaffected");
  assert.equal(safety.canView("carol", "dave"), false);
  assert.equal(safety.canView("frank", "dave"), true, "mute only affects the muter's own view");
  assert.equal(safety.canView(null, "dave"), true, "an unauthenticated viewer sees everything");
  assert.equal(safety.canView("dave", "dave"), true, "a sender always sees their own message");
});

test("sanitize masks configured profanity case-insensitively while preserving length and surrounding text", () => {
  const safety = new SocialSafety(fakeStore(), { profanityTerms: ["shit"] });
  assert.equal(safety.sanitize("that is SHIT right there"), "that is **** right there");
  assert.equal(safety.sanitize("shitshow"), "shitshow", "only whole-word matches are masked");
  assert.equal(safety.sanitize("  spaced   out  "), "spaced out", "sanitize also normalizes whitespace");
});

test("recordChat persists the sanitized text through the store", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store, { profanityTerms: ["shit"] });
  const message = await safety.recordChat("room-1", "alice", "this is shit");
  assert.equal(message.text, "this is ****");
  assert.equal(store.chat.length, 1);
  assert.equal(store.chat[0].text, "this is ****");
});

test("report rejects self-reports, unknown categories and oversized details", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  assert.equal(await safety.report("alice", { targetId: "alice", category: "chat" }), null);
  assert.equal(await safety.report("alice", { targetId: "bob", category: "not-a-category" }), null);
  assert.equal(await safety.report("alice", { targetId: "bob", category: "chat", details: "x".repeat(501) }), null);
  const report = await safety.report("alice", { targetId: "bob", category: "harassment", details: " padded " });
  assert.equal(report.status, "open");
  assert.equal(report.details, "padded");
  assert.equal(store.reports.length, 1);
});

test("resetIfIdle clears cache and forces reload on next query", async () => {
  const store = fakeStore();
  const safety = new SocialSafety(store);
  await safety.load("alice");
  assert.equal(store.loadCalls(), 1);
  await safety.load("alice");
  assert.equal(store.loadCalls(), 1);
  safety.resetIfIdle();
  await safety.load("alice");
  assert.equal(store.loadCalls(), 2);
});
