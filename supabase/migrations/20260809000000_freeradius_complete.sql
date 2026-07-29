-- ============================================================
-- SmartLinkNet: FreeRADIUS Complete SQL Backend
-- Migration: 20260809000000
--
-- Supersedes 20260806 + 20260808 (both had dependency ordering
-- issues and missing column guards). Run this file directly in
-- the Supabase SQL editor. It is fully idempotent.
--
-- Execution order:
--   1. Column guards  (ensure prerequisite columns exist)
--   2. Tables         (radacct, radpostauth — must exist before triggers)
--   3. Views          (radcheck, radreply, radgroupcheck, radgroupreply,
--                      radusergroup, nas — read from existing tables)
--   4. Indexes        (on radacct, radpostauth, sessions)
--   5. Grants         (service_role + postgres for FreeRADIUS DB user)
--   6. Triggers       (fn_sync_radacct, fn_sync_radpostauth — need tables)
--   7. CoA trigger    (fn_trigger_coa_on_subscription — needs job_queue)
--   8. Platform RLS   (idempotent policy guard)
-- ============================================================

-- ── 1. Column guards ──────────────────────────────────────────────────────
-- These columns may be missing if earlier migrations aborted mid-way.

-- radius_profiles.simultaneous_use
-- (20260628 added this but aborted if ip_pools didn't exist yet)
ALTER TABLE public.radius_profiles
  ADD COLUMN IF NOT EXISTS simultaneous_use INTEGER;

-- sessions columns needed by fn_sync_radacct
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS nas_session_id  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminated_by   TEXT;

-- radius_servers columns needed by apply-router-config + provision
ALTER TABLE public.radius_servers
  ADD COLUMN IF NOT EXISTS freeradius_ip    TEXT,
  ADD COLUMN IF NOT EXISTS freeradius_ip2   TEXT,
  ADD COLUMN IF NOT EXISTS coa_secret       TEXT,
  ADD COLUMN IF NOT EXISTS interim_interval INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS db_host          TEXT,
  ADD COLUMN IF NOT EXISTS db_port          INTEGER DEFAULT 5432,
  ADD COLUMN IF NOT EXISTS db_name          TEXT,
  ADD COLUMN IF NOT EXISTS db_user          TEXT,
  ADD COLUMN IF NOT EXISTS db_password      TEXT;

-- routers columns needed by provision-callback + router-poll
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS radius_healthy   BOOLEAN,
  ADD COLUMN IF NOT EXISTS cpu_load         INTEGER,
  ADD COLUMN IF NOT EXISTS free_memory      BIGINT,
  ADD COLUMN IF NOT EXISTS total_memory     BIGINT,
  ADD COLUMN IF NOT EXISTS uptime_seconds   INTEGER,
  ADD COLUMN IF NOT EXISTS ros_version      TEXT,
  ADD COLUMN IF NOT EXISTS board_name       TEXT,
  ADD COLUMN IF NOT EXISTS hotspot_users    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pppoe_users      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dhcp_leases      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interface_traffic JSONB,
  ADD COLUMN IF NOT EXISTS provisioned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backup_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovered_config JSONB,
  ADD COLUMN IF NOT EXISTS validation_errors JSONB,
  ADD COLUMN IF NOT EXISTS rollback_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at         TIMESTAMPTZ;

-- ── 2. Tables ─────────────────────────────────────────────────────────────
-- Must be created BEFORE any trigger or grant that references them.

-- radacct: FreeRADIUS writes accounting records here via rlm_sql
CREATE TABLE IF NOT EXISTS public.radacct (
  radacctid           BIGSERIAL    PRIMARY KEY,
  acctsessionid       TEXT         NOT NULL,
  acctuniqueid        TEXT         NOT NULL UNIQUE,
  username            TEXT         NOT NULL,
  realm               TEXT         DEFAULT '',
  nasipaddress        TEXT         NOT NULL,
  nasportid           TEXT,
  nasporttype         TEXT,
  acctstarttime       TIMESTAMPTZ,
  acctupdatetime      TIMESTAMPTZ,
  acctstoptime        TIMESTAMPTZ,
  acctinterval        INTEGER,
  acctsessiontime     INTEGER      DEFAULT 0,
  acctauthentic       TEXT,
  connectinfo_start   TEXT,
  connectinfo_stop    TEXT,
  acctinputoctets     BIGINT       DEFAULT 0,
  acctoutputoctets    BIGINT       DEFAULT 0,
  calledstationid     TEXT,
  callingstationid    TEXT,
  acctterminatecause  TEXT,
  servicetype         TEXT,
  framedprotocol      TEXT,
  framedipaddress     TEXT,
  framedipv6address   TEXT,
  framedipv6prefix    TEXT,
  framedinterfaceid   TEXT,
  delegatedipv6prefix TEXT,
  class               TEXT,
  -- SmartLinkNet linkage (backfilled by fn_sync_radacct trigger)
  tenant_id           UUID,
  subscription_id     UUID,
  nas_id              UUID
);

-- radpostauth: FreeRADIUS writes post-auth log here via rlm_sql
CREATE TABLE IF NOT EXISTS public.radpostauth (
  id           BIGSERIAL    PRIMARY KEY,
  username     TEXT         NOT NULL,
  pass         TEXT,
  reply        TEXT,
  nasipaddress TEXT,
  nasportid    TEXT,
  authdate     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  class        TEXT,
  -- SmartLinkNet linkage (backfilled by fn_sync_radpostauth trigger)
  tenant_id    UUID,
  nas_id       UUID
);

-- ── 3. Views ──────────────────────────────────────────────────────────────

-- radcheck: credentials FreeRADIUS checks on every Access-Request
CREATE OR REPLACE VIEW public.radcheck AS
  -- Active subscriptions (PPPoE + Hotspot)
  SELECT
    s.id::text           AS id,
    s.username           AS username,
    'Cleartext-Password' AS attribute,
    ':='                 AS op,
    s.password           AS value
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND s.password IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Unused vouchers: code is both username and password
  SELECT
    v.id::text           AS id,
    v.code               AS username,
    'Cleartext-Password' AS attribute,
    ':='                 AS op,
    v.code               AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now());

