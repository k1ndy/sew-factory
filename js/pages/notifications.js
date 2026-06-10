// Уведомления: список, прочитано/не прочитано, переход к связанной сущности.
import { rpc } from '../api.js';
import { t } from '../i18n.js';
import { esc, fmtDateTime, emptyState, toast, toastError } from '../ui.js';
import { navigate } from '../router.js';
import { store } from '../store.js';

const ICONS = {
  batch_created: '📦', task_assigned: '📋', task_completed: '✅', stage_completed: '➡️',
  batch_completed: '🏁', advance_requested: '📥', advance_approved: '👍', advance_rejected: '👎',
  payment_created: '💵', expense_created: '🧾', system: 'ℹ️',
};

export async function renderNotifications(c) {
  async function load() {
    const list = await rpc('list_notifications', {});
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_notifications'))}</h2>
          <button class="btn btn-ghost btn-sm" id="mark-all">${esc(t('notif_mark_all'))}</button>
        </div>
        <div id="notif-list">
          ${list.length ? list.map(notifRow).join('') : emptyState(t('notif_empty'))}
        </div>
      </div>`;

    c.querySelector('#mark-all').onclick = async () => {
      try { await rpc('mark_all_read', {}); store.unread = 0; updateBadge(); load(); }
      catch (e) { toastError(e); }
    };
    c.querySelectorAll('[data-notif]').forEach((el) => {
      el.onclick = async () => {
        const n = list.find((x) => x.id === el.dataset.notif);
        if (!n.is_read) { try { await rpc('mark_notification_read', { p_id: n.id }); } catch {} }
        if (n.related_batch_id) navigate('/batch/' + n.related_batch_id);
        else if (n.related_advance_request_id) navigate('/advances');
        else { n.is_read = true; load(); }
      };
    });
  }
  await load();
}

function updateBadge() {
  const badge = document.getElementById('bell-badge');
  if (badge) { badge.hidden = !store.unread; badge.textContent = store.unread; }
}

function notifRow(n) {
  return `<div class="card notif ${n.is_read ? '' : 'unread'}" data-notif="${n.id}">
    <div class="row">
      <span class="notif-icon">${ICONS[n.type] || 'ℹ️'}</span>
      <div class="grow">
        <div>${esc(n.message)}</div>
        <div class="muted small mt8">${fmtDateTime(n.created_at)}</div>
      </div>
      ${n.is_read ? '' : '<span class="unread-dot"></span>'}
    </div>
  </div>`;
}
