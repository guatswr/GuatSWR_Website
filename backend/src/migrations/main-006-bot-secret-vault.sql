-- Optional recoverable Bot credentials. The encryption key lives outside SQLite.
CREATE TABLE bot_credential_secrets (
  credential_id TEXT PRIMARY KEY NOT NULL REFERENCES bot_credentials(id),
  encrypted_token TEXT NOT NULL
);