-- radreply: attributes FreeRADIUS sends back in Access-Accept
CREATE OR REPLACE VIEW public.radreply AS
  -- Subscription: Mikrotik-Rate-Limit
  SELECT
    s.id::text            AS id,
    s.username            AS username,
    'Mikrotik-Rate-Limit' AS attribute,
    '='                   AS op,
    CASE
      WHEN rp.rate_limit IS NOT NULL THEN rp.rate_limit
      WHEN pkg.speed_down_kbps >= 1024
        THEN ROUND(pkg.speed_down_kbps::numeric / 1024) || 'M/' ||
             ROUND(COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps)::numeric / 1024) || 'M'
      WHEN pkg.speed_down_kbps IS NOT NULL
        THEN pkg.speed_down_kbps || 'k/' ||
             COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps) || 'k'
      ELSE '10M/5M'
    END                   AS value
  FROM public.subscriptions s
  JOIN public.packages pkg ON pkg.id = s.package_id
  LEFT JOIN public.radius_profiles rp
    ON rp.package_id = s.package_id AND rp.tenant_id = s.tenant_id
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Subscription: Session-Timeout (seconds until expiry)
  SELECT
    s.id::text        AS id,
    s.username        AS username,
    'Session-Timeout' AS attribute,
    '='               AS op,
    GREATEST(0, EXTRACT(EPOCH FROM (s.expires_at - now()))::integer)::text AS value
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND s.expires_at IS NOT NULL
    AND s.expires_at > now()

  UNION ALL

  -- Subscription: Simultaneous-Use
  SELECT
    s.id::text          AS id,
    s.username          AS username,
    'Simultaneous-Use'  AS attribute,
    '='                 AS op,
    COALESCE(rp.simultaneous_use, 1)::text AS value
  FROM public.subscriptions s
  LEFT JOIN public.radius_profiles rp
    ON rp.package_id = s.package_id AND rp.tenant_id = s.tenant_id
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Voucher: Mikrotik-Rate-Limit
  SELECT
    v.id::text            AS id,
    v.code                AS username,
    'Mikrotik-Rate-Limit' AS attribute,
    '='                   AS op,
    CASE
      WHEN pkg.speed_down_kbps >= 1024
        THEN ROUND(pkg.speed_down_kbps::numeric / 1024) || 'M/' ||
             ROUND(COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps)::numeric / 1024) || 'M'
      WHEN pkg.speed_down_kbps IS NOT NULL
        THEN pkg.speed_down_kbps || 'k/' ||
             COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps) || 'k'
      ELSE '10M/5M'
    END                   AS value
  FROM public.vouchers v
  JOIN public.packages pkg ON pkg.id = v.package_id
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now())

  UNION ALL

  -- Voucher: Session-Timeout
  SELECT
    v.id::text        AS id,
    v.code            AS username,
    'Session-Timeout' AS attribute,
    '='               AS op,
    GREATEST(0, EXTRACT(EPOCH FROM (v.expires_at - now()))::integer)::text AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND v.expires_at IS NOT NULL
    AND v.expires_at > now()

  UNION ALL

  -- Voucher: Simultaneous-Use (always 1 — single-use tokens)
  SELECT
    v.id::text         AS id,
    v.code             AS username,
    'Simultaneous-Use' AS attribute,
    '='                AS op,
    '1'                AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now());

