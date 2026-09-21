import test from "node:test";
import assert from "node:assert/strict";
import { MmoStore } from "../server/mmo-store.js";
import { PostgresMmoPersistence } from "../server/mmo-persistence.js";
import { createPool, migrate } from "../server/database.js";
import { PostgresIdentityStore } from "../server/identity-store.js";

/** Persistence giả: đủ để kiểm tra store có nạp và ghi đúng lúc hay không. */
const fakeStore = () => {
  const rows = new Map();
  return {
    rows,
    saves: 0,
    loads: 0,
    async load(userId) { this.loads += 1; return rows.has(userId) ? structuredClone(rows.get(userId)) : null; },
    async save(userId, profile) { this.saves += 1; rows.set(userId, structuredClone(profile)); },
  };
};

test("hồ sơ ghi xuống rồi nạp lại giữ nguyên thú cưng, vàng và cường hoá", async () => {
  const persistence = fakeStore();
  const first = new MmoStore(persistence);
  await first.hydrate("u1");
  first.hatchPet("u1", "common_egg", "Bé Bự");
  first.enhanceWeapon("u1", "carrot");
  await first.flush("u1");
  const before = first.getProfile("u1");

  // Tiến trình mới (như sau khi deploy): không có gì trong RAM.
  const second = new MmoStore(persistence);
  await second.hydrate("u1");
  const after = second.getProfile("u1");

  assert.equal(after.pets.length, 1);
  assert.equal(after.pets[0].name, "Bé Bự");
  assert.equal(after.activePetId, before.activePetId);
  assert.equal(after.weapons.carrot.level, before.weapons.carrot.level);
  assert.equal(after.wallet.gold, before.wallet.gold);
});

test("người chưa từng chơi thì nạp ra hồ sơ mặc định, và chỉ ghi khi được yêu cầu", async () => {
  const persistence = fakeStore();
  const store = new MmoStore(persistence);
  await store.hydrate("u2");
  assert.equal(persistence.loads, 1);
  assert.equal(persistence.saves, 0, "chỉ nạp thôi thì chưa ghi gì");

  const profile = store.getProfile("u2", "Khách");
  assert.equal(profile.wallet.gold, 500);
  await store.flush("u2");
  assert.equal(persistence.saves, 1);

  // Đã có trong RAM thì không hỏi DB lại.
  await store.hydrate("u2");
  assert.equal(persistence.loads, 1);
});

test("không cấu hình persistence thì store chạy như cũ, hydrate/flush không làm gì", async () => {
  const store = new MmoStore();
  await store.hydrate("u3");
  store.hatchPet("u3", "common_egg");
  await store.flush("u3");
  assert.equal(store.getProfile("u3").pets.length, 1);
});

const databaseUrl = process.env.DATABASE_URL;
test("PostgreSQL giữ tiến trình MMO qua lần khởi động lại", { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
    const identity = new PostgresIdentityStore(pool);
    const session = await identity.createGuest("Thợ Rèn");
    const userId = session.user.id;

    const before = new MmoStore(new PostgresMmoPersistence(pool));
    await before.hydrate(userId);
    const hatched = before.hatchPet(userId, "common_egg", "Mực");
    before.enhanceWeapon(userId, "carrot");
    await before.flush(userId);
    const goldBefore = before.getProfile(userId).wallet.gold;

    const after = new MmoStore(new PostgresMmoPersistence(pool));
    await after.hydrate(userId);
    const profile = after.getProfile(userId);
    assert.equal(profile.pets.length, 1);
    assert.equal(profile.pets[0].id, hatched.pet.id);
    assert.equal(profile.wallet.gold, goldBefore);

    // Ghi lần hai phải đè lên hàng cũ, không tạo thêm hàng.
    after.enhanceWeapon(userId, "carrot");
    await after.flush(userId);
    const rows = await pool.query("SELECT count(*)::int AS n FROM mmo_profiles WHERE user_id = $1", [userId]);
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await pool.end();
  }
});
