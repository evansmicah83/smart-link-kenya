#!/usr/bin/env node
/**
 * SmartLinkNet FreeRADIUS CoA Management Shim
 * Runs on the FreeRADIUS VPS — listens on HTTP port 8080.
 * Receives CoA/Disconnect trigger from Supabase coa-send edge function,
 * resolves the active session's NAS IP from PostgreSQL,
 * then executes radclient to send the UDP CoA/Disconnect packet to MikroTik.
 *
 * Install: node coa-shim.js
 * Systemd: see setup.sh — installed as smartlinknet-coa.service
 */

const http   = require("http");
const { execFile } = require("child_process");
const { Client }   = require("pg");

const PORT       = process.env.COA_PORT    || 8080;
const SLN_SECRET = process.env.SLN_SECRET  || process.env.FR_SECRET || "";
const DB_HOST    = process.env.DB_HOST;
const DB_PORT    = process.env.DB_PORT     || 5432;
const DB_NAME    = process.env.DB_NAME     || "postgres";
const DB_USER    = process.env.DB_USER;
const DB_PASS    = process.env.DB_PASS;

if (!DB_HOST || !DB_USER || !DB_PASS) {
  console.error("[SLN-CoA] Missing DB_HOST / DB_USER / DB_PASS env vars");
  process.exit(1);
}

// ── PostgreSQL client ─────────────────────────────────────────────────────
function dbClient() {
  return new Client({
    host:     DB_HOST,
    port:     Number(DB_PORT),
    database: DB_NAME,
    user:     DB_USER,
    password: DB_PASS,
    ssl:      { rejectUnauthorized: false },
  });
}

// ── Send CoA/Disconnect via radclient ─────────────────────────────────────
function sendRadclient(nasIp, nasSecret, packetType, attrs) {
  return new Promise((resolve, reject) => {
    // Build attribute string for radclient stdin
    // Format: "Attribute-Name = Value\n"
    const attrLines = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k} = "${v}"`)
      .join("\n");

    const args = [
      "-x",                          // debug output
      "-c", "1",                     // send once
      "-t", "3",                     // timeout 3s
      `${nasIp}:3799`,               // NAS CoA port
      packetType === "disconnect"
        ? "Disconnect-Request"
        : "CoA-Request",
      nasSecret,
    ];

    const proc = execFile("radclient", args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`radclient failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });

    // Write attributes to stdin
    proc.stdin.write(attrLines + "\n");
    proc.stdin.end();
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST" || req.url !== "/coa") {
    return send(404, { error: "Not found" });
  }

  // Verify shared secret
  const secret = req.headers["x-sln-secret"] || "";
  if (SLN_SECRET && secret !== SLN_SECRET) {
    return send(403, { error: "Forbidden" });
  }

  // Parse body
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", async () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch { return send(400, { error: "Invalid JSON" }); }

    const { "User-Name": username, "Acct-Session-Id": sessionId, "Packet-Type": packetType } = payload;
    if (!username) return send(400, { error: "User-Name required" });

    const db = dbClient();
    try {
      await db.connect();

      // Resolve active session + NAS IP from DB
      const { rows } = await db.query(`
        SELECT
          s.nas_session_id,
          s.ip_address        AS framed_ip,
          nd.nas_ip,
          nd.shared_secret    AS nas_secret
        FROM public.sessions s
        LEFT JOIN public.nas_devices nd
          ON nd.tenant_id = s.tenant_id AND nd.is_active = true
        WHERE s.username = $1
          AND s.ended_at IS NULL
        ORDER BY s.started_at DESC
        LIMIT 1
      `, [username]);

      if (!rows.length) {
        return send(404, { error: "No active session found for " + username });
      }

      const { nas_session_id, framed_ip, nas_ip, nas_secret } = rows[0];
      if (!nas_ip) return send(400, { error: "NAS IP not found for session" });

      // Build RADIUS attributes
      const attrs = {
        "User-Name":        username,
        "NAS-IP-Address":   nas_ip,
        "Framed-IP-Address": framed_ip || undefined,
        "Acct-Session-Id":  sessionId || nas_session_id || undefined,
        ...payload["Mikrotik-Rate-Limit"]
          ? { "Mikrotik-Rate-Limit": payload["Mikrotik-Rate-Limit"] }
          : {},
      };

      const action = (packetType || "").toLowerCase().includes("disconnect")
        ? "disconnect" : "coa";

      const output = await sendRadclient(nas_ip, nas_secret, action, attrs);
      console.log(`[SLN-CoA] ${action} sent to ${nas_ip} for ${username}: ${output.trim()}`);

      send(200, { ok: true, action, username, nas_ip, output: output.trim() });

    } catch (err) {
      console.error("[SLN-CoA] Error:", err.message);
      send(500, { error: err.message });
    } finally {
      await db.end().catch(() => {});
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[SLN-CoA] CoA shim listening on 127.0.0.1:${PORT}`);
  console.log(`[SLN-CoA] DB: ${DB_HOST}/${DB_NAME}`);
});
