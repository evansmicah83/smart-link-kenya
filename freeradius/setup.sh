#!/usr/bin/env bash
# ============================================================
# SmartLinkNet FreeRADIUS Setup Script
# Ubuntu 22.04 LTS — installs FreeRADIUS 3.x with PostgreSQL
#
# Usage:
#   export DB_HOST="db.tghaarhofriakwgvqmpm.supabase.co"
#   export DB_PORT="5432"
#   export DB_NAME="postgres"
#   export DB_USER="postgres"
#   export DB_PASS="your-supabase-db-password"
#   export FR_SECRET="your-shared-secret-for-mikrotik"
#   curl -fsSL https://your-domain/setup.sh | bash
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[SLN]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Validate required env vars ────────────────────────────────────────────
: "${DB_HOST:?Set DB_HOST to your Supabase DB host}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=postgres}"
: "${DB_USER:=postgres}"
: "${DB_PASS:?Set DB_PASS to your Supabase DB password}"
: "${FR_SECRET:?Set FR_SECRET to the shared secret for MikroTik NAS clients}"

FREERADIUS_VER="3.0"
FR_CONF="/etc/freeradius/${FREERADIUS_VER}"

info "=== SmartLinkNet FreeRADIUS Setup ==="
info "DB Host : $DB_HOST"
info "DB Name : $DB_NAME"
info "FR Conf : $FR_CONF"

# ── 1. System update + install ────────────────────────────────────────────
info "Installing FreeRADIUS + PostgreSQL client..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  freeradius \
  freeradius-postgresql \
  freeradius-utils \
  postgresql-client \
  libpq-dev \
  ufw \
  curl \
  jq

# ── 2. Firewall ───────────────────────────────────────────────────────────
info "Configuring firewall..."
ufw --force enable
ufw allow ssh
ufw allow 1812/udp comment "RADIUS Auth"
ufw allow 1813/udp comment "RADIUS Accounting"
ufw allow 3799/udp comment "RADIUS CoA/Disconnect"
ufw reload

# ── 3. Enable SQL module ──────────────────────────────────────────────────
info "Enabling FreeRADIUS SQL module..."
cd "$FR_CONF/mods-enabled"
ln -sf ../mods-available/sql sql 2>/dev/null || true

