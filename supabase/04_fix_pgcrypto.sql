-- =====================================================================
-- ФИКС: в Supabase расширение pgcrypto живёт в схеме `extensions`,
-- а функции были зафиксированы на search_path = public, из-за чего
-- crypt()/gen_salt() не находились (ошибка "function crypt(text,text)
-- does not exist"). Добавляем схему extensions в search_path трёх
-- функций, которые шифруют PIN.
--
-- Выполните этот файл в Supabase SQL Editor.
-- (Уже учтено в обновлённом 02_functions.sql — при чистой установке
--  отдельно запускать не нужно.)
-- =====================================================================

alter function login(text, text)
  set search_path = public, extensions;

alter function create_employee(uuid, text, text, text, text)
  set search_path = public, extensions;

alter function update_employee(uuid, uuid, text, text, text, text)
  set search_path = public, extensions;
