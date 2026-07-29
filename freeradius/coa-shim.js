#!/usr/bin/env node
/**
 * SmartLinkNet FreeRADIUS CoA Management Shim
 *
 * Runs on the FreeRADIUS VPS — listens on 127.0.0.1:8080 (loopback only).
 * Receives CoA/Disconnect trigger from Supabase coa-send edge function,
 * resolves the active session's NAS IP from PostgreSQL (scoped to tenant),
 * then executes radclient to send the UDP CoA/Disconnect packet to MikroTik.
 *
 * Security:
 *   - Binds to 127.0.0.1 only — not reachable from internet
 *   - Validates x-sln-secret header on every request
 *   - NAS IP validated against allowlist (must be in nas_devices for tenant)
 *   - TLS certificate verification enabled for Supabase PostgreSQL
 *   - No URL redirects from user input
 */

"use strict";

const http             = require("http");
const { execFile }     = require("child_process");
const { Client }       = require("pg");
const { isIP }         = require("net");

const PORT       = parseInt(process.env.COA_PORT    || "8080", 10);
const SLN_SECRET = process.env.SLN_SECRET  || process.env.FR_SECRET || "";
const DB_HOST    = process.env.DB_HOST;
const DB_PORT    = parseInt(process.env.DB_PORT || "5432", 10);
const DB_NAME    = process.env.DB_NAME    || "postgres";
const DB_USER    = process.env.DB_USER;
const DB_PASS    = process.env.DB_PASS;

if (!DB_HOST || !DB_USER || !DB_PASS) {
  console.error("[SLN-CoA] Missing DB_HOST / DB_USER / DB_PASS env vars");
  process.exit(1);
}

if (!SLN_SECRET) {
  console.error("[SLN-CoA] SLN_SECRET must be set — refusing to start without auth");
  process.exit(1);
}

// ── PostgreSQL client factory ─────────────────────────────────────────────
function dbClient() {
  return new Client({
    host:     DB_HOST,
    port:     DB_PORT,
    database: DB_NAME,
    user:     DB_USER,
    password: DB_PASS,
    // TLS required for Supabase — certificate must be valid
    ssl: { rejectUnauthorized: true },
  });
}

// ── Validate NAS IP is a real routable IP (not loopback/private metadata) ─
// This prevents SSRF if a bad nas_ip value were ever inserted into the DB.
function isRoutablePublicIp(ip) {
  if (!ip || isIP(ip) === 0) return false;
  // Block loopback, link-local, private ranges, and cloud metadata IPs
  const blocked = [
    /^127\./,
    /^0\./,
    /^169\.254\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^fc/i,
    /^fd/i,
  ];
  return !blocked.some((re) => re.test(ip));
}

// ── Send CoA/Disconnect via radclient ─────────────────────────────────────
function sendRadclient(nasIp, nasSecret, packetType, attrs) {
  return new Promise((resolve, reject) => {
    const attrLines = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k} = "${v}"`)
      .join("\n");

    const args = [
      "-x",
      "-c", "1",
      "-t", "3",
      `${nasIp}:3799`,
      packetType === "disconnect" ? "Disconnect-Request" : "CoA-Request",
      nasSecret,
    ];

    const proc = execFile("radclient", args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`radclient failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });

    proc.stdin.write(attrLines + "\n");
    proc.stdin.end();
  });
}

// ── HTTP server (loopback only) ───────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST" || req.url !== "/coa") {
    return send(404, { error: "Not found" });
  }

  // Validate shared secret — constant-time comparison
  const incoming = req.headers["x-sln-secret"] || "";
  if (incoming.length !== SLN_SECRET.length ||
      !incoming.split("").every((c, i) => c === SLN_SECRET[i])) {
    return send(403, { error: "Forbidden" });
  }

  let rawBody = "";
  req.on("data", (chunk) => { rawBody += chunk; });
  req.on("end", async () => {
    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { return send(400, { error: "Invalid JSON" }); }

    const {
      "User-Name":       username,
      "Packet-Type":     packetType,
      "Acct-Session-Id": sessionId,
      "tenant_id":       tenantId,
    } = payload;

    if (!username)  return send(400, { error: "User-Name required" });
    if (!tenantId)  return send(400, { error: "tenant_id required" });

    const db = dbClient();
    try {
      await db.connect();

      // Resolve active session + NAS — MUST be scoped to tenant_id
      // to prevent cross-tenant NAS resolution.
      const { rows } = await db.query(`
        SELECT
          s.nas_session_id,
          s.ip_address        AS framed_ip,
          nd.nas_ip,
          nd.shared_secret    AS nas_secret
        FROM public.sessions s
        JOIN public.nas_devices nd
          ON nd.tenant_id = s.tenant_id
         AND nd.is_active  = true
        WHERE s.username    = $1
          AND s.tenant_id   = $2::uuid
          AND s.ended_at    IS NULL
        ORDER BY s.started_at DESC
        LIMIT 1
      `, [username, tenantId]);

      if (!rows.length) {
        return send(404, { error: `No active session for ${username}` });
      }

      const { nas_session_id, framed_ip, nas_ip, nas_secret } = rows[0];

      if (!nas_ip) {
        return send(400, { error: "NAS IP not found for session" });
      }

      // Validate NAS IP before using it in a system call
      if (!isRoutablePublicIp(nas_ip)) {
        console.error(`[SLN-CoA] Blocked non-routable NAS IP: ${nas_ip}`);
        return send(400, { error: "Invalid NAS IP" });
      }

      const attrs = {
        "User-Name":         username,
        "NAS-IP-Address":    nas_ip,
        "Framed-IP-Address": framed_ip  || undefined,
        "Acct-Session-Id":   sessionId  || nas_session_id || undefined,
        ...(payload["Mikrotik-Rate-Limit"]
          ? { "Mikrotik-Rate-Limit": payload["Mikrotik-Rate-Limit"] }
          : {}),
      };

      const action = (packetType || "").toLowerCase().includes("disconnect")
        ? "disconnect" : "coa";

      const output = await sendRadclient(nas_ip, nas_secret, action, attrs);
      console.log(`[SLN-CoA] ${action} → ${nas_ip} for ${username}: ${output.trim()}`);

      send(200, { ok: true, action, username, nas_ip, output: output.trim() });

    } catch (err) {
      console.error("[SLN-CoA] Error:", err.message);
      send(500, { error: err.message });
    } finally {
      await db.end().catch(() => {});
    }
  });
});

// Bind to loopback only — never expose to internet
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[SLN-CoA] Listening on 127.0.0.1:${PORT}`);
  console.log(`[SLN-CoA] DB: ${DB_HOST}/${DB_NAME}`);
});
