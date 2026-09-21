-- Thú cưng, cường hoá vũ khí, pháo đài, ngọc, số lần phá hầm ngục: trước đây chỉ
-- nằm trong RAM nên mỗi lần deploy hay khởi động lại là mất sạch. Cả hồ sơ là một
-- khối JSON theo người chơi — đọc/ghi luôn trọn gói, không có truy vấn nào cần
-- lọc theo từng món bên trong, nên jsonb một cột là đủ và đỡ phải migrate mỗi lần
-- thêm tính năng mới vào hồ sơ.
CREATE TABLE IF NOT EXISTS mmo_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
