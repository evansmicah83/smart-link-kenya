-- ============================================================
-- SmartLinkNet: FreeRADIUS SQL Backend Views
--
-- FreeRADIUS rlm_sql reads these views directly from PostgreSQL.
-- SmartLinkNet writes to the underlying tables (subscriptions,
-- packages, radius_profiles, vouchers, nas_devices).
-- FreeRADIUS authenticates users locally — zero HTTP per request.
-- ============================================================

-- ── 1. radcheck — per-user authentication credentials ────────────────────
-- FreeRADIUS checks this view to validate the subscriber's password.
-- Supports both PPPoE (Cleartext-Password) and Hotspot (User-Password).
CREATE OR REPLACE VIEW public.radcheck AS
  SELECT
    s.id::text                    AS id,
    s.username                    AS username,
    'Cleartext-Password'          AS attribute,
    ':='                          AS op,
    s.password                    AS value
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND s.password IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Voucher authentication: voucher code is the username AND password
  SELECT
    v.id::text                    AS id,
    v.code                        AS username,
    'Cleartext-Password'          AS attribute,
    ':='                          AS op,
    v.code                        AS value
  FROM public.vouchers v
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now());

GRANT SELECT ON public.radcheck TO service_role;

-- ── 2. radreply — per-user reply attributes (bandwidth, pool, timeout) ───
-- FreeRADIUS sends these attributes back to MikroTik in Access-Accept.
-- Mikrotik-Rate-Limit enforces per-subscriber bandwidth.
CREATE OR REPLACE VIEW public.radreply AS
  SELECT
    s.id::text                                        AS id,
    s.username                                        AS username,
    'Mikrotik-Rate-Limit'                             AS attribute,
    '='                                               AS op,
    CASE
      WHEN rp.rate_limit IS NOT NULL THEN rp.rate_limit
      WHEN pkg.speed_down_kbps IS NOT NULL THEN
        CASE
          WHEN pkg.speed_down_kbps >= 1024
            THEN ROUND(pkg.speed_down_kbps::numeric/1024)||'M/'||
                 ROUND(COALESCE(pkg.speed_up_kbps,pkg.speed_down_kbps)::numeric/1024)||'M'
          ELSE pkg.speed_down_kbps||'k/'||COALESCE(pkg.speed_up_kbps,pkg.speed_down_kbps)||'k'
        END
      ELSE '10M/5M'
    END                                               AS value
  FROM public.subscriptions s
  JOIN public.packages pkg ON pkg.id = s.package_id
  LEFT JOIN public.radius_profiles rp
    ON rp.package_id = s.package_id AND rp.tenant_id = s.tenant_id
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Session-Timeout: expire session when subscription expires
  SELECT
    s.id::text                                        AS id,
    s.username                                        AS username,
    'Session-Timeout'                                 AS attribute,
    '='                                               AS op,
    GREATEST(0, EXTRACT(EPOCH FROM (s.expires_at - now()))::integer)::text AS value
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND s.expires_at IS NOT NULL
    AND s.expires_at > now()

  UNION ALL

  -- Simultaneous-Use: prevent session sharing (from radius_profiles)
  SELECT
    s.id::text                                        AS id,
    s.username                                        AS username,
    'Simultaneous-Use'                                AS attribute,
    '='                                               AS op,
    COALESCE(rp.simultaneous_use, 1)::text            AS value
  FROM public.subscriptions s
  LEFT JOIN public.radius_profiles rp
    ON rp.package_id = s.package_id AND rp.tenant_id = s.tenant_id
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())

  UNION ALL

  -- Voucher reply: rate limit from package
  SELECT
    v.id::text                                        AS id,
    v.code                                            AS username,
    'Mikrotik-Rate-Limit'                             AS attribute,
    '='                                               AS op,
    CASE
      WHEN pkg.speed_down_kbps >= 1024
        THEN ROUND(pkg.speed_down_kbps::numeric/1024)||'M/'||
             ROUND(COALESCE(pkg.speed_up_kbps,pkg.speed_down_kbps)::numeric/1024)||'M'
      ELSE pkg.speed_down_kbps||'k/'||COALESCE(pkg.speed_up_kbps,pkg.speed_down_kbps)||'k'
    END                                               AS value
  FROM public.vouchers v
  JOIN public.packages pkg ON pkg.id = v.package_id
  WHERE v.status = 'unused'
    AND (v.expires_at IS NULL OR v.expires_at > now());

