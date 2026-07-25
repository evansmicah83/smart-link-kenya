-- AAA missing tables: radius_servers, radius_clients, radius_health_checks,
-- nas_devices, auth_events, radius_accounting

-- radius_servers
create table if not exists public.radius_servers (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  name                 text not null,
  host                 text not null,
  auth_port            integer not null default 1812,
  acct_port            integer not null default 1813,
  coa_port             integer not null default 3799,
  shared_secret        text not null,
  protocol             text not null default 'mschapv2',
  role                 text not null default 'primary',
  is_primary           boolean not null default true,
  is_active            boolean not null default true,
  timeout_ms           integer not null default 3000,
  retry_count          integer not null default 3,
  priority             integer not null default 1,
  failover_strategy    text not null default 'priority',
  is_healthy           boolean,
  last_checked         timestamptz,
  latency_ms           integer,
  consecutive_failures integer not null default 0,
  last_failure_reason  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- radius_clients
create table if not exists public.radius_clients (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  description   text,
  client_ip     text not null,
  shared_secret text not null,
  vendor        text not null default 'generic',
  is_active     boolean not null default true,
  last_seen     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- radius_health_checks
create table if not exists public.radius_health_checks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants(id) on delete cascade,
  server_id  uuid references public.radius_servers(id) on delete cascade,
  is_healthy boolean not null,
  latency_ms integer,
  status     text,
  error      text,
  checked_at timestamptz not null default now()
);

-- nas_devices
create table if not exists public.nas_devices (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  router_id                uuid references public.routers(id) on delete set null,
  name                     text not null,
  description              text,
  vendor                   text not null default 'mikrotik',
  nas_identifier           text,
  nas_ip                   text,
  shared_secret            text not null default 'SmartLinkNet-Public-Fallback',
  auth_port                integer not null default 1812,
  acct_port                integer not null default 1813,
  coa_port                 integer not null default 3799,
  is_active                boolean not null default true,
  radius_server_id         uuid references public.radius_servers(id) on delete set null,
  dynamic_vlan_enabled     boolean not null default false,
  dynamic_profile_enabled  boolean not null default true,
  dynamic_ip_enabled       boolean not null default false,
  last_seen                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (router_id)
);

-- auth_events
create table if not exists public.auth_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.tenants(id) on delete cascade,
  nas_id         uuid references public.nas_devices(id) on delete set null,
  username       text,
  event_type     text not null,
  framed_ip      text,
  nas_identifier text,
  raw_attrs      jsonb default '{}',
  received_at    timestamptz not null default now()
);

-- radius_accounting
create table if not exists public.radius_accounting (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete cascade,
  nas_id                uuid references public.nas_devices(id) on delete set null,
  session_id            text,
  nas_identifier        text,
  username              text not null,
  framed_ip             text,
  calling_station       text,
  called_station        text,
  acct_status_type      text not null,
  acct_input_octets     bigint not null default 0,
  acct_output_octets    bigint not null default 0,
  acct_session_time     integer not null default 0,
  acct_input_packets    bigint not null default 0,
  acct_output_packets   bigint not null default 0,
  acct_terminate_cause  text,
  service_type          text,
  nas_port_type         text,
  raw_attrs             jsonb default '{}',
  received_at           timestamptz not null default now(),
  received_by_server    uuid references public.radius_servers(id) on delete set null,
  is_replicated         boolean not null default false
);

-- Indexes
create index if not exists idx_radius_servers_tenant   on public.radius_servers(tenant_id);
create index if not exists idx_radius_clients_tenant   on public.radius_clients(tenant_id);
create index if not exists idx_radius_hc_tenant        on public.radius_health_checks(tenant_id, checked_at desc);
create index if not exists idx_nas_devices_tenant      on public.nas_devices(tenant_id);
create index if not exists idx_nas_devices_router      on public.nas_devices(router_id);
create index if not exists idx_auth_events_tenant_time on public.auth_events(tenant_id, received_at desc);
create index if not exists idx_radius_acct_tenant_time on public.radius_accounting(tenant_id, received_at desc);

-- Grants
grant select, insert, update, delete on public.radius_servers      to authenticated;
grant select, insert, update, delete on public.radius_clients      to authenticated;
grant select, insert, update, delete on public.radius_health_checks to authenticated;
grant select, insert, update, delete on public.nas_devices         to authenticated;
grant select, insert, update, delete on public.auth_events         to authenticated;
grant select, insert, update, delete on public.radius_accounting   to authenticated;
grant all on public.radius_servers      to service_role;
grant all on public.radius_clients      to service_role;
grant all on public.radius_health_checks to service_role;
grant all on public.nas_devices         to service_role;
grant all on public.auth_events         to service_role;
grant all on public.radius_accounting   to service_role;

-- RLS
alter table public.radius_servers       enable row level security;
alter table public.radius_clients       enable row level security;
alter table public.radius_health_checks enable row level security;
alter table public.nas_devices          enable row level security;
alter table public.auth_events          enable row level security;
alter table public.radius_accounting    enable row level security;

-- Policies: tenant isolation via tenants table
create policy "tenant_radius_servers"    on public.radius_servers       for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
create policy "tenant_radius_clients"    on public.radius_clients       for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
create policy "tenant_radius_hc"         on public.radius_health_checks for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
create policy "tenant_nas_devices"       on public.nas_devices          for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
create policy "tenant_auth_events"       on public.auth_events          for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
create policy "tenant_radius_accounting" on public.radius_accounting    for all using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));
