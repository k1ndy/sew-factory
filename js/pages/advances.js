// Запросы аванса: сотрудник создаёт; admin одобряет/отклоняет/выплачивает.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import {
  esc, money, fmtDateTime, emptyState, openSheet, closeSheet, buildForm,
  formValues, toast, toastError, confirmAction, withBusy,
} from '../ui.js';
import { isAdmin } from '../store.js';

export async function renderAdvances(c) {
  async function load() {
    const list = await rpc('list_advance_requests', {});
    const admin = isAdmin();
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_advances'))}</h2>
          <button class="btn btn-primary btn-sm" id="req">+ ${esc(t('adv_request'))}</button>
        </div>
        <div id="adv-list">
          ${list.length ? list.map((a) => advCard(a, admin)).join('') : emptyState()}
        </div>
      </div>`;

    c.querySelector('#req').onclick = () => openRequestForm(load);

    if (admin) {
      c.querySelectorAll('[data-act]').forEach((el) => {
        el.onclick = async () => {
          const id = el.dataset.id; const act = el.dataset.act;
          if (act === 'reject' && !(await confirmAction(t('adv_reject') + '?', { danger: true }))) return;
          try {
            await rpc('resolve_advance_request', { p_id: id, p_action: act });
            toast(t('toast_done')); load();
          } catch (e) { toastError(e); }
        };
      });
    }
  }
  await load();
}

function advCard(a, admin) {
  return `<div class="card">
    <div class="row between">
      <div>
        ${admin ? `<b>${esc(a.employee_name)}</b>` : ''}
        <div class="${admin ? 'muted small' : ''}">${money(a.amount)}</div>
      </div>
      <span class="badge badge-adv-${a.status}">${esc(label.adv(a.status))}</span>
    </div>
    ${a.comment ? `<div class="mt8 small">${esc(a.comment)}</div>` : ''}
    ${a.admin_comment ? `<div class="muted small mt8">↳ ${esc(a.admin_comment)}</div>` : ''}
    <div class="muted small mt8">${fmtDateTime(a.created_at)}</div>
    ${admin && a.status === 'pending' ? `
      <div class="row gap mt8">
        <button class="btn btn-primary btn-sm" data-act="approve" data-id="${a.id}">${esc(t('adv_approve'))}</button>
        <button class="btn btn-danger btn-sm" data-act="reject" data-id="${a.id}">${esc(t('adv_reject'))}</button>
      </div>` : ''}
    ${admin && a.status === 'approved' ? `
      <button class="btn btn-primary btn-sm mt8" data-act="paid" data-id="${a.id}">${esc(t('adv_pay'))}</button>` : ''}
  </div>`;
}

export function openRequestForm(onDone) {
  const form = buildForm([
    { name: 'amount', label: t('adv_amount'), type: 'number', step: '0.01', min: '0.01', required: true },
    { name: 'comment', label: t('adv_comment'), type: 'textarea' },
  ], { submitLabel: t('adv_request') });
  openSheet({ title: t('adv_request'), content: form });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        await rpc('create_advance_request', { p_amount: Number(v.amount), p_comment: v.comment || null });
        closeSheet(); toast(t('toast_advance_requested')); onDone && onDone();
      } catch (err) { toastError(err); }
    });
  };
}