GRANT SELECT ON public.radreply TO service_role;

-- ── 3. radgroupcheck / radgroupreply — group-level policies ──────────────
-- Maps tenant packages to RADIUS groups for shared policy enforcement.
CREATE OR REPLACE VIEW public.radgroupcheck AS
  SELECT
    pkg.id::text                  AS id,
    pkg.tenant_id::text           AS groupname,
    'Auth-Type'                   AS attribute,
    ':='                          AS op,
    'Local'                       AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

GRANT SELECT ON public.radgroupcheck TO service_role;

CREATE OR REPLACE VIEW public.radgroupreply AS
  SELECT
    pkg.id::text                  AS id,
    pkg.tenant_id::text           AS groupname,
    'Fall-Through'                AS attribute,
    '='                           AS op,
    'No'                          AS value
  FROM public.packages pkg
  WHERE pkg.is_active = true;

GRANT SELECT ON public.radgroupreply TO service_role;

-- ── 4. radusergroup — maps users to groups ───────────────────────────────
CREATE OR REPLACE VIEW public.radusergroup AS
  SELECT
    s.username                    AS username,
    s.tenant_id::text             AS groupname,
    1                             AS priority
  FROM public.subscriptions s
  WHERE s.status = 'active'
    AND s.username IS NOT NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());

GRANT SELECT ON public.radusergroup TO service_role;

-- ── 5. nas — NAS device registry FreeRADIUS reads for client validation ──
-- FreeRADIUS reads this to validate that the RADIUS client (MikroTik) is
-- a registered NAS device with the correct shared secret.
CREATE OR REPLACE VIEW public.nas AS
  SELECT
    nd.id::text                   AS id,
    COALESCE(nd.nas_ip, nd.nas_identifier) AS nasname,
    nd.nas_identifier             AS shortname,
    'other'                       AS type,
    1812                          AS ports,
    nd.shared_secret              AS secret,
    'INAP'                        AS server,
    nd.name                       AS community,
    nd.tenant_id::text            AS description
  FROM public.nas_devices nd
  WHERE nd.is_active = true
    AND nd.shared_secret IS NOT NULL;

GRANT SELECT ON public.nas TO service_role;

-- ── 6. radacct — accounting table FreeRADIUS writes to ───────────────────
-- FreeRADIUS rlm_sql writes accounting records here directly.
-- SmartLinkNet reads this table for session tracking and billing.
CREATE TABLE IF NOT EXISTS public.radacct (
  radacctid          BIGSERIAL PRIMARY KEY,
  acctsessionid      TEXT        NOT NULL,
  acctuniqueid       TEXT        NOT NULL UNIQUE,
  username           TEXT        NOT NULL,
  realm              TEXT        DEFAULT '',
  nasipaddress       TEXT        NOT NULL,
  nasportid          TEXT,
  nasporttype        TEXT,
  acctstarttime      TIMESTAMPTZ,
  acctupdatetime     TIMESTAMPTZ,
  acctstoptime       TIMESTAMPTZ,
  acctinterval       INTEGER,
  acctsessiontime    INTEGER     DEFAULT 0,
  acctauthentic      TEXT,
  connectinfo_start  TEXT,
  connectinfo_stop   TEXT,
  acctinputoctets    BIGINT      DEFAULT 0,
  acctoutputoctets   BIGINT      DEFAULT 0,
  calledstationid    TEXT,
  callingstationid   TEXT,
  acctterminatecause TEXT,
  servicetype        TEXT,
  framedprotocol     TEXT,
  framedipaddress    TEXT,
  framedipv6address  TEXT,
  framedipv6prefix   TEXT,
  framedinterfaceid  TEXT,
  delegatedipv6prefix TEXT,
  class              TEXT,
  -- SmartLinkNet tenant linkage (populated by trigger)
  tenant_id          UUID,
  subscription_id    UUID,
  nas_id             UUID
);

