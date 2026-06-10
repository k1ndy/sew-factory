-- =====================================================================
-- ЦЕХ — схема базы данных (PostgreSQL / Supabase)
-- Запуск: выполнить в Supabase SQL Editor по порядку:
--   01_schema.sql -> 02_functions.sql -> 03_seed.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ENUM-типы --------------------------------------------------
do $$ begin
  create type employee_role as enum ('admin','technologist','cutter','seamstress','ironer','packer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employee_status as enum ('active','dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type batch_stage as enum ('cutting','sewing','ironing','packing','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type batch_status as enum ('active','paused','completed','archived','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_stage as enum ('cutting','sewing','ironing','packing','technologist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_type as enum ('salary','advance','bonus','penalty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type advance_status as enum ('pending','approved','rejected','paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_category as enum ('fabric','accessories','logistics','rent','utilities','salary','repair','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'batch_created','task_assigned','task_completed','stage_completed','batch_completed',
    'advance_requested','advance_approved','advance_rejected','payment_created','expense_created','system');
exception when duplicate_object then null; end $$;

-- ---------- employees --------------------------------------------------
create table if not exists employees (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  phone          text not null unique,
  pin_hash       text not null,
  role           employee_role not null default 'seamstress',
  status         employee_status not null default 'active',
  lang           text not null default 'ru',
  failed_attempts int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  dismissed_at   timestamptz
);

-- ---------- sessions ---------------------------------------------------
create table if not exists sessions (
  token        uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days')
);
create index if not exists idx_sessions_employee on sessions(employee_id);

-- ---------- batches ----------------------------------------------------
create table if not exists batches (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  client_name         text,
  product_type        text,
  fabric_name         text,
  fabric_unit         text not null default 'meter',    -- 'meter' | 'kg'
  fabric_quantity     numeric(12,2),                    -- метраж или вес ткани
  fabric_price_usd    numeric(14,2),                    -- цена за метр/кг в USD
  usd_rate            numeric(14,4),                    -- курс: сомов за 1 USD
  fabric_cost_usd     numeric(14,2) not null default 0, -- итог по ткани в USD
  fabric_cost         numeric(14,2) not null default 0, -- итог по ткани в сомах
  planned_quantity    int not null check (planned_quantity > 0),
  actual_quantity     int check (actual_quantity is null or actual_quantity >= 0),
  sale_price_per_unit numeric(14,2),
  current_stage       batch_stage not null default 'cutting',
  status              batch_status not null default 'active',
  created_by          uuid references employees(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  archived_at         timestamptz
);
create index if not exists idx_batches_status on batches(status);
create index if not exists idx_batches_stage on batches(current_stage);

-- ---------- tasks ------------------------------------------------------
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null references batches(id),
  employee_id        uuid not null references employees(id),
  assigned_by        uuid references employees(id),
  stage              task_stage not null,
  planned_quantity   int not null check (planned_quantity > 0),
  completed_quantity int not null default 0 check (completed_quantity >= 0),
  rate_per_unit      numeric(14,2) not null check (rate_per_unit >= 0),
  size               text,
  status             task_status not null default 'pending',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index if not exists idx_tasks_batch on tasks(batch_id);
create index if not exists idx_tasks_employee on tasks(employee_id);
create index if not exists idx_tasks_status on tasks(status);

-- ---------- work_records (источник правды для зарплаты) ----------------
create table if not exists work_records (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references tasks(id),
  batch_id      uuid not null references batches(id),
  employee_id   uuid not null references employees(id),
  stage         task_stage not null,
  quantity      int not null check (quantity > 0),
  rate_per_unit numeric(14,2) not null check (rate_per_unit >= 0),
  total_amount  numeric(16,2) not null check (total_amount >= 0),
  note          text,
  created_by    uuid references employees(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_wr_employee on work_records(employee_id);
create index if not exists idx_wr_batch on work_records(batch_id);
create index if not exists idx_wr_task on work_records(task_id);

-- ---------- payments ---------------------------------------------------
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id),
  amount       numeric(14,2) not null check (amount > 0),
  type         payment_type not null,
  date         date not null default current_date,
  batch_id     uuid references batches(id),
  note         text,
  created_by   uuid references employees(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_payments_employee on payments(employee_id);

-- ---------- advance_requests ------------------------------------------
create table if not exists advance_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id),
  amount        numeric(14,2) not null check (amount > 0),
  comment       text,
  status        advance_status not null default 'pending',
  admin_comment text,
  resolved_by   uuid references employees(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists idx_adv_employee on advance_requests(employee_id);
create index if not exists idx_adv_status on advance_requests(status);

-- ---------- expenses ---------------------------------------------------
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid references batches(id),
  category     expense_category not null default 'other',
  amount       numeric(14,2) not null check (amount > 0),
  description  text,
  date         date not null default current_date,
  created_by   uuid references employees(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_expenses_batch on expenses(batch_id);
create index if not exists idx_expenses_category on expenses(category);

-- ---------- notifications ---------------------------------------------
create table if not exists notifications (
  id                         uuid primary key default gen_random_uuid(),
  recipient_id               uuid references employees(id),
  recipient_role             employee_role,
  message                    text not null,
  type                       notification_type not null default 'system',
  is_read                    boolean not null default false,
  related_batch_id           uuid references batches(id),
  related_task_id            uuid references tasks(id),
  related_advance_request_id uuid references advance_requests(id),
  created_at                 timestamptz not null default now()
);
create index if not exists idx_notif_recipient on notifications(recipient_id);
create index if not exists idx_notif_role on notifications(recipient_role);

-- ---------- updated_at триггер ----------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','batches','tasks','expenses'] loop
    execute format('drop trigger if exists trg_updated_at on %I', t);
    execute format('create trigger trg_updated_at before update on %I
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------- RLS: запрет прямого доступа клиента -----------------------
-- Весь доступ идёт через SECURITY DEFINER функции. Включаем RLS без
-- политик => для ролей anon/authenticated прямой доступ запрещён.
do $$
declare t text;
begin
  foreach t in array array['employees','sessions','batches','tasks','work_records',
                           'payments','advance_requests','expenses','notifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
