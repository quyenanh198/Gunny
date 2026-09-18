ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin'));

-- A ban starts 'pending_confirmation' and only takes effect once a second,
-- different admin confirms it (dual-control per ONLINE_GAME_ROADMAP.md R6).
-- A mute is lower-risk and reversible, so it goes straight to 'active'.
CREATE TABLE IF NOT EXISTS sanctions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('mute', 'ban')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending_confirmation', 'active', 'revoked')),
  issued_by uuid NOT NULL REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  revoked_by uuid REFERENCES users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS sanctions_user_status_idx ON sanctions(user_id, status);

-- Every admin-privileged write goes through recordAdminAction() so "who, when,
-- why" is always answerable without reading server logs (R6 exit criteria).
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_user_id uuid REFERENCES users(id),
  target_room_id varchar(12),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON admin_actions(created_at DESC);
