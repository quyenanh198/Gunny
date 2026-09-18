// Shared reward rules for both identity stores (PostgresIdentityStore and
// MemoryIdentityStore), so match settlement and tests agree on one source of
// truth instead of two copies drifting apart.
//
// Placeholder amounts: nothing here has been balance-tuned or approved by
// product. What IS a firm rule, per ONLINE_GAME_ROADMAP.md R5: cosmetic-only
// progression, no pay-to-win, and no reward for a disconnected participant or
// an abandoned match (the anti-AFK/farm rule) — see docs/economy.md.
export const REWARD_TABLE = Object.freeze({
  win: Object.freeze({ xp: 30, currency: 20 }),
  loss: Object.freeze({ xp: 10, currency: 5 }),
  draw: Object.freeze({ xp: 15, currency: 10 }),
});
const NONE = Object.freeze({ xp: 0, currency: 0 });

export function rewardFor(participant, status = "completed") {
  if (status !== "completed" || participant.disconnected) return NONE;
  return REWARD_TABLE[participant.outcome] || NONE;
}

// Placeholder curve: 100 xp per level, flat. Not balance-tuned.
export function levelForXp(xp) {
  return Math.floor(Math.max(0, xp) / 100) + 1;
}