-- radgroupcheck + radusergroup: BOTH use package_id as groupname
-- so FreeRADIUS group lookups actually match.
CREATE OR REPLACE VIEW public.radgroupcheck AS
  SELECT
    pkg.id::text  AS id,
    pkg.id::text  AS groupname,
    'Auth-Type'   AS attribute,
    ':='          AS op,
    'Local'       AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

CREATE OR REPLACE VIEW public.radgroupreply AS
  SELECT
    pkg.id::text   AS id,
    pkg.id::text   AS groupname,
    'Fall-Through' AS attribute,
    '='            AS op,
    'No'           AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

CREATE OR REPLACE VIEW public.radusergroup AS
  SELECT
    s.username         AS username,
    s.package_id::text AS groupname,
    1                  AS priority
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

-- nas: NAS device registry — FreeRADIUS validates RADIUS clients from here
-- Two rows per device: one keyed on nas_ip (used when router sends NAS-IP-Address),
-- one keyed on nas_identifier (fallback when nas_ip is not yet discovered).
-- server = NULL means use the default virtual server.
CREATE OR REPLACE VIEW public.nas AS
  SELECT
    nd.id::text                            AS id,
    COALESCE(nd.nas_ip, nd.nas_identifier) AS nasname,
    nd.nas_identifier                      AS shortname,
    'other'                                AS type,
    1812                                   AS ports,
    nd.shared_secret                       AS secret,
    NULL::text                             AS server,
    nd.name                                AS community,
    nd.tenant_id::text                     AS description
  FROM public.nas_devices nd
  WHERE nd.is_active = true
    AND nd.shared_secret IS NOT NULL

  UNION ALL

  -- Fallback row keyed on nas_identifier so FreeRADIUS can match the client
  -- by router name when nas_ip is not yet populated (e.g. before first poll).
  SELECT
    (nd.id::text || '-name')               AS id,
    nd.nas_identifier                      AS nasname,
    nd.nas_identifier                      AS shortname,
    'other'                                AS type,
    1812                                   AS ports,
    nd.shared_secret                       AS secret,
    NULL::text                             AS server,
    nd.name                                AS community,
    nd.tenant_id::text                     AS description
  FROM public.nas_devices nd
  WHERE nd.is_active = true
    AND nd.shared_secret IS NOT NULL
    AND nd.nas_ip IS NOT NULL
    AND nd.nas_ip <> nd.nas_identifier;

