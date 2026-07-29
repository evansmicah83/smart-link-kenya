-- ============================================================
-- SmartLinkNet: FreeRADIUS Production Fixes
-- Migration: 20260808000000
--
-- Fixes applied:
--   1. radcheck/radreply/nas/radgroupcheck/radusergroup views
--      corrected and re-granted to postgres (FreeRADIUS DB user)
--   2. Group name consistency: radgroupcheck + radusergroup both
--      use package_id so FreeRADIUS group lookups actually match
--   3. radreply: add Session-Timeout + Simultaneous-Use for vouchers
--   4. nas view: server column set to NULL (not 'INAP')
--   5. fn_sync_radacct: fix session conflict key to acctuniqueid
--   6. fn_mark_voucher_used: called automatically via radpostauth trigger
--   7. CoA trigger: fires on subscription suspend/expire/package change
--   8. fn_trigger_coa_on_subscription: queues CoA/Disconnect via job_queue
-- ============================================================

-- ── 0. Ensure radius_profiles.simultaneous_use column exists ────────────────
-- Migration 20260628 added this column but may not have run if ip_pools table
-- was absent (causing the whole migration to abort at the FK reference).
ALTER TABLE public.radius_profiles
  ADD COLUMN IF NOT EXISTS simultaneous_use INTEGER;

-- ── 1. Re-create radcheck with correct grants ─────────────────────────────
-- FreeRADIUS connects as the postgres user (DB_USER in setup.sh).
-- service_role alone is not enough — postgres user needs direct SELECT.
CREATE OR REPLACE VIEW public.radcheck AS
  -- Active subscription credentials (PPPoE + Hotspot)
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

-- Grant to both roles — FreeRADIUS connects as postgres
GRANT SELECT ON public.radcheck TO service_role;
GRANT SELECT ON public.radcheck TO postgres;

-- ── 2. Re-create radreply with voucher Session-Timeout + Simultaneous-Use ─
CREATE OR REPLACE VIEW public.radreply AS
  -- Subscription: Mikrotik-Rate-Limit from radius_profiles or packages
  SELECT
    s.id::text                    AS id,
    s.username                    AS username,
    'Mikrotik-Rate-Limit'         AS attribute,
    '='                           AS op,
    CASE
      WHEN rp.rate_limit IS NOT NULL THEN rp.rate_limit
      WHEN pkg.speed_down_kbps >= 1024
        THEN ROUND(pkg.speed_down_kbps::numeric / 1024) || 'M/' ||
             ROUND(COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps)::numeric / 1024) || 'M'
      WHEN pkg.speed_down_kbps IS NOT NULL
        THEN pkg.speed_down_kbps || 'k/' ||
             COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps) || 'k'
      ELSE '10M/5M'
    END                           AS value
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
    s.id::text AS id,
    s.username AS username,
    'Session-Timeout' AS attribute,
    '=' AS op,
    GREATEST(0, EXTRACT(EPOCH FROM (s.expires_at - now()))::integer)::text AS value
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND s.expires_at IS NOT NULL
    AND s.expires_at > now()

  UNION ALL

  -- Subscription: Simultaneous-Use
  SELECT
    s.id::text AS id,
    s.username AS username,
    'Simultaneous-Use' AS attribute,
    '=' AS op,
    COALESCE(rp.simultaneous_use, 1)::text AS value
  FROM public.subscriptions s
  LEFT JOIN public.radius_profiles rp
    ON rp.package_id = s.package_id AND rp.tenant_id = s.tenant_id
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Voucher: Mikrotik-Rate-Limit from package
  SELECT
    v.id::text AS id,
    v.code     AS username,
    'Mikrotik-Rate-Limit' AS attribute,
    '=' AS op,
    CASE
      WHEN pkg.speed_down_kbps >= 1024
        THEN ROUND(pkg.speed_down_kbps::numeric / 1024) || 'M/' ||
             ROUND(COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps)::numeric / 1024) || 'M'
      WHEN pkg.speed_down_kbps IS NOT NULL
        THEN pkg.speed_down_kbps || 'k/' ||
             COALESCE(pkg.speed_up_kbps, pkg.speed_down_kbps) || 'k'
      ELSE '10M/5M'
    END AS value
  FROM public.vouchers v
  JOIN public.packages pkg ON pkg.id = v.package_id
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now())

  UNION ALL

  -- Voucher: Session-Timeout (seconds until expiry)
  SELECT
    v.id::text AS id,
    v.code     AS username,
    'Session-Timeout' AS attribute,
    '=' AS op,
    GREATEST(0, EXTRACT(EPOCH FROM (v.expires_at - now()))::integer)::text AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND v.expires_at IS NOT NULL
    AND v.expires_at > now()

  UNION ALL

  -- Voucher: Simultaneous-Use (always 1 — vouchers are single-use)
  SELECT
    v.id::text AS id,
    v.code     AS username,
    'Simultaneous-Use' AS attribute,
    '=' AS op,
    '1' AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now());

