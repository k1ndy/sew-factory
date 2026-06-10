-- =====================================================================
-- ЦЕХ — RPC-функции (вся бизнес-логика и контроль доступа)
-- Все функции SECURITY DEFINER. Клиент вызывает их через Supabase RPC.
-- Первый аргумент p_token — токен сессии (кроме login).
-- =====================================================================

-- ---------- Хелперы ----------------------------------------------------

-- Разрешить роли anon/authenticated выполнять функции (доступ всё равно
-- ограничен проверкой токена внутри). Делаем в конце файла грантами.

create or replace function app_actor(p_token uuid)
returns employees
language plpgsql security definer set search_path = public as $$
declare e employees;
begin
  if p_token is null then raise exception 'AUTH_INVALID'; end if;
  select emp.* into e
    from employees emp
    join sessions s on s.employee_id = emp.id
   where s.token = p_token and s.expires_at > now();
  if not found then raise exception 'AUTH_INVALID'; end if;
  if e.status = 'dismissed' then raise exception 'AUTH_DISMISSED'; end if;
  return e;
end $$;

create or replace function assert_admin(actor employees) returns void
language plpgsql as $$
begin
  if actor.role <> 'admin' then raise exception 'FORBIDDEN'; end if;
end $$;

create or replace function assert_manager(actor employees) returns void
language plpgsql as $$
begin
  if actor.role not in ('admin','technologist') then raise exception 'FORBIDDEN'; end if;
end $$;

-- кто управляет зарплатами: admin и technologist (технолог выдаёт ЗП)
create or replace function assert_salary_mgr(actor employees) returns void
language plpgsql as $$
begin
  if actor.role not in ('admin','technologist') then raise exception 'FORBIDDEN'; end if;
end $$;

create or replace function employee_public(e employees) returns jsonb
language sql as $$
  select to_jsonb(e) - 'pin_hash' - 'failed_attempts';
$$;

-- ---------- AUTH -------------------------------------------------------

