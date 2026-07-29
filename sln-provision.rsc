# SmartLinkNet -- Auto-provisioning script
# Router: MikroTik1 | Tenant: SpeedNet
# Generated: 2026-07-29T08:55:19.615Z
# Services: hotspot, pppoe | Uplink: ether1

# 1. Identity
/system identity set name="MikroTik1"

# 2. Bridge
:do { /interface bridge add name=speednet-7f4u-bridge protocol-mode=rstp comment="SmartLinkNet" } on-error={}
:do { /interface bridge port remove [find interface=ether2] } on-error={}
:do { /interface bridge port add bridge=speednet-7f4u-bridge interface=ether2 comment="SmartLinkNet" } on-error={}

# 3. Gateway IP on bridge
:do { /ip address remove [find interface=speednet-7f4u-bridge] } on-error={}
:do { /ip address add address=172.31.0.1/16 interface=speednet-7f4u-bridge comment="SmartLinkNet gateway" } on-error={}

# 4. IP Pool
:do { /ip pool remove [find name=speednet-7f4u-pool] } on-error={}
/ip pool add name=speednet-7f4u-pool ranges=172.31.0.10-172.31.0.254

# 5. DHCP Server
:do { /ip dhcp-server remove [find name=speednet-7f4u-dhcp] } on-error={}
/ip dhcp-server add name=speednet-7f4u-dhcp interface=speednet-7f4u-bridge address-pool=speednet-7f4u-pool lease-time=1h disabled=no
:do { /ip dhcp-server network remove [find address=172.31.0.0/16] } on-error={}
/ip dhcp-server network add address=172.31.0.0/16 gateway=172.31.0.1 dns-server=8.8.8.8,8.8.4.4

# 6. NAT masquerade on uplink
:do { /ip firewall nat remove [find comment="SmartLinkNet NAT"] } on-error={}
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="SmartLinkNet NAT"

# 7. DNS
/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4

# 8. RADIUS
:do { /radius remove [find comment="SmartLinkNet"] } on-error={}
/radius add service=hotspot,ppp address=smart-link-kenya.vercel.app secret=SmartLinkNet-Public-Fallback authentication-port=1812 accounting-port=1813 timeout=3000ms comment="SmartLinkNet"
/radius incoming set accept=yes port=3799

# 9. Hotspot
:do { /ip hotspot disable [find name=speednet-7f4u-hotspot] } on-error={}
:do { /ip hotspot remove [find name=speednet-7f4u-hotspot] } on-error={}
:do { /ip hotspot profile remove [find name=speednet-7f4u-hs-profile] } on-error={}
/ip hotspot profile add name=speednet-7f4u-hs-profile login-by=http-pap html-directory=hotspot http-cookie-lifetime=1d use-radius=yes accounting=yes login-page="https://smart-link-kenya.vercel.app/portal?isp=speednet-7f4u&mac=\$(mac)&ip=\$(ip)&url=\$(link-orig)&dst=\$(dst-ip)"
/ip hotspot add name=speednet-7f4u-hotspot interface=speednet-7f4u-bridge address-pool=speednet-7f4u-pool profile=speednet-7f4u-hs-profile disabled=no

# Walled Garden
:do { /ip hotspot walled-garden remove [find comment~"SmartLinkNet"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment~"Supabase"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment~"M-Pesa"] } on-error={}
/ip hotspot walled-garden add dst-host=smart-link-kenya.vercel.app comment="SmartLinkNet portal"
/ip hotspot walled-garden add dst-host=*.supabase.co comment="Supabase"
/ip hotspot walled-garden add dst-host=*.safaricom.com comment="M-Pesa"
/ip hotspot walled-garden add dst-host=mpesa.safaricom.co.ke comment="M-Pesa STK"
:do { /ip hotspot walled-garden ip remove [find comment="HTTPS passthrough"] } on-error={}
/ip hotspot walled-garden ip add dst-address=0.0.0.0/0 protocol=tcp dst-port=443 comment="HTTPS passthrough"

# 10. PPPoE Server
:do { /interface pppoe-server server disable [find name=speednet-7f4u-pppoe] } on-error={}
:do { /interface pppoe-server server remove [find name=speednet-7f4u-pppoe] } on-error={}
:do { /ppp profile remove [find name=speednet-7f4u-pppoe] } on-error={}
/ppp profile add name=speednet-7f4u-pppoe use-radius=yes comment="SmartLinkNet"
/interface pppoe-server server add name=speednet-7f4u-pppoe interface=speednet-7f4u-bridge default-profile=speednet-7f4u-pppoe disabled=no

# 11. API user and port
/ip service set api port=8728 disabled=no
/ip service set api-ssl disabled=yes
:do { /user remove [find name="sln-api"] } on-error={}
/user add name="sln-api" password="768c5fecec9446e04f101ed84aed6d84" group=full comment="SmartLinkNet"

# 12. Poll scheduler -- NAT-safe pull model
:do { /system scheduler remove [find name=sln-poll] } on-error={}
/system scheduler add name=sln-poll interval=1m start-time=startup on-event=":do { /tool fetch mode=https url='https://tghaarhofriakwgvqmpm.supabase.co/functions/v1/router-poll?router_id=1b97dee1-56cc-41ea-b2be-633cc38ac43c&token=768c5fecec9446e04f101ed84aed6d84' http-method=post http-data='{}' dst-path=sln-poll.json keep-result=yes } on-error={}" comment="SmartLinkNet"

# 13. Heartbeat scheduler
:do { /system scheduler remove [find name=sln-heartbeat] } on-error={}
/system scheduler add name=sln-heartbeat interval=5m start-time=startup on-event=":do { /tool fetch mode=https url='https://smart-link-kenya.vercel.app/api/heartbeat?router=1b97dee1-56cc-41ea-b2be-633cc38ac43c' keep-result=no } on-error={}" comment="SmartLinkNet"

# 14. Report provisioning complete
:do { /tool fetch mode=https url="https://tghaarhofriakwgvqmpm.supabase.co/functions/v1/provision-callback?router_id=1b97dee1-56cc-41ea-b2be-633cc38ac43c&stage=complete" keep-result=no } on-error={}
:log info "SmartLinkNet: provisioning complete for MikroTik1"