GRANT SELECT ON public.radreply TO service_role;
GRANT SELECT ON public.radreply TO postgres;

-- ── 3. Fix radgroupcheck + radusergroup: use package_id as groupname ───────
-- Previously radgroupcheck used pkg.id but radusergroup used tenant_id.
-- FreeRADIUS group lookup: radusergroup.groupname must equal radgroupcheck.groupname.
-- Fix: both use pkg.id::text so per-package policies work correctly.
CREATE OR REPLACE VIEW public.radgroupcheck AS
  SELECT
    pkg.id::text   AS id,
    pkg.id::text   AS groupname,   -- matches radusergroup.groupname
    'Auth-Type'    AS attribute,
    ':='           AS op,
    'Local'        AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

GRANT SELECT ON public.radgroupcheck TO service_role;
GRANT SELECT ON public.radgroupcheck TO postgres;

CREATE OR REPLACE VIEW public.radgroupreply AS
  SELECT
    pkg.id::text   AS id,
    pkg.id::text   AS groupname,
    'Fall-Through' AS attribute,
    '='            AS op,
    'No'           AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

GRANT SELECT ON public.radgroupreply TO service_role;
GRANT SELECT ON public.radgroupreply TO postgres;

CREATE OR REPLACE VIEW public.radusergroup AS
  SELECT
    s.username     AS username,
    s.package_id::text AS groupname,  -- matches radgroupcheck.groupname
    1              AS priority
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

GRANT SELECT ON public.radusergroup TO service_role;
GRANT SELECT ON public.radusergroup TO postgres;

-- ── 4. Fix nas view: server column must be NULL or virtual server name ─────
-- 'INAP' was wrong — FreeRADIUS uses this column to route to a virtual server.
-- NULL means use the default virtual server (correct for single-server setups).
CREATE OR REPLACE VIEW public.nas AS
  SELECT
    nd.id::text                              AS id,
    COALESCE(nd.nas_ip, nd.nas_identifier)   AS nasname,
    nd.nas_identifier                        AS shortname,
    'other'                                  AS type,
    1812                                     AS ports,
    nd.shared_secret                         AS secret,
    NULL::text                               AS server,   -- NULL = default virtual server
    nd.name                                  AS community,
    nd.tenant_id::text                       AS description
  FROM public.nas_devices nd
  WHERE nd.is_active = true
    AND nd.shared_secret IS NOT NULL;

GRANT SELECT ON public.nas TO service_role;
GRANT SELECT ON public.nas TO postgres;

-- ── 5. Grant radacct + radpostauth write access to postgres user ───────────
GRANT INSERT, UPDATE, SELECT ON public.radacct TO postgres;
GRANT USAGE, SELECT ON SEQUENCE public.radacct_radacctid_seq TO postgres;
GRANT INSERT, SELECT ON public.radpostauth TO postgres;
GRANT USAGE, SELECT ON SEQUENCE public.radpostauth_id_seq TO postgres;

