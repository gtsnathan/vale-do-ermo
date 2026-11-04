CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, recovery_hash TEXT NOT NULL, save TEXT, save_v INTEGER NOT NULL DEFAULT 0, save_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0, fail_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
