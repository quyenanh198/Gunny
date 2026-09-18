CREATE TABLE IF NOT EXISTS currency_ledger (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  amount integer NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  request_id text NOT NULL,
  match_id uuid REFERENCES matches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS currency_ledger_user_created_idx ON currency_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS progression (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scaffold for future cosmetic unlocks. Nothing grants into this table yet:
-- there is no shop or cosmetic catalog to entitle against. See docs/economy.md.
CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  item_id text NOT NULL,
  source text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
