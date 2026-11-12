CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
