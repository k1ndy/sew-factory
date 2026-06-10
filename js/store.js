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
export function isTechnologist() { return store.user && store.user.role === 'technologist'; }
export function isCutter() { return store.user && store.user.role === 'cutter'; }
export function isWorker() { return store.user && ['cutter', 'seamstress', 'ironer', 'packer'].includes(store.user.role); }
// кто управляет зарплатами (видит всех и создаёт выплаты)
export function isSalaryMgr() { return store.user && ['admin', 'technologist'].includes(store.user.role); }
// кто может создавать партии (владелец и закройщик)
export function canCreateBatch() { return store.user && ['admin', 'technologist', 'cutter'].includes(store.user.role); }
