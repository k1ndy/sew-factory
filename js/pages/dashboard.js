// Дашборд администратора.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import { esc, money, num, fmtDateTime, emptyState } from '../ui.js';
import { navigate } from '../router.js';

export async function renderDashboard(c) {
  const d = await rpc('get_dashboard', {});
  const stages = ['cutting', 'sewing', 'ironing', 'packing'];

  c.innerHTML = `
    <div class="page">
      <h2 class="page-title">${esc(t('nav_dashboard'))}</h2>

      <div class="stat-grid">
        ${stat(t('dash_total_batches'), d.total_batches)}
        ${stat(t('dash_active'), d.active_batches)}
        ${stat(t('dash_completed'), d.completed_batches)}
        ${stat(t('dash_accrued'), money(d.total_accrued))}
        ${stat(t('dash_expenses'), money(d.total_expenses))}
        ${stat(t('dash_balance'), money(d.total_balance))}
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('dash_by_stage'))}</h3>
        <div class="chips">
          ${stages.map((s) => `<span class="chip">${esc(label.stage(s))}: <b>${d.by_stage[s] || 0}</b></span>`).join('')}
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('dash_recent_batches'))}</h3>
        <div id="recent-batches">
          ${d.recent_batches.length ? d.recent_batches.map(batchRow).join('') : emptyState()}
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('dash_recent_work'))}</h3>
        ${d.recent_work.length ? d.recent_work.map((w) => `
          <div class="list-row">
            <div><b>${esc(w.employee_name)}</b><div class="muted small">${esc(w.batch_name)}</div></div>
            <div class="ta-right">+${num(w.quantity)} ${esc(t('pcs'))}<div class="muted small">${money(w.total_amount)}</div></div>
          </div>`).join('') : emptyState()}
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('dash_recent_adv'))}</h3>
        ${d.recent_advances.length ? d.recent_advances.map((a) => `
          <div class="list-row">
            <div><b>${esc(a.employee_name)}</b><div class="muted small">${fmtDateTime(a.created_at)}</div></div>
            <div class="ta-right">${money(a.amount)}</div>
          </div>`).join('') : emptyState()}
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('dash_staff'))}</h3>
        <div class="chips">
          ${d.employees_summary.map((s) => `<span class="chip">${esc(label.role(s.role))}: <b>${s.count}</b></span>`).join('')}
        </div>
      </div>
    </div>`;

  c.querySelectorAll('[data-batch]').forEach((el) => {
    el.onclick = () => navigate('/batch/' + el.dataset.batch);
  });
}

function stat(label, value) {
  return `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function batchRow(b) {
  return `<div class="list-row clickable" data-batch="${b.id}">
    <div><b>${esc(b.name)}</b><div class="muted small">${esc(label.stage(b.current_stage))}${b.planned_quantity != null ? ' · ' + num(b.planned_quantity) + ' ' + t('pcs') : ''}</div></div>
    <span class="badge badge-${b.status}">${esc(label.bstatus(b.status))}</span>
  </div>`;
}
