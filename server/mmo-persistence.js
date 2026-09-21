// Lưu hồ sơ MMO xuống PostgreSQL. Tách khỏi MmoStore để phần tính toán (ấp trứng,
// cường hoá, thuế pháo đài) vẫn chạy được trong test mà không cần database.
export class PostgresMmoPersistence {
  constructor(pool) {
    this.pool = pool;
  }

  async load(userId) {
    const result = await this.pool.query("SELECT profile FROM mmo_profiles WHERE user_id = $1", [userId]);
    return result.rows[0]?.profile ?? null;
  }

  async save(userId, profile) {
    await this.pool.query(`
      INSERT INTO mmo_profiles(user_id, profile, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = now()`,
      [userId, profile]);
  }
}
