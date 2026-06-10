// Зарплаты: admin видит всех; сотрудник — только себя.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import {
  esc, money, num, fmtDate, fmtDateTime, emptyState, openSheet, closeSheet,
  buildForm, formValues, toast, toastError, withBusy,
} from '../ui.js';
import { navigate } from '../router.js';

// --- список всех (admin) ---
export async function renderSalaries(c) {
  const list = await rpc('list_salaries', {});
  c.innerHTML = `
    <div class="page">
      <h2 class="page-title">${esc(t('nav_salaries'))}</h2>
      <div id="sal-list">
        ${list.length ? list.map((row) => {
          const s = row.summary; const e = row.employee;
          return `<div class="card clickable" data-emp="${e.id}">
            <div class="row between">
              <div><b>${esc(e.full_name)}</b><div class="muted small">${esc(label.role(e.role))}</div></div>
              <div class="ta-right">
                <div class="sal-balance ${Number(s.balance) >= 0 ? '' : 'neg'}">${money(s.balance)}</div>
                <div class="muted small">${esc(t('sal_balance'))}</div>
              </div>
            </div>
          </div>`;
        }).join('') : emptyState()}
      </div>
    </div>`;
  c.querySelectorAll('[data-emp]').forEach((el) => {
    el.onclick = () => navigate('/salary/' + el.dataset.emp);
  });
}

// --- детальная карточка (admin) ---
export async function renderSalaryOne(c, { id }) {
  const data = await rpc('get_salary', { p_employee_id: id });
  drawSalary(c, data, true);
}

// --- своя зарплата (любой сотрудник) ---
export async function renderMySalary(c) {
  const data = await rpc('get_salary', {});
  drawSalary(c, data, false);
}

function drawSalary(c, data, admin) {
  const s = data.summary;
  const e = data.employee;
  c.innerHTML = `
    <div class="page">
      ${admin ? `<button class="btn btn-ghost btn-sm" id="back">← ${esc(t('back'))}</button>` : ''}
      <h2 class="page-title mt8">${admin ? esc(e.full_name) : esc(t('prof_my_salary'))}</h2>

      <div class="stat-grid">
        ${stat(t('sal_accrued'), money(s.accrued))}
        ${stat(t('sal_paid'), money(s.paid))}
        ${stat(t('sal_bonus'), money(s.bonus))}
        ${stat(t('sal_penalty'), money(s.penalty))}
      </div>
      <div class="card balance-card ${Number(s.balance) >= 0 ? '' : 'neg'}">
        <div class="muted">${esc(t('sal_balance'))}</div>
        <div class="balance-big">${money(s.balance)}</div>
      </div>

      ${admin ? `
        <div class="row gap wrap">
          <button class="btn btn-primary btn-sm" data-pay="salary">${esc(t('sal_pay_salary'))}</button>
          <button class="btn btn-primary btn-sm" data-pay="advance">${esc(t('sal_pay_advance'))}</button>
          <button class="btn btn-ghost btn-sm" data-pay="bonus">${esc(t('sal_bonus_btn'))}</button>
          <button class="btn btn-ghost btn-sm" data-pay="penalty">${esc(t('sal_penalty_btn'))}</button>
        </div>` : ''}

      <div class="card">
        <h3 class="card-title">${esc(t('sal_work_history'))}</h3>
        ${data.work_records.length ? data.work_records.map((w) => `
          <div class="list-row">
            <div><b>${esc(w.batch_name)}</b><div class="muted small">${esc(label.stage(w.stage))} · ${fmtDateTime(w.created_at)}</div></div>
            <div class="ta-right">${num(w.quantity)}×${num(w.rate_per_unit)}<div class="muted small">${money(w.total_amount)}</div></div>
          </div>`).join('') : emptyState()}
      </div>

      <div class="card">
        <h3 class="card-title">${esc(t('sal_pay_history'))}</h3>
        ${data.payments.length ? data.payments.map((p) => `
          <div class="list-row">
            <div><span class="badge badge-pay-${p.type}">${esc(label.pay(p.type))}</span> <span class="muted small">${fmtDate(p.date)}</span>
              ${p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}</div>
            <div class="ta-right">${money(p.amount)}</div>
          </div>`).join('') : emptyState()}
      </div>
    </div>`;

  const back = c.querySelector('#back');
  if (back) back.onclick = () => navigate('/salaries');

  c.querySelectorAll('[data-pay]').forEach((el) => {
    el.onclick = () => openPayForm(e.id, el.dataset.pay, () => renderSalaryOne(c, { id: e.id }));
  });
}

function stat(label, value) {
  return `<div class="stat"><div class="stat-value sm">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function openPayForm(employeeId, type, onDone) {
  const titles = { salary: t('sal_pay_salary'), advance: t('sal_pay_advance'), bonus: t('sal_bonus_btn'), penalty: t('sal_penalty_btn') };
  const form = buildForm([
    { name: 'amount', label: t('sal_amount'), type: 'number', step: '0.01', min: '0.01', required: true },
    { name: 'note', label: t('sal_note'), type: 'textarea' },
  ], { submitLabel: titles[type] });
  openSheet({ title: titles[type], content: form });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        await rpc('create_payment', {
          p_employee_id: employeeId, p_amount: Number(v.amount), p_type: type, p_note: v.note || null,
        });
        closeSheet(); toast(t('toast_payment_done')); onDone();
      } catch (err) { toastError(err); }
    });
  };
}