CREATE INDEX IF NOT EXISTS idx_radacct_username    ON public.radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_session     ON public.radacct(acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_nasip       ON public.radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_start       ON public.radacct(acctstarttime DESC);
CREATE INDEX IF NOT EXISTS idx_radacct_stop        ON public.radacct(acctstoptime)   WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS idx_radacct_tenant      ON public.radacct(tenant_id)      WHERE tenant_id IS NOT NULL;

GRANT INSERT, UPDATE, SELECT ON public.radacct TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radacct_radacctid_seq TO service_role;

-- ── 7. radpostauth — post-auth log FreeRADIUS writes ─────────────────────
CREATE TABLE IF NOT EXISTS public.radpostauth (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT        NOT NULL,
  pass       TEXT,
  reply      TEXT,
  nasipaddress TEXT,
  nasportid  TEXT,
  authdate   TIMESTAMPTZ NOT NULL DEFAULT now(),
  class      TEXT,
  -- SmartLinkNet linkage
  tenant_id  UUID,
  nas_id     UUID
);

CREATE INDEX IF NOT EXISTS idx_radpostauth_username ON public.radpostauth(username);
CREATE INDEX IF NOT EXISTS idx_radpostauth_date     ON public.radpostauth(authdate DESC);

GRANT INSERT, SELECT ON public.radpostauth TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.radpostauth_id_seq TO service_role;

-- ── 8. Trigger: sync radacct → sessions + radius_accounting ──────────────
-- When FreeRADIUS writes to radacct, this trigger syncs the data into
-- SmartLinkNet's sessions and radius_accounting tables automatically.
CREATE OR REPLACE FUNCTION public.fn_sync_radacct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub    RECORD;
  v_nas    RECORD;
BEGIN
  -- Resolve subscription and NAS from username + NAS IP
  SELECT s.id, s.customer_id, s.tenant_id, s.package_id
    INTO v_sub
    FROM public.subscriptions s
   WHERE s.username = NEW.username
     AND s.status = 'active'
   LIMIT 1;

  SELECT nd.id, nd.tenant_id
    INTO v_nas
    FROM public.nas_devices nd
   WHERE nd.nas_ip = NEW.nasipaddress OR nd.nas_identifier = NEW.nasipaddress
   LIMIT 1;

  -- Backfill tenant/subscription/nas on the radacct row itself
  NEW.tenant_id       := COALESCE(v_sub.tenant_id, v_nas.tenant_id);
  NEW.subscription_id := v_sub.id;
  NEW.nas_id          := v_nas.id;

  IF NEW.tenant_id IS NULL THEN
    RETURN NEW; -- unknown NAS, still write but skip sync
  END IF;

  -- Sync into radius_accounting (SmartLinkNet's accounting table)
  INSERT INTO public.radius_accounting (
    tenant_id, nas_id, session_id, nas_identifier, username,
    framed_ip, calling_station, called_station,
    acct_status_type, acct_input_octets, acct_output_octets,
    acct_session_time, acct_terminate_cause,
    service_type, received_at
  ) VALUES (
    NEW.tenant_id, NEW.nas_id, NEW.acctsessionid, NEW.nasipaddress, NEW.username,
    NEW.framedipaddress, NEW.callingstationid, NEW.calledstationid,
    CASE
      WHEN NEW.acctstoptime IS NOT NULL THEN 'Stop'
      WHEN NEW.acctstarttime IS NOT NULL AND NEW.acctupdatetime = NEW.acctstarttime THEN 'Start'
      ELSE 'Interim-Update'
    END,
    COALESCE(NEW.acctinputoctets, 0),
    COALESCE(NEW.acctoutputoctets, 0),
    COALESCE(NEW.acctsessiontime, 0),
    NEW.acctterminatecause,
    NEW.servicetype,
    now()
  ) ON CONFLICT DO NOTHING;

  -- Sync into sessions table
  IF NEW.acctstarttime IS NOT NULL AND NEW.acctstoptime IS NULL THEN
    -- Session start or interim
    INSERT INTO public.sessions (
      tenant_id, customer_id, subscription_id, nas_session_id,
      username, ip_address, mac_address,
      bytes_in, bytes_out, started_at
    ) VALUES (
      NEW.tenant_id, v_sub.customer_id, v_sub.id, NEW.acctsessionid,
      NEW.username, NEW.framedipaddress, NEW.callingstationid,
      COALESCE(NEW.acctinputoctets, 0), COALESCE(NEW.acctoutputoctets, 0),
      NEW.acctstarttime
    ) ON CONFLICT (username, tenant_id) DO UPDATE SET
      bytes_in   = EXCLUDED.bytes_in,
      bytes_out  = EXCLUDED.bytes_out,
      updated_at = now();

  ELSIF NEW.acctstoptime IS NOT NULL THEN
    -- Session stop
    UPDATE public.sessions SET
      bytes_in         = COALESCE(NEW.acctinputoctets, 0),
      bytes_out        = COALESCE(NEW.acctoutputoctets, 0),
      duration_seconds = COALESCE(NEW.acctsessiontime, 0),
      ended_at         = NEW.acctstoptime,
      terminated_by    = COALESCE(NEW.acctterminatecause, 'User-Request')
    WHERE username = NEW.username
      AND tenant_id = NEW.tenant_id
      AND ended_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_radacct_sync ON public.radacct;
CREATE TRIGGER trg_radacct_sync
  BEFORE INSERT OR UPDATE ON public.radacct
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_radacct();

-- ── 9. Trigger: sync radpostauth → auth_events ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_radpostauth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nas RECORD;
BEGIN
  SELECT nd.id, nd.tenant_id INTO v_nas
    FROM public.nas_devices nd
   WHERE nd.nas_ip = NEW.nasipaddress OR nd.nas_identifier = NEW.nasipaddress
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_radpostauth_sync ON public.radpostauth;
CREATE TRIGGER trg_radpostauth_sync
  BEFORE INSERT ON public.radpostauth
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_radpostauth();

-- ── 10. nas_session_id column on sessions (needed for CoA) ───────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS nas_session_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_nas_session ON public.sessions(nas_session_id) WHERE nas_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_username    ON public.sessions(username, tenant_id) WHERE ended_at IS NULL;

-- ── 11. radius_servers: add freeradius_ip column ─────────────────────────
-- Stores the actual FreeRADIUS VPS public IP — what MikroTik points to.
ALTER TABLE public.radius_servers
  ADD COLUMN IF NOT EXISTS freeradius_ip   TEXT,
  ADD COLUMN IF NOT EXISTS freeradius_ip2  TEXT,  -- secondary/failover
  ADD COLUMN IF NOT EXISTS coa_secret      TEXT,
  ADD COLUMN IF NOT EXISTS interim_interval INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS db_host         TEXT,
  ADD COLUMN IF NOT EXISTS db_port         INTEGER DEFAULT 5432,
  ADD COLUMN IF NOT EXISTS db_name         TEXT,
  ADD COLUMN IF NOT EXISTS db_user         TEXT,
  ADD COLUMN IF NOT EXISTS db_password     TEXT;

-- ── 12. Function: mark voucher used after successful auth ─────────────────
CREATE OR REPLACE FUNCTION public.fn_mark_voucher_used(_username TEXT, _ip TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vouchers SET
    status  = 'used',
    used_at = now()
  WHERE code = _username AND status = 'unused';
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_mark_voucher_used(TEXT, TEXT) TO service_role;

-- ── 13. Function: get active session for CoA ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_active_session(_username TEXT, _tenant_id UUID)
RETURNS TABLE(
  nas_session_id TEXT,
  nas_ip         TEXT,
  framed_ip      TEXT,
  nas_id         UUID
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.nas_session_id,
    nd.nas_ip,
    s.ip_address,
    s.tenant_id::uuid  -- reuse field as nas_id placeholder
  FROM public.sessions s
  LEFT JOIN public.nas_devices nd ON nd.id = (
    SELECT nd2.id FROM public.nas_devices nd2
    WHERE nd2.tenant_id = _tenant_id AND nd2.is_active = true
    LIMIT 1
  )
  WHERE s.username = _username
    AND s.tenant_id = _tenant_id
    AND s.ended_at IS NULL
  ORDER BY s.started_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_get_active_session(TEXT, UUID) TO service_role;