-- ── 4. Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_radacct_username  ON public.radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_session   ON public.radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasip     ON public.radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_start     ON public.radacct(acctstarttime DESC);
CREATE INDEX IF NOT EXISTS idx_radacct_open      ON public.radacct(acctstoptime) WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS idx_radacct_tenant    ON public.radacct(tenant_id)    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_radpostauth_user  ON public.radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_date  ON public.radpostauth(authdate DESC);

-- Unique index on sessions.nas_session_id — required by ON CONFLICT in fn_sync_radacct
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_nas_session_unique
  ON public.sessions(nas_session_id)
  WHERE nas_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_open
  ON public.sessions(username, tenant_id)
  WHERE ended_at IS NULL;

-- ── 5. Grants ─────────────────────────────────────────────────────────────
-- FreeRADIUS connects as the postgres user (DB_USER in setup.sh).
-- service_role alone is not sufficient — postgres needs direct grants.

GRANT SELECT ON public.radcheck      TO service_role, postgres;
GRANT SELECT ON public.radreply      TO service_role, postgres;
GRANT SELECT ON public.radgroupcheck TO service_role, postgres;
GRANT SELECT ON public.radgroupreply TO service_role, postgres;
GRANT SELECT ON public.radusergroup  TO service_role, postgres;
GRANT SELECT ON public.nas           TO service_role, postgres;

GRANT INSERT, UPDATE, SELECT ON public.radacct     TO service_role, postgres;
GRANT INSERT,         SELECT ON public.radpostauth TO service_role, postgres;

GRANT USAGE, SELECT ON SEQUENCE public.radacct_radacctid_seq   TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.radpostauth_id_seq      TO service_role, postgres;

-- ── 6. fn_sync_radacct trigger ────────────────────────────────────────────
-- Fires on every INSERT/UPDATE to radacct.
-- Backfills tenant_id/subscription_id/nas_id on the radacct row,
-- syncs to radius_accounting, and upserts/closes the sessions row.
-- Conflict key is acctuniqueid (not username+tenant_id) so reconnects
-- create new session rows instead of overwriting the previous one.
CREATE OR REPLACE FUNCTION public.fn_sync_radacct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_nas RECORD;
BEGIN
  SELECT s.id, s.customer_id, s.tenant_id, s.package_id
    INTO v_sub
    FROM public.subscriptions s
   WHERE s.username = NEW.username
     AND s.status IN ('active', 'suspended')
   LIMIT 1;

  SELECT nd.id, nd.tenant_id
    INTO v_nas
    FROM public.nas_devices nd
   WHERE (nd.nas_ip = NEW.nasipaddress OR nd.nas_identifier = NEW.nasipaddress)
     AND nd.is_active = true
   LIMIT 1;

  NEW.tenant_id       := COALESCE(v_sub.tenant_id, v_nas.tenant_id);
  NEW.subscription_id := v_sub.id;
  NEW.nas_id          := v_nas.id;

  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.radius_accounting (
    tenant_id, nas_id, session_id, nas_identifier, username,
    framed_ip, calling_station, called_station,
    acct_status_type, acct_input_octets, acct_output_octets,
    acct_session_time, acct_terminate_cause, service_type, received_at
  ) VALUES (
    NEW.tenant_id, NEW.nas_id, NEW.acctsessionid, NEW.nasipaddress, NEW.username,
    NEW.framedipaddress, NEW.callingstationid, NEW.calledstationid,
    CASE
      WHEN NEW.acctstoptime IS NOT NULL THEN 'Stop'
      WHEN NEW.acctstarttime IS NOT NULL
        AND (NEW.acctupdatetime IS NULL OR NEW.acctupdatetime = NEW.acctstarttime) THEN 'Start'
      ELSE 'Interim-Update'
    END,
    COALESCE(NEW.acctinputoctets,  0),
    COALESCE(NEW.acctoutputoctets, 0),
    COALESCE(NEW.acctsessiontime,  0),
    NEW.acctterminatecause,
    NEW.servicetype,
    now()
  ) ON CONFLICT DO NOTHING;

  IF NEW.acctstarttime IS NOT NULL AND NEW.acctstoptime IS NULL THEN
    INSERT INTO public.sessions (
      tenant_id, customer_id, subscription_id, nas_session_id,
      username, ip_address, mac_address, bytes_in, bytes_out, started_at
    ) VALUES (
      NEW.tenant_id, v_sub.customer_id, v_sub.id, NEW.acctuniqueid,
      NEW.username, NEW.framedipaddress, NEW.callingstationid,
      COALESCE(NEW.acctinputoctets,  0),
      COALESCE(NEW.acctoutputoctets, 0),
      NEW.acctstarttime
    )
    ON CONFLICT (nas_session_id) DO UPDATE SET
      bytes_in   = EXCLUDED.bytes_in,
      bytes_out  = EXCLUDED.bytes_out,
      updated_at = now()
    WHERE public.sessions.ended_at IS NULL;

  ELSIF NEW.acctstoptime IS NOT NULL THEN
    UPDATE public.sessions SET
      bytes_in          = COALESCE(NEW.acctinputoctets,  0),
      bytes_out         = COALESCE(NEW.acctoutputoctets, 0),
      duration_seconds  = COALESCE(NEW.acctsessiontime,  0),
      ended_at          = NEW.acctstoptime,
      terminated_by     = COALESCE(NEW.acctterminatecause, 'User-Request'),
      updated_at        = now()
    WHERE nas_session_id = NEW.acctuniqueid
      AND ended_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_radacct_sync ON public.radacct;
