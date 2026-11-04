CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  pack TEXT NOT NULL,
  gems INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  acked_at INTEGER,
  checked_at INTEGER
);
CREATE INDEX orders_pid ON orders(pid, status);