-- ── 6. Fix fn_sync_radacct: session conflict key must be acctuniqueid ──────
-- Previous key (username, tenant_id) caused UPDATE to wrong row when a user
-- reconnects — each session has a unique acctuniqueid from FreeRADIUS.
CREATE OR REPLACE FUNCTION public.fn_sync_radacct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_nas RECORD;
BEGIN
  -- Resolve subscription from username
  SELECT s.id, s.customer_id, s.tenant_id, s.package_id
    INTO v_sub
    FROM public.subscriptions s
   WHERE s.username = NEW.username
     AND s.status IN ('active', 'suspended')
   LIMIT 1;

  -- Resolve NAS from IP or identifier
  SELECT nd.id, nd.tenant_id
    INTO v_nas
    FROM public.nas_devices nd
   WHERE (nd.nas_ip = NEW.nasipaddress OR nd.nas_identifier = NEW.nasipaddress)
     AND nd.is_active = true
   LIMIT 1;

  -- Backfill linkage columns on radacct row
  NEW.tenant_id       := COALESCE(v_sub.tenant_id, v_nas.tenant_id);
  NEW.subscription_id := v_sub.id;
  NEW.nas_id          := v_nas.id;

  IF NEW.tenant_id IS NULL THEN
    RETURN NEW; -- unknown NAS — write radacct but skip sync
  END IF;

  -- Sync into radius_accounting
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
    COALESCE(NEW.acctinputoctets, 0),
    COALESCE(NEW.acctoutputoctets, 0),
    COALESCE(NEW.acctsessiontime, 0),
    NEW.acctterminatecause,
    NEW.servicetype,
    now()
  ) ON CONFLICT DO NOTHING;

  -- Sync into sessions — conflict on acctuniqueid (one row per RADIUS session)
  IF NEW.acctstarttime IS NOT NULL AND NEW.acctstoptime IS NULL THEN
    INSERT INTO public.sessions (
      tenant_id, customer_id, subscription_id, nas_session_id,
      username, ip_address, mac_address,
      bytes_in, bytes_out, started_at
    ) VALUES (
      NEW.tenant_id, v_sub.customer_id, v_sub.id, NEW.acctuniqueid,
      NEW.username, NEW.framedipaddress, NEW.callingstationid,
      COALESCE(NEW.acctinputoctets, 0),
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
      bytes_in         = COALESCE(NEW.acctinputoctets, 0),
      bytes_out        = COALESCE(NEW.acctoutputoctets, 0),
      duration_seconds = COALESCE(NEW.acctsessiontime, 0),
      ended_at         = NEW.acctstoptime,
      terminated_by    = COALESCE(NEW.acctterminatecause, 'User-Request'),
      updated_at       = now()
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

-- ── 7. Fix fn_sync_radpostauth: auto-mark voucher used on Access-Accept ────
-- Previously fn_mark_voucher_used was never called automatically.
-- Now the radpostauth trigger calls it directly on successful auth.
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

    -- Auto-mark voucher as used on first successful authentication
    IF NEW.reply = 'Access-Accept' THEN
      UPDATE public.vouchers SET
        status  = 'used',
        used_at = now()
      WHERE code = NEW.username
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

-- ── 8. Unique index on sessions.nas_session_id for conflict resolution ─────
-- Required by the corrected fn_sync_radacct ON CONFLICT (nas_session_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_nas_session_unique
  ON public.sessions(nas_session_id)
  WHERE nas_session_id IS NOT NULL;

-- ── 9. CoA trigger: fire on subscription status/package changes ────────────
-- When SmartLinkNet suspends, expires, or changes a subscriber's package,
-- this trigger queues a CoA or Disconnect job so FreeRADIUS can enforce it
-- on the active MikroTik session without any manual action.
--
-- Architecture:
--   subscriptions UPDATE → fn_trigger_coa_on_subscription()
--   → inserts into job_queue (type='coa_action')
--   → queue-worker edge function reads job, calls coa-send edge function
--   → coa-send calls CoA shim → radclient UDP CoA/Disconnect to MikroTik
CREATE OR REPLACE FUNCTION public.fn_trigger_coa_on_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action    TEXT;
  v_rate      TEXT;
  v_pkg_old   RECORD;
  v_pkg_new   RECORD;
BEGIN
  -- Only act when username is set (subscriber is provisioned)
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  v_action := NULL;

  -- Case 1: Subscription suspended or expired → Disconnect active session
  IF OLD.status = 'active'
    AND NEW.status IN ('suspended', 'expired', 'cancelled') THEN
    v_action := 'disconnect';

  -- Case 2: Subscription reactivated → CoA to restore bandwidth
  ELSIF OLD.status IN ('suspended', 'expired')
    AND NEW.status = 'active' THEN
    v_action := 'coa';

  -- Case 3: Package changed while active → CoA to update rate limit
  ELSIF NEW.status = 'active'
    AND OLD.package_id IS DISTINCT FROM NEW.package_id THEN
    v_action := 'coa';
  END IF;

  IF v_action IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve new rate limit for CoA (not needed for disconnect)
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

  -- Queue the CoA/Disconnect action for the queue-worker to process
  INSERT INTO public.job_queue (
    tenant_id,
    type,
    payload,
    status,
    run_at,
    queue_name
  ) VALUES (
    NEW.tenant_id,
    'coa_action',
    jsonb_build_object(
      'action',          v_action,
      'username',        NEW.username,
      'tenant_id',       NEW.tenant_id::text,
      'new_rate_limit',  v_rate,
      'reason',          CASE
                           WHEN v_action = 'disconnect' THEN 'subscription_' || NEW.status
                           WHEN OLD.package_id IS DISTINCT FROM NEW.package_id THEN 'package_change'
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

-- ── 10. Platform settings RLS policy: idempotent creation ─────────────────
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
