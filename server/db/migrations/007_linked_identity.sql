-- Người chơi mở Gunny từ bên trong Chat (chat.lazybutts.com/gunny/) đã đăng nhập
-- sẵn ở đó, nên Gunny không hỏi lại: user của Gunny gắn vào user bên Chat qua
-- (provider, external_id). Khách vào thẳng gunny.lazybutts.com vẫn là 'guest',
-- provider để NULL — partial unique index bên dưới bỏ qua những hàng đó.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_provider_external_idx
  ON users(provider, external_id) WHERE provider IS NOT NULL;
