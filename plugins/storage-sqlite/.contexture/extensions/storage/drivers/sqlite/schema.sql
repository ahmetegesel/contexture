-- schema.sql: the sqlite store at schema version 6 (PRAGMA user_version 6, the package
-- manifest's storage format), the contract 4 store-only card (docs/the-engine.md, The
-- descriptor and the handshake). The store holds module data only, keys and values in one
-- table. A fresh store runs this file whole; db-init.sh sets user_version 6 after it, and a
-- store at any other version is refused.
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- The generic module store: module-owned data keyed by (namespace, key), the value opaque
-- bytes. The default BINARY text collation makes the primary key's order bytewise, the
-- contract's list order.
CREATE TABLE IF NOT EXISTS store (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  PRIMARY KEY (namespace, key)
);
