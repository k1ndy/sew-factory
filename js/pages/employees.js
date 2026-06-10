// Сотрудники (admin): список, добавление, редактирование, увольнение.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import {
  esc, emptyState, openSheet, closeSheet, buildForm, formValues,
  toast, toastError, confirmAction, withBusy,
} from '../ui.js';

const ROLES = ['admin', 'technologist', 'cutter', 'seamstress', 'ironer', 'packer'];

export async function renderEmployees(c) {
  let statusFilter = 'active';
  let roleFilter = '';

  async function load() {
    const list = await rpc('list_employees', {
      p_status: statusFilter || null, p_role: roleFilter || null,
    });
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_employees'))}</h2>
          <button class="btn btn-primary btn-sm" id="add-emp">+ ${esc(t('emp_add'))}</button>
        </div>
        <div class="tabs">
          <button class="tab ${statusFilter === 'active' ? 'active' : ''}" data-st="active">${esc(t('emp_active'))}</button>
          <button class="tab ${statusFilter === 'dismissed' ? 'active' : ''}" data-st="dismissed">${esc(t('emp_dismissed'))}</button>
        </div>
        <select class="select-filter" id="role-filter">
          <option value="">${esc(t('all'))}</option>
          ${ROLES.map((r) => `<option value="${r}" ${r === roleFilter ? 'selected' : ''}>${esc(label.role(r))}</option>`).join('')}
        </select>
        <div id="emp-list">
          ${list.length ? list.map(empCard).join('') : emptyState()}
        </div>
      </div>`;

    c.querySelector('[data-st="active"]').onclick = () => { statusFilter = 'active'; load(); };
    c.querySelector('[data-st="dismissed"]').onclick = () => { statusFilter = 'dismissed'; load(); };
    c.querySelector('#role-filter').onchange = (e) => { roleFilter = e.target.value; load(); };
    c.querySelector('#add-emp').onclick = () => openEmpForm(load);
    c.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = () => openEmpForm(load, list.find((x) => x.id === el.dataset.edit));
    });
    c.querySelectorAll('[data-dismiss]').forEach((el) => {
      el.onclick = async () => {
        if (await confirmAction(t('confirm_dismiss'), { danger: true })) {
          try { await rpc('dismiss_employee', { p_id: el.dataset.dismiss }); toast(t('toast_done')); load(); }
          catch (e) { toastError(e); }
        }
      };
    });
    c.querySelectorAll('[data-reactivate]').forEach((el) => {
      el.onclick = async () => {
        try { await rpc('reactivate_employee', { p_id: el.dataset.reactivate }); toast(t('toast_done')); load(); }
        catch (e) { toastError(e); }
      };
    });
  }
  await load();
}

function empCard(e) {
  return `<div class="card">
    <div class="row between">
      <b>${esc(e.full_name)}</b>
      <span class="badge badge-role">${esc(label.role(e.role))}</span>
    </div>
    <div class="muted small">${esc(e.phone)}</div>
    <div class="row gap mt8">
      <button class="btn btn-ghost btn-sm" data-edit="${e.id}">✏️ ${esc(t('edit'))}</button>
      ${e.status === 'active'
        ? `<button class="btn btn-danger btn-sm" data-dismiss="${e.id}">${esc(t('emp_dismiss'))}</button>`
        : `<button class="btn btn-ghost btn-sm" data-reactivate="${e.id}">${esc(t('emp_reactivate'))}</button>`}
    </div>
  </div>`;
}

function openEmpForm(onDone, existing) {
  const roleOpts = ROLES.map((r) => ({ value: r, label: label.role(r) }));
  const form = buildForm([
    { name: 'full_name', label: t('emp_name'), required: true, value: existing?.full_name },
    { name: 'phone', label: t('emp_phone'), type: 'tel', required: true, value: existing?.phone, placeholder: '+996...' },
    { name: 'role', label: t('emp_role'), type: 'select', options: roleOpts, value: existing?.role || 'seamstress' },
    { name: 'pin', label: existing ? t('emp_pin_keep') : t('emp_pin'), type: 'password', inputmode: 'numeric',
      required: !existing, placeholder: '••••' },
  ], { submitLabel: t('save') });

  openSheet({ title: existing ? t('edit') : t('emp_add'), content: form });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        if (existing) {
          await rpc('update_employee', {
            p_id: existing.id, p_full_name: v.full_name, p_phone: v.phone,
            p_role: v.role, p_pin: v.pin ? v.pin : null,
          });
        } else {
          await rpc('create_employee', {
            p_full_name: v.full_name, p_phone: v.phone, p_pin: v.pin, p_role: v.role,
          });
        }
        closeSheet(); toast(t('toast_saved')); onDone();
      } catch (err) { toastError(err); }
    });
  };
}