CREATE TRIGGER trg_radacct_sync
  BEFORE INSERT OR UPDATE ON public.radacct
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_radacct();

-- ── 7. fn_sync_radpostauth trigger ────────────────────────────────────────
-- Fires on every INSERT to radpostauth.
-- Backfills tenant_id/nas_id, inserts auth_events row,
-- and marks voucher as used on Access-Accept.
CREATE OR REPLACE FUNCTION public.fn_sync_radpostauth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nas RECORD;
BEGIN
  SELECT nd.id, nd.tenant_id INTO v_nas
    FROM public.nas_devices nd
   WHERE (nd.nas_ip = NEW.nasipaddress OR nd.nas_identifier = NEW.nasipaddress)
     AND nd.is_active = true
   LIMIT 1;

  NEW.tenant_id := v_nas.tenant_id;
  NEW.nas_id    := v_nas.id;

  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.auth_events (
      tenant_id, username, nas_id,
      event_type, nas_identifier, received_at
    ) VALUES (
      NEW.tenant_id, NEW.username, NEW.nas_id,
      CASE WHEN NEW.reply = 'Access-Accept' THEN 'auth_success' ELSE 'auth_reject' END,
      NEW.nasipaddress, NEW.authdate
    );

    -- Mark voucher used on first successful auth
    IF NEW.reply = 'Access-Accept' THEN
      UPDATE public.vouchers
         SET status  = 'used',
             used_at = now()
       WHERE code   = NEW.username
         AND status = 'unused';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_radpostauth_sync ON public.radpostauth;
CREATE TRIGGER trg_radpostauth_sync
  BEFORE INSERT ON public.radpostauth
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_radpostauth();

