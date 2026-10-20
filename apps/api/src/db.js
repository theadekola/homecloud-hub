import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'active',
      totp_secret TEXT,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users(lower(username));
    DO $$
    DECLARE account RECORD; base TEXT; candidate TEXT; suffix INTEGER;
    BEGIN
      LOCK TABLE users IN EXCLUSIVE MODE;
      FOR account IN SELECT id,email FROM users WHERE username IS NULL ORDER BY created_at,id LOOP
        base := left(regexp_replace(lower(split_part(COALESCE(account.email,'user'),'@',1)), '[^a-z0-9_.-]', '_', 'g'),48);
        IF length(base)<3 THEN base := 'user_' || base; END IF;
        candidate := base; suffix := 1;
        WHILE EXISTS(SELECT 1 FROM users WHERE lower(username)=candidate) LOOP
          candidate := base || '_' || suffix; suffix := suffix+1;
        END LOOP;
        UPDATE users SET username=candidate WHERE id=account.id;
      END LOOP;
    END $$;
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id UUID,
      user_email TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      ip TEXT,
      request_id TEXT
    );
    CREATE TABLE IF NOT EXISTS action_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      provider TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      phrase_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

}
