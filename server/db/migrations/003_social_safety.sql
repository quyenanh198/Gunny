CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS user_mutes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id),
  CHECK (user_id <> muted_id)
);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id),
  target_id uuid NOT NULL REFERENCES users(id),
  room_id varchar(12),
  category text NOT NULL CHECK (category IN ('chat', 'cheating', 'harassment', 'afk', 'other')),
  details varchar(500) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> target_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY,
  room_id varchar(12) NOT NULL,
  sender_id uuid NOT NULL REFERENCES users(id),
  text varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE INDEX IF NOT EXISTS moderation_reports_status_created_idx ON moderation_reports(status, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_expires_idx ON chat_messages(expires_at);