-- ── 8. CoA trigger on subscription changes ────────────────────────────────
-- Fires when a subscription is suspended, expired, cancelled, reactivated,
-- or has its package changed. Queues a coa_action job for queue-worker.
CREATE OR REPLACE FUNCTION public.fn_trigger_coa_on_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
  v_rate   TEXT;
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  v_action := NULL;

  IF OLD.status = 'active' AND NEW.status IN ('suspended', 'expired', 'cancelled') THEN
    v_action := 'disconnect';
  ELSIF OLD.status IN ('suspended', 'expired') AND NEW.status = 'active' THEN
    v_action := 'coa';
  ELSIF NEW.status = 'active' AND OLD.package_id IS DISTINCT FROM NEW.package_id THEN
    v_action := 'coa';
  END IF;

  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_action = 'coa' THEN
    SELECT
      CASE
        WHEN rp.rate_limit IS NOT NULL THEN rp.rate_limit
        WHEN pkg.speed_down_kbps >= 1024
          THEN ROUND(pkg.speed_down_kbps::numeric / 1024) || 'M/' ||
               ROUND(COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps)::numeric / 1024) || 'M'
        WHEN pkg.speed_down_kbps IS NOT NULL
          THEN pkg.speed_down_kbps || 'k/' ||
               COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps) || 'k'
        ELSE '10M/5M'
      END
    INTO v_rate
    FROM public.packages pkg
    LEFT JOIN public.radius_profiles rp
      ON rp.package_id = pkg.id AND rp.tenant_id = NEW.tenant_id
    WHERE pkg.id = NEW.package_id;
  END IF;

  INSERT INTO public.job_queue (
    tenant_id, type, payload, status, run_at, queue_name
  ) VALUES (
    NEW.tenant_id,
    'coa_action',
    jsonb_build_object(
      'action',         v_action,
      'username',       NEW.username,
      'tenant_id',      NEW.tenant_id::text,
      'new_rate_limit', v_rate,
      'reason',         CASE
                          WHEN v_action = 'disconnect'
                            THEN 'subscription_' || NEW.status
                          WHEN OLD.package_id IS DISTINCT FROM NEW.package_id
                            THEN 'package_change'
                          ELSE 'subscription_reactivated'
                        END
    ),
    'pending',
    now(),
    'coa'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_coa ON public.subscriptions;
CREATE TRIGGER trg_subscription_coa
  AFTER UPDATE OF status, package_id ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_coa_on_subscription();

-- ── 9. Helper functions ───────────────────────────────────────────────────

-- fn_mark_voucher_used: kept for manual/API use
CREATE OR REPLACE FUNCTION public.fn_mark_voucher_used(_username TEXT, _ip TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vouchers
     SET status  = 'used',
         used_at = now()
   WHERE code   = _username
     AND status = 'unused';
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_mark_voucher_used(TEXT, TEXT) TO service_role;

-- fn_get_active_session: used by coa-send edge function
CREATE OR REPLACE FUNCTION public.fn_get_active_session(_username TEXT, _tenant_id UUID)
RETURNS TABLE(nas_session_id TEXT, nas_ip TEXT, framed_ip TEXT, nas_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.nas_session_id,
    nd.nas_ip,
    s.ip_address,
    nd.id AS nas_id
  FROM public.sessions s
  JOIN public.nas_devices nd
    ON nd.tenant_id = _tenant_id AND nd.is_active = true
  WHERE s.username  = _username
    AND s.tenant_id = _tenant_id
    AND s.ended_at  IS NULL
  ORDER BY s.started_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_get_active_session(TEXT, UUID) TO service_role;

-- ── 10. Platform settings table + RLS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'platform_settings'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON public.platform_settings
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.platform_settings (key, value) VALUES
  ('freeradius', jsonb_build_object(
    'primary_ip',       null,
    'secondary_ip',     null,
    'auth_port',        1812,
    'acct_port',        1813,
    'coa_port',         3799,
    'interim_interval', 300,
    'timeout_ms',       3000,
    'retry_count',      3,
    'shared_secret',    null,
    'coa_shim_port',    8080,
    'deployed',         false
  ))
ON CONFLICT (key) DO NOTHING;