# ── 4. Write SQL module config ────────────────────────────────────────────
info "Writing SQL module config..."
cat > "$FR_CONF/mods-available/sql" <<SQLCONF
sql {
  driver        = "rlm_sql_postgresql"
  dialect       = "postgresql"
  server        = "${DB_HOST}"
  port          = ${DB_PORT}
  login         = "${DB_USER}"
  password      = "${DB_PASS}"
  radius_db     = "${DB_NAME}"

  postgresql {
    send_application_name = yes
    tls {
      mode = "require"
    }
  }

  acct_table1      = "radacct"
  acct_table2      = "radacct"
  postauth_table   = "radpostauth"
  authcheck_table  = "radcheck"
  groupcheck_table = "radgroupcheck"
  authreply_table  = "radreply"
  groupreply_table = "radgroupreply"
  usergroup_table  = "radusergroup"
  nas_table        = "nas"

  read_clients = yes
  client_table = "nas"

  client {
    identifier     = "nasname"
    shortname      = "shortname"
    secret         = "secret"
    server         = "server"
    type           = "type"
    virtual_server = "server"
  }

  pool {
    start        = 5
    min          = 3
    max          = 32
    spare        = 3
    uses         = 0
    retry_delay  = 30
    lifetime     = 1800
    idle_timeout = 60
  }

  accounting {
    reference = "%{tolower:type.%{Acct-Status-Type}.query}"

    type {
      accounting-on {
        query = "UPDATE radacct SET acctstoptime = NOW(), acctsessiontime = EXTRACT(EPOCH FROM (NOW() - acctstarttime))::integer, acctterminatecause = 'NAS-Reboot' WHERE nasipaddress = '%{NAS-IP-Address}' AND acctstoptime IS NULL"
      }
      accounting-off {
        query = "UPDATE radacct SET acctstoptime = NOW(), acctsessiontime = EXTRACT(EPOCH FROM (NOW() - acctstarttime))::integer, acctterminatecause = 'NAS-Reboot' WHERE nasipaddress = '%{NAS-IP-Address}' AND acctstoptime IS NULL"
      }
      start {
        query = "INSERT INTO radacct (acctsessionid, acctuniqueid, username, realm, nasipaddress, nasportid, nasporttype, acctstarttime, acctupdatetime, acctauthentic, calledstationid, callingstationid, servicetype, framedprotocol, framedipaddress, acctinputoctets, acctoutputoctets, acctinterval) VALUES ('%{Acct-Session-Id}', '%{Acct-Unique-Session-Id}', '%{SQL-User-Name}', '%{Realm}', '%{NAS-IP-Address}', '%{NAS-Port-Id}', '%{NAS-Port-Type}', TO_TIMESTAMP(%{integer:Event-Timestamp}), NOW(), '%{Acct-Authentic}', '%{Called-Station-Id}', '%{Calling-Station-Id}', '%{Service-Type}', '%{Framed-Protocol}', '%{Framed-IP-Address}', 0, 0, %{%{Acct-Interim-Interval}:-0}) ON CONFLICT (acctuniqueid) DO UPDATE SET acctstarttime = TO_TIMESTAMP(%{integer:Event-Timestamp}), acctupdatetime = NOW()"
      }
      interim-update {
        query = "UPDATE radacct SET acctupdatetime = NOW(), acctinputoctets = %{Acct-Input-Octets}, acctoutputoctets = %{Acct-Output-Octets}, acctsessiontime = %{Acct-Session-Time}, framedipaddress = '%{Framed-IP-Address}' WHERE acctuniqueid = '%{Acct-Unique-Session-Id}' AND acctstoptime IS NULL"
      }
      stop {
        query = "UPDATE radacct SET acctstoptime = TO_TIMESTAMP(%{integer:Event-Timestamp}), acctupdatetime = NOW(), acctsessiontime = %{Acct-Session-Time}, acctinputoctets = %{Acct-Input-Octets}, acctoutputoctets = %{Acct-Output-Octets}, acctterminatecause = '%{Acct-Terminate-Cause}', framedipaddress = '%{Framed-IP-Address}' WHERE acctuniqueid = '%{Acct-Unique-Session-Id}'"
      }
    }
  }

  post-auth {
    reference = "queries.post-auth"
    query = "INSERT INTO radpostauth (username, pass, reply, nasipaddress, nasportid, authdate, class) VALUES ('%{SQL-User-Name}', '%{%{User-Password}:-Chap-Password}', '%{reply:Packet-Type}', '%{NAS-IP-Address}', '%{NAS-Port-Id}', NOW(), '%{Class}')"
  }
}
SQLCONF

# ── 5. Write default virtual server ──────────────────────────────────────
info "Writing virtual server config..."
cat > "$FR_CONF/sites-available/default" <<'SITECONF'
server default {
  listen { type = auth; ipaddr = *; port = 1812 }
  listen { type = acct; ipaddr = *; port = 1813 }
  listen { type = coa;  ipaddr = *; port = 3799 }

  authorize {
    filter_username
    preprocess
    sql
    if (!control:Auth-Type) {
      if (&User-Password) { update control { Auth-Type := "PAP" } }
    }
    expiration
    logintime
    pap
  }

  authenticate {
    Auth-Type PAP  { pap   }
    Auth-Type CHAP { chap  }
    Auth-Type MS-CHAP { mschap }
  }

  preacct  { preprocess; acct_unique; suffix; files }
  accounting { detail; sql; attr_filter.accounting_response }
  session  { sql }

  post-auth {
    sql
    Post-Auth-Type REJECT { sql; attr_filter.access_reject }
  }

  recv-coa { sql }
  send-coa { sql }
}
SITECONF

ln -sf ../sites-available/default "$FR_CONF/sites-enabled/default" 2>/dev/null || true

# Disable inner-tunnel and other unused sites
for site in inner-tunnel control-socket; do
  rm -f "$FR_CONF/sites-enabled/$site"
done

# ── 6. Install MikroTik dictionary ────────────────────────────────────────
info "Installing MikroTik VSA dictionary..."
cat >> "$FR_CONF/dictionary" <<'DICT'
$INCLUDE dictionary.mikrotik
DICT

