-- SmartLinkNet Enterprise Upgrade Migration
-- Job Queue, Automation Rules, Fraud Detection, Audit enhancements

-- ============================================================
-- JOB QUEUE
-- ============================================================
create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  priority int not null default 5,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists job_queue_tenant_status on job_queue(tenant_id, status);
create index if not exists job_queue_run_at on job_queue(run_at) where status = 'pending';

alter table job_queue enable row level security;
create policy "tenant_isolation_job_queue" on job_queue
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- ============================================================
-- AUTOMATION RULES
-- ============================================================
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  trigger text not null,
  conditions jsonb not null default '{}',
  action text not null,
  action_params jsonb not null default '{}',
  is_active boolean not null default true,
  last_run timestamptz,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_rules_tenant on automation_rules(tenant_id);

alter table automation_rules enable row level security;
create policy "tenant_isolation_automation_rules" on automation_rules
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- ============================================================
-- AUTOMATION EXECUTION LOGS
-- ============================================================
create table if not exists automation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  rule_id uuid references automation_rules(id) on delete set null,
  rule_name text,
  success boolean not null default true,
  message text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists automation_logs_tenant on automation_logs(tenant_id, created_at desc);

alter table automation_logs enable row level security;
create policy "tenant_isolation_automation_logs" on automation_logs
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- ============================================================
-- FRAUD INCIDENTS
-- ============================================================
create table if not exists fraud_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  type text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  description text not null,
  metadata jsonb default '{}',
  status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fraud_incidents_tenant_status on fraud_incidents(tenant_id, status);

alter table fraud_incidents enable row level security;
create policy "tenant_isolation_fraud_incidents" on fraud_incidents
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- ============================================================
-- ENSURE payment_id unique constraint on subscriptions for idempotency
-- ============================================================
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_payment_id_key'
  ) then
    alter table subscriptions add column if not exists payment_id uuid;
    create unique index if not exists subscriptions_payment_id_key on subscriptions(payment_id) where payment_id is not null;
  end if;
end $$;

-- ============================================================
-- VOUCHER abuse tracking columns
-- ============================================================
alter table vouchers
  add column if not exists activated_by_ip text,
  add column if not exists activated_at timestamptz;

-- ============================================================
-- UPDATED_AT trigger for automation_rules
-- ============================================================
create or replace function fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_automation_rules_updated_at on automation_rules;
create trigger trg_automation_rules_updated_at
  before update on automation_rules
  for each row execute function fn_set_updated_at();
