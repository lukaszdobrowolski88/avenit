-- Add missing columns to app_users table for TOTP/2FA support

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_required BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS backup_codes TEXT[];
