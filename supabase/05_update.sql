-- =====================================================================
-- МИГРАЦИЯ для уже работающей БД (если 01–03 уже выполнены).
-- Добавляет валютную модель ткани (USD + курс) и меняет права.
--
-- Порядок применения:
--   1) Выполнить ЭТОТ файл (05_update.sql)
--   2) Заново выполнить 02_functions.sql (create or replace + новые гранты)
--   3) (по желанию) заново выполнить 03_seed.sql — обновит демо-данные
--
-- При ЧИСТОЙ установке этот файл не нужен — всё уже в 01/02/03.
-- =====================================================================

-- ткань: метраж -> количество, + единица/цена USD/курс/итоги
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name='batches' and column_name='fabric_meters') then
    alter table batches rename column fabric_meters to fabric_quantity;
  end if;
end $$;

alter table batches add column if not exists fabric_unit text not null default 'meter';
alter table batches add column if not exists fabric_price_usd numeric(14,2);
alter table batches add column if not exists usd_rate numeric(14,4);
alter table batches add column if not exists fabric_cost_usd numeric(14,2) not null default 0;

-- план (planned_quantity) теперь необязателен: количество известно после
-- раскроя (факт). Снимаем NOT NULL и разрешаем NULL в check-ограничении.
alter table batches alter column planned_quantity drop not null;
alter table batches drop constraint if exists batches_planned_quantity_check;
alter table batches add constraint batches_planned_quantity_check
  check (planned_quantity is null or planned_quantity > 0);

-- сигнатуры этих функций изменились — удаляем старые версии,
-- чтобы 02_functions.sql создал новые без конфликта перегрузок
drop function if exists create_batch(uuid,text,text,text,text,numeric,numeric,int,numeric,text);
drop function if exists update_batch(uuid,uuid,text,text,text,text,numeric,numeric,int,int,numeric,text);
drop function if exists create_batch(uuid,text,text,text,text,text,numeric,numeric,numeric,int,numeric,text);
drop function if exists update_batch(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,int,int,numeric,text);

-- дальше выполните 02_functions.sql
