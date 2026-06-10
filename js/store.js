// ---------------------------------------------------------------------
// Лёгкое глобальное состояние сессии. Без перезагрузки всех данных —
// страницы обновляют локальные данные сами после действий.
// ---------------------------------------------------------------------
export const store = {
  user: null,          // текущий сотрудник { id, full_name, role, ... }
  unread: 0,           // непрочитанные уведомления
};

export function isManager() { return store.user && ['admin', 'technologist'].includes(store.user.role); }
export function isAdmin() { return store.user && store.user.role === 'admin'; }
export function isWorker() { return store.user && ['cutter', 'seamstress', 'ironer', 'packer'].includes(store.user.role); }
