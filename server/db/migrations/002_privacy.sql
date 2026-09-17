ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz;

CREATE INDEX IF NOT EXISTS matches_status_started_at_idx ON matches(status, started_at);
