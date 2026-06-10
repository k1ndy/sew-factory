// ---------------------------------------------------------------------
// Конфигурация подключения к Supabase.
// ЗАПОЛНИТЕ эти два значения данными вашего проекта Supabase:
//   Project Settings -> API -> Project URL и anon public key.
// Файл редактируется напрямую (приложение без сборки).
// ---------------------------------------------------------------------
export const SUPABASE_URL = window.__ENV__?.SUPABASE_URL || 'https://vtmcgzzpiqgxremzldnh.supabase.co';
export const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bWNnenpwaXFneHJlbXpsZG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDkyNjksImV4cCI6MjA5NjYyNTI2OX0.V0T1migQJCacZveVIXEMDcglSD0oxfVO8Urwp_TvUwU';

export const APP_VERSION = '1.0.0';