create or replace function login(p_phone text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e employees; t uuid;
begin
  select * into e from employees where phone = p_phone;
  if not found then raise exception 'LOGIN_INVALID'; end if;
  if e.status = 'dismissed' then raise exception 'AUTH_DISMISSED'; end if;
  if e.locked_until is not null and e.locked_until > now() then
    raise exception 'LOCKED_UNTIL:%', to_char(e.locked_until, 'YYYY-MM-DD"T"HH24:MI:SSOF');
  end if;

  if e.pin_hash = crypt(p_pin, e.pin_hash) then
    update employees set failed_attempts = 0, locked_until = null where id = e.id;
    insert into sessions(employee_id) values (e.id) returning token into t;
    select * into e from employees where id = e.id;
    return jsonb_build_object('token', t, 'employee', employee_public(e));
  else
    update employees
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5
                               then now() + interval '5 minutes' else null end
     where id = e.id;
    raise exception 'LOGIN_INVALID';
  end if;
end $$;

create or replace function logout(p_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from sessions where token = p_token;
end $$;

create or replace function me(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees;
begin
  actor := app_actor(p_token);
  return employee_public(actor);
end $$;

create or replace function set_my_lang(p_token uuid, p_lang text)
returns void
language plpgsql security definer set search_path = public as $$
declare actor employees;
begin
  actor := app_actor(p_token);
  if p_lang not in ('ru','ky','en') then raise exception 'BAD_LANG'; end if;
  update employees set lang = p_lang where id = actor.id;
end $$;

-- ---------- NOTIFICATIONS (внутренний хелпер) -------------------------

create or replace function notify(
  p_recipient_id uuid, p_role employee_role, p_message text, p_type notification_type,
  p_batch uuid default null, p_task uuid default null, p_adv uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(recipient_id, recipient_role, message, type,
                            related_batch_id, related_task_id, related_advance_request_id)
  values (p_recipient_id, p_role, p_message, p_type, p_batch, p_task, p_adv);
end $$;

create or replace function list_notifications(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
    into r
    from notifications n
   where n.recipient_id = actor.id
      or (n.recipient_id is null and n.recipient_role = actor.role)
      or (actor.role = 'admin' and n.recipient_role = 'admin');
  return r;
end $$;

create or replace function unread_count(p_token uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare actor employees; c int;
begin
  actor := app_actor(p_token);
  select count(*) into c from notifications n
   where (n.recipient_id = actor.id
       or (n.recipient_id is null and n.recipient_role = actor.role))
     and n.is_read = false;
  return c;
end $$;

create or replace function mark_notification_read(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor employees;
begin
  actor := app_actor(p_token);
  update notifications set is_read = true
   where id = p_id
     and (recipient_id = actor.id
       or (recipient_id is null and recipient_role = actor.role));
end $$;

create or replace function mark_all_read(p_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor employees;
begin
  actor := app_actor(p_token);
  update notifications set is_read = true
   where is_read = false
     and (recipient_id = actor.id
       or (recipient_id is null and recipient_role = actor.role));
end $$;

-- ---------- EMPLOYEES --------------------------------------------------

create or replace function list_employees(p_token uuid, p_status text default null, p_role text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  select coalesce(jsonb_agg(employee_public(e) order by e.full_name), '[]'::jsonb)
    into r from employees e
   where (p_status is null or e.status::text = p_status)
     and (p_role is null or e.role::text = p_role);
  return r;
end $$;

create or replace function create_employee(
  p_token uuid, p_full_name text, p_phone text, p_pin text, p_role text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare actor employees; e employees;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  if length(coalesce(p_pin,'')) < 4 then raise exception 'PIN_TOO_SHORT'; end if;
  if exists(select 1 from employees where phone = p_phone) then raise exception 'PHONE_TAKEN'; end if;
  insert into employees(full_name, phone, pin_hash, role)
    values (p_full_name, p_phone, crypt(p_pin, gen_salt('bf')), p_role::employee_role)
    returning * into e;
  return employee_public(e);
end $$;

create or replace function update_employee(
  p_token uuid, p_id uuid, p_full_name text, p_phone text, p_role text, p_pin text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare actor employees; e employees;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  if exists(select 1 from employees where phone = p_phone and id <> p_id) then raise exception 'PHONE_TAKEN'; end if;
  update employees set
    full_name = p_full_name,
    phone     = p_phone,
    role      = p_role::employee_role,
    pin_hash  = case when p_pin is not null and length(p_pin) >= 4
                     then crypt(p_pin, gen_salt('bf')) else pin_hash end
  where id = p_id returning * into e;
  if not found then raise exception 'NOT_FOUND'; end if;
  return employee_public(e);
end $$;

create or replace function dismiss_employee(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; e employees;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  if p_id = actor.id then raise exception 'CANNOT_DISMISS_SELF'; end if;
  update employees set status = 'dismissed', dismissed_at = now() where id = p_id returning * into e;
  if not found then raise exception 'NOT_FOUND'; end if;
  delete from sessions where employee_id = p_id;  -- разлогинить
  return employee_public(e);
end $$;

create or replace function reactivate_employee(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; e employees;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  update employees set status = 'active', dismissed_at = null where id = p_id returning * into e;
  if not found then raise exception 'NOT_FOUND'; end if;
  return employee_public(e);
end $$;

-- ---------- BATCHES ----------------------------------------------------

create or replace function list_batches(p_token uuid, p_archived boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  if actor.role in ('admin','technologist') then
    select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb) into r
      from batches b
     where case when p_archived then b.status in ('archived','cancelled')
                else b.status not in ('archived','cancelled') end;
  else
    -- исполнитель видит партии, где есть его задачи или которые он создал (закройщик)
    select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb) into r
      from batches b
     where (b.created_by = actor.id
            or exists(select 1 from tasks t where t.batch_id = b.id and t.employee_id = actor.id))
       and case when p_archived then b.status in ('archived','cancelled')
                else b.status not in ('archived','cancelled') end;
  end if;
  return r;
end $$;

-- Создать партию. Доступно admin, technologist и cutter (закройщику).
-- Денежные поля (цена ткани в USD, курс, цена продажи) заполняет только admin.
create or replace function create_batch(
  p_token uuid, p_name text, p_client text, p_product text, p_fabric_name text,
  p_fabric_unit text, p_fabric_quantity numeric, p_fabric_price_usd numeric, p_usd_rate numeric,
  p_planned_quantity int, p_sale_price numeric default null, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches; is_money boolean; price numeric; rate numeric; cost_usd numeric; cost_som numeric;
begin
  actor := app_actor(p_token);
  if actor.role not in ('admin','technologist','cutter') then raise exception 'FORBIDDEN'; end if;
  -- план необязателен: количество известно после раскроя (факт)
  if p_planned_quantity is not null and p_planned_quantity <= 0 then raise exception 'QTY_INVALID'; end if;

  is_money := actor.role = 'admin';
  price := case when is_money then p_fabric_price_usd else null end;
  rate  := case when is_money then p_usd_rate else null end;
  cost_usd := coalesce(p_fabric_quantity,0) * coalesce(price,0);
  cost_som := cost_usd * coalesce(rate,0);

  insert into batches(name, client_name, product_type, fabric_name, fabric_unit, fabric_quantity,
                      fabric_price_usd, usd_rate, fabric_cost_usd, fabric_cost,
                      planned_quantity, sale_price_per_unit, notes, created_by)
    values (p_name, p_client, p_product, p_fabric_name, coalesce(p_fabric_unit,'meter'), p_fabric_quantity,
            price, rate, cost_usd, cost_som,
            p_planned_quantity, case when is_money then p_sale_price else null end, p_notes, actor.id)
    returning * into b;
  perform notify(null, 'technologist', 'Создана новая партия: ' || p_name, 'batch_created', b.id);
  perform notify(null, 'admin', 'Создана новая партия: ' || p_name, 'batch_created', b.id);
  return to_jsonb(b);
end $$;

-- Обновить партию. admin меняет всё; technologist/cutter — только нефинансовые
-- поля (название, ткань, метраж/вес, план, факт, заметки). Денежные поля
-- (цена USD, курс, цена продажи) у не-админа сохраняются прежними.
create or replace function update_batch(
  p_token uuid, p_id uuid, p_name text, p_client text, p_product text, p_fabric_name text,
  p_fabric_unit text, p_fabric_quantity numeric, p_fabric_price_usd numeric, p_usd_rate numeric,
  p_planned_quantity int, p_actual_quantity int, p_sale_price numeric, p_notes text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches; ex batches; is_money boolean; price numeric; rate numeric; cost_usd numeric; cost_som numeric;
begin
  actor := app_actor(p_token);
  if actor.role not in ('admin','technologist','cutter') then raise exception 'FORBIDDEN'; end if;
  select * into ex from batches where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_planned_quantity is not null and p_planned_quantity <= 0 then raise exception 'QTY_INVALID'; end if;

  is_money := actor.role = 'admin';
  price := case when is_money then p_fabric_price_usd else ex.fabric_price_usd end;
  rate  := case when is_money then p_usd_rate else ex.usd_rate end;
  cost_usd := coalesce(p_fabric_quantity,0) * coalesce(price,0);
  cost_som := cost_usd * coalesce(rate,0);

  update batches set
    name = p_name, client_name = p_client, product_type = p_product, fabric_name = p_fabric_name,
    fabric_unit = coalesce(p_fabric_unit, fabric_unit), fabric_quantity = p_fabric_quantity,
    planned_quantity = p_planned_quantity, actual_quantity = p_actual_quantity, notes = p_notes,
    fabric_price_usd = price, usd_rate = rate, fabric_cost_usd = cost_usd, fabric_cost = cost_som,
    sale_price_per_unit = case when is_money then p_sale_price else sale_price_per_unit end
  where id = p_id returning * into b;
  return to_jsonb(b);
end $$;

create or replace function archive_batch(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  update batches set status = 'archived', archived_at = now() where id = p_id returning * into b;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(b);
end $$;

create or replace function cancel_batch(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  update batches set status = 'cancelled' where id = p_id returning * into b;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(b);
end $$;

-- Перевод партии на следующий этап
create or replace function advance_stage(p_token uuid, p_id uuid, p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches; pending_cnt int; next_stage batch_stage; cur task_stage;
begin
  actor := app_actor(p_token);
  perform assert_manager(actor);
  select * into b from batches where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status not in ('active','paused') then raise exception 'BATCH_NOT_ACTIVE'; end if;
  if b.current_stage = 'completed' then raise exception 'ALREADY_COMPLETED'; end if;

  cur := b.current_stage::text::task_stage;
  -- не завершённые задачи текущего этапа
  select count(*) into pending_cnt from tasks t
   where t.batch_id = b.id and t.stage = cur and t.status not in ('completed','cancelled');

  if pending_cnt > 0 and not p_force then
    return jsonb_build_object('needs_force', true, 'pending_tasks', pending_cnt,
                              'stage', b.current_stage);
  end if;
  -- принудительный перевод доступен только admin
  if pending_cnt > 0 and p_force and actor.role <> 'admin' then
    raise exception 'FORCE_REQUIRES_ADMIN';
  end if;

  next_stage := case b.current_stage
                  when 'cutting' then 'sewing'
                  when 'sewing'  then 'ironing'
                  when 'ironing' then 'packing'
                  when 'packing' then 'completed'
                end;

  if next_stage = 'completed' then
    update batches set current_stage = 'completed', status = 'completed', completed_at = now()
      where id = b.id returning * into b;
    perform notify(null, 'admin', 'Партия завершена: ' || b.name, 'batch_completed', b.id);
    perform notify(b.created_by, null, 'Партия завершена: ' || b.name, 'batch_completed', b.id);
  else
    update batches set current_stage = next_stage where id = b.id returning * into b;
    perform notify(null, 'admin', 'Партия «' || b.name || '» переведена на этап: ' || next_stage,
                   'stage_completed', b.id);
  end if;
  return jsonb_build_object('needs_force', false, 'batch', to_jsonb(b));
end $$;

-- Откат завершённой партии (только admin)
create or replace function reopen_batch(p_token uuid, p_id uuid, p_stage text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  update batches set status = 'active', current_stage = p_stage::batch_stage, completed_at = null
    where id = p_id returning * into b;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(b);
end $$;

-- Карточка партии: партия + задачи + себестоимость
create or replace function get_batch(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; b batches; tasks_json jsonb; wr_json jsonb;
        work_total numeric; expense_total numeric; qty int; total_cost numeric;
        unit_cost numeric; revenue numeric; profit numeric; margin numeric;
        can_view boolean;
begin
  actor := app_actor(p_token);
  select * into b from batches where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  can_view := actor.role in ('admin','technologist')
              or b.created_by = actor.id
              or exists(select 1 from tasks t where t.batch_id = b.id and t.employee_id = actor.id);
  if not can_view then raise exception 'FORBIDDEN'; end if;

  -- задачи: менеджеры и создатель партии видят все, остальные — только свои
  select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'stage', t.stage, 'employee_id', t.employee_id,
            'employee_name', e.full_name, 'planned_quantity', t.planned_quantity,
            'completed_quantity', t.completed_quantity, 'rate_per_unit', t.rate_per_unit,
            'size', t.size, 'status', t.status, 'notes', t.notes, 'created_at', t.created_at)
          order by t.created_at), '[]'::jsonb)
    into tasks_json
    from tasks t join employees e on e.id = t.employee_id
   where t.batch_id = b.id
     and (actor.role in ('admin','technologist') or b.created_by = actor.id or t.employee_id = actor.id);

  select coalesce(sum(total_amount),0) into work_total from work_records where batch_id = b.id;
  select coalesce(sum(amount),0) into expense_total from expenses where batch_id = b.id;

  qty := coalesce(nullif(b.actual_quantity,0), b.planned_quantity);
  total_cost := coalesce(b.fabric_cost,0) + expense_total + work_total;
  unit_cost  := case when qty > 0 then total_cost / qty else null end;
  if b.sale_price_per_unit is not null then
    revenue := b.sale_price_per_unit * qty;
    profit  := revenue - total_cost;
    margin  := case when revenue > 0 then profit / revenue * 100 else null end;
  end if;

  -- история работ (с суммами) — только admin (деньги)
  if actor.role = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object(
              'id', w.id, 'employee_name', e.full_name, 'stage', w.stage,
              'quantity', w.quantity, 'rate_per_unit', w.rate_per_unit,
              'total_amount', w.total_amount, 'created_at', w.created_at) order by w.created_at desc),
            '[]'::jsonb)
      into wr_json
      from work_records w join employees e on e.id = w.employee_id
     where w.batch_id = b.id;
  else
    wr_json := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'batch', to_jsonb(b),
    'tasks', tasks_json,
    'work_records', wr_json,
    -- себестоимость (деньги) отдаём ТОЛЬКО admin; технолог её не видит
    'cost', case when actor.role = 'admin' then jsonb_build_object(
      'fabric_unit', b.fabric_unit,
      'fabric_quantity', b.fabric_quantity,
      'fabric_cost_usd', coalesce(b.fabric_cost_usd,0),
      'usd_rate', b.usd_rate,
      'fabric_cost', coalesce(b.fabric_cost,0),
      'expense_total', expense_total,
      'work_total', work_total,
      'total_cost', total_cost,
      'qty', qty,
      'unit_cost', unit_cost,
      'unit_fabric_usd', case when qty > 0 then coalesce(b.fabric_cost_usd,0) / qty else null end,
      'revenue', revenue,
      'profit', profit,
      'margin', margin) else null end,
    'is_manager', actor.role in ('admin','technologist'));
end $$;

-- ---------- TASKS ------------------------------------------------------

create or replace function create_task(
  p_token uuid, p_batch_id uuid, p_employee_id uuid, p_stage text,
  p_planned_quantity int, p_rate numeric, p_size text default null, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; t tasks; b batches;
begin
  actor := app_actor(p_token);
  perform assert_manager(actor);
  if p_batch_id is null then raise exception 'BATCH_REQUIRED'; end if;
  if p_employee_id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
  if p_planned_quantity is null or p_planned_quantity <= 0 then raise exception 'QTY_INVALID'; end if;
  if p_rate is null or p_rate < 0 then raise exception 'RATE_INVALID'; end if;
  select * into b from batches where id = p_batch_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, rate_per_unit, size, notes)
    values (p_batch_id, p_employee_id, actor.id, p_stage::task_stage, p_planned_quantity, p_rate, p_size, p_notes)
    returning * into t;
  perform notify(p_employee_id, null,
    'Вам назначена задача: ' || b.name || ' (' || p_stage || ', ' || p_planned_quantity || ' шт)',
    'task_assigned', p_batch_id, t.id);
  return to_jsonb(t);
end $$;

create or replace function update_task(
  p_token uuid, p_id uuid, p_planned_quantity int, p_rate numeric, p_size text, p_notes text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; t tasks;
begin
  actor := app_actor(p_token);
  perform assert_manager(actor);
  select * into t from tasks where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_planned_quantity < t.completed_quantity then raise exception 'PLAN_BELOW_DONE'; end if;
  if p_rate < 0 then raise exception 'RATE_INVALID'; end if;
  update tasks set
    planned_quantity = p_planned_quantity,
    rate_per_unit = p_rate, size = p_size, notes = p_notes,
    status = case when status = 'cancelled' then status
                  when completed_quantity >= p_planned_quantity then 'completed'
                  when completed_quantity > 0 then 'in_progress'
                  else 'pending' end
  where id = p_id returning * into t;
  return to_jsonb(t);
end $$;

create or replace function cancel_task(p_token uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; t tasks;
begin
  actor := app_actor(p_token);
  perform assert_manager(actor);
  update tasks set status = 'cancelled' where id = p_id returning * into t;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(t);
end $$;

-- Мои задачи (исполнитель / технолог)
create or replace function list_my_tasks(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'batch_id', t.batch_id, 'batch_name', b.name,
            'stage', t.stage, 'planned_quantity', t.planned_quantity,
            'completed_quantity', t.completed_quantity, 'rate_per_unit', t.rate_per_unit,
            'size', t.size, 'status', t.status, 'notes', t.notes,
            'earned', t.completed_quantity * t.rate_per_unit,
            'created_at', t.created_at) order by
              case t.status when 'in_progress' then 0 when 'pending' then 1 else 2 end,
              t.created_at desc), '[]'::jsonb)
    into r
    from tasks t join batches b on b.id = t.batch_id
   where t.employee_id = actor.id;
  return r;
end $$;

-- ---------- WORK RECORDS — критическая функция -------------------------

create or replace function submit_work(p_token uuid, p_task_id uuid, p_quantity int, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; t tasks; b batches; wr work_records; new_done int;
begin
  actor := app_actor(p_token);
  if p_task_id is null then raise exception 'TASK_REQUIRED'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'QTY_INVALID'; end if;

  -- блокировка строки задачи: сериализует конкурентные вызовы
  select * into t from tasks where id = p_task_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  -- только владелец задачи или менеджер
  if t.employee_id <> actor.id and actor.role not in ('admin','technologist') then
    raise exception 'FORBIDDEN';
  end if;
  if t.status = 'cancelled' then raise exception 'TASK_CANCELLED'; end if;

  new_done := t.completed_quantity + p_quantity;
  if new_done > t.planned_quantity then raise exception 'QTY_OVER_PLAN'; end if;

  insert into work_records(task_id, batch_id, employee_id, stage, quantity,
                           rate_per_unit, total_amount, note, created_by)
    values (t.id, t.batch_id, t.employee_id, t.stage, p_quantity,
            t.rate_per_unit, p_quantity * t.rate_per_unit, p_note, actor.id)
    returning * into wr;

  update tasks set
    completed_quantity = new_done,
    status = case when new_done >= planned_quantity then 'completed' else 'in_progress' end,
    completed_at = case when new_done >= planned_quantity then now() else completed_at end
  where id = t.id;

  select * into b from batches where id = t.batch_id;
  perform notify(null, 'admin',
    b.name || ': ' || actor.full_name || ' сдал(а) ' || p_quantity || ' шт (' || t.stage || ')',
    case when new_done >= t.planned_quantity then 'task_completed' else 'task_completed' end,
    t.batch_id, t.id);

  return to_jsonb(wr);
end $$;

-- ---------- PAYMENTS / SALARY -----------------------------------------

create or replace function salary_summary(actor_role employee_role, p_employee_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare accrued numeric; paid numeric; bonus numeric; penalty numeric;
begin
  select coalesce(sum(total_amount),0) into accrued from work_records where employee_id = p_employee_id;
  select coalesce(sum(amount),0) into paid    from payments where employee_id = p_employee_id and type in ('salary','advance');
  select coalesce(sum(amount),0) into bonus   from payments where employee_id = p_employee_id and type = 'bonus';
  select coalesce(sum(amount),0) into penalty from payments where employee_id = p_employee_id and type = 'penalty';
  return jsonb_build_object(
    'accrued', accrued, 'paid', paid, 'bonus', bonus, 'penalty', penalty,
    'balance', accrued + bonus - penalty - paid);
end $$;

-- Зарплата одного сотрудника (с историей)
create or replace function get_salary(p_token uuid, p_employee_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; target uuid; wr jsonb; pays jsonb; emp employees;
begin
  actor := app_actor(p_token);
  target := coalesce(p_employee_id, actor.id);
  if target <> actor.id and actor.role not in ('admin','technologist') then raise exception 'FORBIDDEN'; end if;

  select * into emp from employees where id = target;
  select coalesce(jsonb_agg(jsonb_build_object(
            'id', w.id, 'batch_name', b.name, 'stage', w.stage, 'quantity', w.quantity,
            'rate_per_unit', w.rate_per_unit, 'total_amount', w.total_amount,
            'created_at', w.created_at) order by w.created_at desc), '[]'::jsonb)
    into wr from work_records w join batches b on b.id = w.batch_id where w.employee_id = target;
  select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id, 'amount', p.amount, 'type', p.type, 'date', p.date,
            'note', p.note, 'created_at', p.created_at) order by p.created_at desc), '[]'::jsonb)
    into pays from payments p where p.employee_id = target;

  return jsonb_build_object(
    'employee', employee_public(emp),
    'summary', salary_summary(actor.role, target),
    'work_records', wr,
    'payments', pays);
end $$;

-- Сводка по всем сотрудникам (admin)
create or replace function list_salaries(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  perform assert_salary_mgr(actor);
  select coalesce(jsonb_agg(jsonb_build_object(
            'employee', employee_public(e),
            'summary', salary_summary('admin', e.id)) order by e.full_name), '[]'::jsonb)
    into r from employees e where e.status = 'active';
  return r;
end $$;

create or replace function create_payment(
  p_token uuid, p_employee_id uuid, p_amount numeric, p_type text,
  p_batch_id uuid default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; p payments;
begin
  actor := app_actor(p_token);
  perform assert_salary_mgr(actor);
  if p_amount is null or p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  if p_type not in ('salary','advance','bonus','penalty') then raise exception 'TYPE_INVALID'; end if;
  insert into payments(employee_id, amount, type, batch_id, note, created_by)
    values (p_employee_id, p_amount, p_type::payment_type, p_batch_id, p_note, actor.id)
    returning * into p;
  perform notify(p_employee_id, null,
    'Начисление: ' || p_type || ' ' || p_amount || ' сом', 'payment_created', p_batch_id);
  return to_jsonb(p);
end $$;

-- ---------- ADVANCE REQUESTS ------------------------------------------

create or replace function create_advance_request(p_token uuid, p_amount numeric, p_comment text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; a advance_requests;
begin
  actor := app_actor(p_token);
  if p_amount is null or p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  insert into advance_requests(employee_id, amount, comment)
    values (actor.id, p_amount, p_comment) returning * into a;
  perform notify(null, 'admin',
    'Запрос аванса: ' || actor.full_name || ' — ' || p_amount || ' сом',
    'advance_requested', null, null, a.id);
  return to_jsonb(a);
end $$;

create or replace function list_advance_requests(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  if actor.role = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'employee_id', a.employee_id, 'employee_name', e.full_name,
              'amount', a.amount, 'comment', a.comment, 'status', a.status,
              'admin_comment', a.admin_comment, 'created_at', a.created_at,
              'resolved_at', a.resolved_at) order by
                case a.status when 'pending' then 0 else 1 end, a.created_at desc), '[]'::jsonb)
      into r from advance_requests a join employees e on e.id = a.employee_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'amount', a.amount, 'comment', a.comment, 'status', a.status,
              'admin_comment', a.admin_comment, 'created_at', a.created_at,
              'resolved_at', a.resolved_at) order by a.created_at desc), '[]'::jsonb)
      into r from advance_requests a where a.employee_id = actor.id;
  end if;
  return r;
end $$;

-- action: 'approve' | 'reject' | 'paid'
create or replace function resolve_advance_request(p_token uuid, p_id uuid, p_action text, p_comment text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; a advance_requests;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  select * into a from advance_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_action = 'approve' then
    update advance_requests set status = 'approved', admin_comment = p_comment,
           resolved_by = actor.id, resolved_at = now() where id = p_id returning * into a;
    perform notify(a.employee_id, null, 'Аванс одобрен: ' || a.amount || ' сом', 'advance_approved', null, null, a.id);
  elsif p_action = 'reject' then
    update advance_requests set status = 'rejected', admin_comment = p_comment,
           resolved_by = actor.id, resolved_at = now() where id = p_id returning * into a;
    perform notify(a.employee_id, null, 'Аванс отклонён', 'advance_rejected', null, null, a.id);
  elsif p_action = 'paid' then
    update advance_requests set status = 'paid', admin_comment = coalesce(p_comment, a.admin_comment),
           resolved_by = actor.id, resolved_at = coalesce(a.resolved_at, now()) where id = p_id returning * into a;
    insert into payments(employee_id, amount, type, note, created_by)
      values (a.employee_id, a.amount, 'advance', 'Аванс по запросу', actor.id);
    perform notify(a.employee_id, null, 'Аванс выплачен: ' || a.amount || ' сом', 'advance_approved', null, null, a.id);
  else
    raise exception 'BAD_ACTION';
  end if;
  return to_jsonb(a);
end $$;

-- ---------- EXPENSES ---------------------------------------------------

create or replace function list_expenses(p_token uuid, p_category text default null, p_batch_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  select coalesce(jsonb_agg(jsonb_build_object(
            'id', x.id, 'batch_id', x.batch_id, 'batch_name', b.name, 'category', x.category,
            'amount', x.amount, 'description', x.description, 'date', x.date,
            'created_at', x.created_at) order by x.date desc, x.created_at desc), '[]'::jsonb)
    into r
    from expenses x left join batches b on b.id = x.batch_id
   where (p_category is null or x.category::text = p_category)
     and (p_batch_id is null or x.batch_id = p_batch_id);
  return r;
end $$;

create or replace function create_expense(
  p_token uuid, p_category text, p_amount numeric, p_description text,
  p_batch_id uuid default null, p_date date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; x expenses;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);
  if p_amount is null or p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  insert into expenses(batch_id, category, amount, description, date, created_by)
    values (p_batch_id, p_category::expense_category, p_amount, p_description,
            coalesce(p_date, current_date), actor.id)
    returning * into x;
  perform notify(null, 'admin', 'Расход: ' || p_category || ' ' || p_amount || ' сом', 'expense_created', p_batch_id);
  return to_jsonb(x);
end $$;

-- ---------- DASHBOARD --------------------------------------------------

create or replace function get_dashboard(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees;
        total_batches int; active_batches int; completed_batches int;
        by_stage jsonb; total_expenses numeric; total_accrued numeric; total_balance numeric;
        recent_batches jsonb; recent_work jsonb; recent_adv jsonb; emp_summary jsonb;
begin
  actor := app_actor(p_token);
  perform assert_admin(actor);

  select count(*) into total_batches from batches where status not in ('archived','cancelled');
  select count(*) into active_batches from batches where status = 'active';
  select count(*) into completed_batches from batches where status = 'completed';

  select coalesce(jsonb_object_agg(current_stage::text, c), '{}'::jsonb) into by_stage
    from (select current_stage, count(*) c from batches
           where status not in ('archived','cancelled') group by current_stage) s;

  select coalesce(sum(amount),0) into total_expenses from expenses;
  select coalesce(sum(total_amount),0) into total_accrued from work_records;

  select coalesce(sum((salary_summary('admin', e.id)->>'balance')::numeric),0)
    into total_balance from employees e where e.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'current_stage', b.current_stage,
            'status', b.status, 'planned_quantity', b.planned_quantity) order by b.created_at desc), '[]'::jsonb)
    into recent_batches from (select * from batches where status not in ('archived','cancelled')
                              order by created_at desc limit 5) b;

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', w.id, 'employee_name', e.full_name, 'batch_name', b.name,
            'quantity', w.quantity, 'total_amount', w.total_amount,
            'created_at', w.created_at) order by w.created_at desc), '[]'::jsonb)
    into recent_work from (select * from work_records order by created_at desc limit 5) w
    join employees e on e.id = w.employee_id join batches b on b.id = w.batch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'employee_name', e.full_name, 'amount', a.amount,
            'status', a.status, 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
    into recent_adv from (select * from advance_requests where status = 'pending'
                          order by created_at desc limit 5) a
    join employees e on e.id = a.employee_id;

  select coalesce(jsonb_agg(jsonb_build_object('role', role, 'count', c) order by role), '[]'::jsonb)
    into emp_summary from (select role, count(*) c from employees where status='active' group by role) s;

  return jsonb_build_object(
    'total_batches', total_batches, 'active_batches', active_batches,
    'completed_batches', completed_batches, 'by_stage', by_stage,
    'total_expenses', total_expenses, 'total_accrued', total_accrued,
    'total_balance', total_balance, 'recent_batches', recent_batches,
    'recent_work', recent_work, 'recent_advances', recent_adv,
    'employees_summary', emp_summary);
end $$;

-- Для назначения задач: список активных сотрудников (доступно менеджерам)
create or replace function list_assignees(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor employees; r jsonb;
begin
  actor := app_actor(p_token);
  perform assert_manager(actor);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'role', e.role)
           order by e.full_name), '[]'::jsonb)
    into r from employees e where e.status = 'active';
  return r;
end $$;

-- ---------- ГРАНТЫ -----------------------------------------------------
-- anon/authenticated могут только ВЫЗЫВАТЬ функции (доступ к данным
-- внутри функций ограничен токеном). Прямого доступа к таблицам нет.
do $$
declare fn text;
begin
  for fn in
    select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('login','logout','me','set_my_lang','list_notifications','unread_count',
         'mark_notification_read','mark_all_read','list_employees','create_employee','update_employee',
         'dismiss_employee','reactivate_employee','list_batches','create_batch','update_batch',
         'archive_batch','cancel_batch','advance_stage','reopen_batch','get_batch','create_task',
         'update_task','cancel_task','list_my_tasks','submit_work','get_salary','list_salaries',
         'create_payment','create_advance_request','list_advance_requests','resolve_advance_request',
         'list_expenses','create_expense','get_dashboard','list_assignees')
  loop
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end $$;
