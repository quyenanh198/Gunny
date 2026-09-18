-- Support/feedback intake (R8): the "contact/support" beta gate item.
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('bug', 'suggestion', 'other')),
  message varchar(2000) NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