cat > "$FR_CONF/dictionary.mikrotik" <<'MIKROTIK'
VENDOR          MikroTik        14988
BEGIN-VENDOR    MikroTik
ATTRIBUTE       Mikrotik-Recv-Limit             1   integer
ATTRIBUTE       Mikrotik-Xmit-Limit             2   integer
ATTRIBUTE       Mikrotik-Group                  3   string
ATTRIBUTE       Mikrotik-Rate-Limit             8   string
ATTRIBUTE       Mikrotik-Realm                  9   string
ATTRIBUTE       Mikrotik-Host-IP               10   ipaddr
ATTRIBUTE       Mikrotik-Mark-Id               11   string
ATTRIBUTE       Mikrotik-Address-List          19   string
ATTRIBUTE       Mikrotik-Total-Limit           17   integer
ATTRIBUTE       Mikrotik-Total-Limit-Gigawords 18   integer
END-VENDOR      MikroTik
MIKROTIK

# ── 7. Disable unused modules ─────────────────────────────────────────────
info "Disabling unused modules..."
for mod in ldap krb5 eap perl python; do
  rm -f "$FR_CONF/mods-enabled/$mod"
done

# ── 8. Set permissions ────────────────────────────────────────────────────
chown -R freerad:freerad "$FR_CONF"
chmod 640 "$FR_CONF/mods-available/sql"

# ── 9. Test config ────────────────────────────────────────────────────────
info "Testing FreeRADIUS configuration..."
freeradius -C -d "$FR_CONF" && info "Config test PASSED" || error "Config test FAILED — check $FR_CONF"

# ── 10. Enable + start service ────────────────────────────────────────────
info "Starting FreeRADIUS service..."
systemctl enable freeradius
systemctl restart freeradius
sleep 2
systemctl is-active freeradius && info "FreeRADIUS is running" || error "FreeRADIUS failed to start"

# ── 11. Install Node.js + CoA shim ──────────────────────────────────────
info "Installing Node.js + CoA management shim..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
apt-get install -y -qq nodejs

mkdir -p /opt/smartlinknet

# Copy coa-shim.js if present alongside setup.sh, else download placeholder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/coa-shim.js" ]; then
  cp "$SCRIPT_DIR/coa-shim.js" /opt/smartlinknet/coa-shim.js
else
  warn "coa-shim.js not found next to setup.sh — copy it manually to /opt/smartlinknet/coa-shim.js"
fi

cd /opt/smartlinknet && npm install pg --save-quiet 2>/dev/null

cat > /etc/systemd/system/smartlinknet-coa.service <<COASVC
[Unit]
Description=SmartLinkNet FreeRADIUS CoA Shim
After=network.target freeradius.service

[Service]
Type=simple
User=freerad
WorkingDirectory=/opt/smartlinknet
ExecStart=/usr/bin/node /opt/smartlinknet/coa-shim.js
Restart=always
RestartSec=5
Environment=DB_HOST=${DB_HOST}
Environment=DB_PORT=${DB_PORT}
Environment=DB_NAME=${DB_NAME}
Environment=DB_USER=${DB_USER}
Environment=DB_PASS=${DB_PASS}
Environment=SLN_SECRET=${FR_SECRET}
Environment=COA_PORT=8080

[Install]
WantedBy=multi-user.target
COASVC

systemctl daemon-reload
systemctl enable smartlinknet-coa
systemctl start smartlinknet-coa
sleep 2
systemctl is-active smartlinknet-coa \
  && info "CoA shim running on 127.0.0.1:8080" \
  || warn "CoA shim failed — check: journalctl -u smartlinknet-coa"

# ── 12. Get public IP and print summary ──────────────────────────────────
PUBLIC_IP=$(curl -s https://api.ipify.org || echo "unknown")

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  SmartLinkNet FreeRADIUS — Setup Complete${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Public IP   : $PUBLIC_IP"
echo "  Auth port   : UDP 1812"
echo "  Acct port   : UDP 1813"
echo "  CoA port    : UDP 3799"
echo "  DB host     : $DB_HOST"
echo ""
echo -e "${YELLOW}  Next steps:${NC}"
echo "  1. In SmartLinkNet → Settings → RADIUS Servers:"
echo "     Set freeradius_ip = $PUBLIC_IP"
echo ""
echo "  2. Add each MikroTik router's public IP to nas_devices table"
echo "     with the shared secret you configured."
echo ""
echo "  3. Reprovision any existing routers so they point to $PUBLIC_IP"
echo "     instead of the old Supabase IP."
echo ""
echo "  4. Test auth:  radtest <username> <password> $PUBLIC_IP 1812 <secret>"
echo ""
echo -e "${GREEN}  FreeRADIUS is live and reading from Supabase PostgreSQL.${NC}"
echo ""
