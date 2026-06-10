-- =====================================================================
-- ЦЕХ — демо-данные. Запускать ПОСЛЕ 01_schema.sql и 02_functions.sql.
-- PIN-коды (для входа): см. ниже в комментариях у каждого сотрудника.
-- Повторный запуск безопасен (idempotent по phone).
-- =====================================================================

do $$
declare
  admin_id uuid; tech_id uuid; cut_id uuid; sew_id uuid; iron_id uuid; pack_id uuid;
  b1 uuid; b2 uuid; b3 uuid;
  t_cut1 uuid; t_sew1 uuid; t_iron1 uuid; t_tech1 uuid;
  t_cut2 uuid; t_sew2 uuid;
  t_cut3 uuid;
begin
  -- очистка демо (только если уже есть admin-демо)
  delete from notifications where true;
  delete from work_records where true;
  delete from payments where true;
  delete from advance_requests where true;
  delete from expenses where true;
  delete from tasks where true;
  delete from batches where true;
  delete from sessions where true;
  delete from employees where phone in
    ('+996700000001','+996700000002','+996700000003','+996700000004','+996700000005','+996700000006');

  -- ---------- Сотрудники (PIN) ----------
  insert into employees(full_name, phone, pin_hash, role) values
    ('Айбек Администратор', '+996700000001', crypt('1111', gen_salt('bf')), 'admin')        returning id into admin_id; -- PIN 1111
  insert into employees(full_name, phone, pin_hash, role) values
    ('Гульнара Технолог',   '+996700000002', crypt('2222', gen_salt('bf')), 'technologist') returning id into tech_id;  -- PIN 2222
  insert into employees(full_name, phone, pin_hash, role) values
    ('Нурлан Закройщик',    '+996700000003', crypt('3333', gen_salt('bf')), 'cutter')       returning id into cut_id;   -- PIN 3333
  insert into employees(full_name, phone, pin_hash, role) values
    ('Айгуль Швея',         '+996700000004', crypt('4444', gen_salt('bf')), 'seamstress')   returning id into sew_id;   -- PIN 4444
  insert into employees(full_name, phone, pin_hash, role) values
    ('Бакыт Утюжильщик',    '+996700000005', crypt('5555', gen_salt('bf')), 'ironer')       returning id into iron_id;  -- PIN 5555
  insert into employees(full_name, phone, pin_hash, role) values
    ('Жанара Упаковщица',   '+996700000006', crypt('6666', gen_salt('bf')), 'packer')       returning id into pack_id;  -- PIN 6666

  -- ---------- Партии ----------
  -- Ткань считается в USD: количество (метр/кг) × цена USD × курс = сом.
  -- 1) Футболка холодок — 500 шт, на этапе пошива. 250 кг × $2 × 89 = 44 500 сом
  insert into batches(name, client_name, product_type, fabric_name, fabric_unit, fabric_quantity,
                      fabric_price_usd, usd_rate, fabric_cost_usd, fabric_cost,
                      planned_quantity, actual_quantity, sale_price_per_unit, current_stage, status, created_by, notes)
    values ('Футболка холодок', 'ТД «Манас»', 'Футболка', 'Холодок', 'kg', 250,
            2.00, 89, 500, 44500,
            500, null, 350, 'sewing', 'active', admin_id, 'Срочный заказ')
    returning id into b1;

  -- 2) Поло мужское — 300 шт, на этапе раскроя. 240 м × $1.5 × 89 = 32 040 сом
  insert into batches(name, client_name, product_type, fabric_name, fabric_unit, fabric_quantity,
                      fabric_price_usd, usd_rate, fabric_cost_usd, fabric_cost,
                      planned_quantity, actual_quantity, sale_price_per_unit, current_stage, status, created_by)
    values ('Поло мужское', 'Магазин «Стиль»', 'Поло', 'Пике', 'meter', 240,
            1.50, 89, 360, 32040,
            300, null, 520, 'cutting', 'active', admin_id)
    returning id into b2;

  -- 3) Худи базовый — 150 шт, на этапе раскроя. 180 кг × $3 × 89 = 48 060 сом
  insert into batches(name, client_name, product_type, fabric_name, fabric_unit, fabric_quantity,
                      fabric_price_usd, usd_rate, fabric_cost_usd, fabric_cost,
                      planned_quantity, actual_quantity, sale_price_per_unit, current_stage, status, created_by)
    values ('Худи базовый', 'Частный заказ', 'Худи', 'Футер 3-нитка', 'kg', 180,
            3.00, 89, 540, 48060,
            150, null, 890, 'cutting', 'active', admin_id)
    returning id into b3;

  -- ---------- Задачи и работа: Партия 1 (Футболка) ----------
  -- Раскрой — выполнен полностью
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, completed_quantity, rate_per_unit, status, completed_at)
    values (b1, cut_id, admin_id, 'cutting', 500, 500, 6, 'completed', now()) returning id into t_cut1;
  insert into work_records(task_id, batch_id, employee_id, stage, quantity, rate_per_unit, total_amount, created_by)
    values (t_cut1, b1, cut_id, 'cutting', 500, 6, 3000, admin_id);

  -- Пошив — частично (3 сдачи: 30/40/30 как в примере ТЗ, по 15 сом)
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, completed_quantity, rate_per_unit, status)
    values (b1, sew_id, admin_id, 'sewing', 500, 100, 15, 'in_progress') returning id into t_sew1;
  insert into work_records(task_id, batch_id, employee_id, stage, quantity, rate_per_unit, total_amount, created_by, created_at) values
    (t_sew1, b1, sew_id, 'sewing', 30, 15, 450, admin_id, now() - interval '2 days'),
    (t_sew1, b1, sew_id, 'sewing', 40, 15, 600, admin_id, now() - interval '1 days'),
    (t_sew1, b1, sew_id, 'sewing', 30, 15, 450, admin_id, now());

  -- Утюжка — назначена, не начата
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, rate_per_unit, status)
    values (b1, iron_id, admin_id, 'ironing', 500, 4, 'pending') returning id into t_iron1;

  -- Технолог — задача по партии (ставка 3 сом/шт), частично 200
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, completed_quantity, rate_per_unit, status)
    values (b1, tech_id, admin_id, 'technologist', 500, 200, 3, 'in_progress') returning id into t_tech1;
  insert into work_records(task_id, batch_id, employee_id, stage, quantity, rate_per_unit, total_amount, created_by)
    values (t_tech1, b1, tech_id, 'technologist', 200, 3, 600, admin_id);

  -- ---------- Задачи: Партия 2 (Поло) ----------
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, completed_quantity, rate_per_unit, status)
    values (b2, cut_id, admin_id, 'cutting', 300, 120, 7, 'in_progress') returning id into t_cut2;
  insert into work_records(task_id, batch_id, employee_id, stage, quantity, rate_per_unit, total_amount, created_by)
    values (t_cut2, b2, cut_id, 'cutting', 120, 7, 840, admin_id);
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, rate_per_unit, status)
    values (b2, sew_id, admin_id, 'sewing', 300, 22, 'pending') returning id into t_sew2;

  -- ---------- Задачи: Партия 3 (Худи) ----------
  insert into tasks(batch_id, employee_id, assigned_by, stage, planned_quantity, rate_per_unit, status)
    values (b3, cut_id, admin_id, 'cutting', 150, 12, 'pending') returning id into t_cut3;

  -- ---------- Расходы ----------
  -- Стоимость ткани учитывается в самой партии (fabric_cost), здесь её НЕТ,
  -- чтобы не было двойного учёта. Тут — прочие расходы.
  insert into expenses(batch_id, category, amount, description, created_by) values
    (b1, 'accessories', 8000, 'Нитки, этикетки', admin_id),
    (b2, 'accessories', 5000, 'Пуговицы, нитки', admin_id),
    (null, 'rent', 45000, 'Аренда цеха за месяц', admin_id),
    (null, 'utilities', 12000, 'Электричество и вода', admin_id);

  -- ---------- Выплаты ----------
  insert into payments(employee_id, amount, type, batch_id, note, created_by) values
    (sew_id, 1000, 'advance', null, 'Аванс', admin_id),
    (cut_id, 2000, 'salary', b1, 'Выплата за раскрой', admin_id),
    (cut_id, 200, 'bonus', null, 'Премия за скорость', admin_id);

  -- ---------- Запрос аванса (pending) ----------
  insert into advance_requests(employee_id, amount, comment)
    values (sew_id, 1500, 'Нужно на лекарства');

  -- ---------- Уведомление admin ----------
  perform notify(null, 'admin', 'Демо-данные загружены. Добро пожаловать в ЦЕХ!', 'system');
end $$;
