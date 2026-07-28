-- Add API connectivity tracking and pending credential columns to routers
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS api_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_username_pending text,
  ADD COLUMN IF NOT EXISTS api_password_pending text;
