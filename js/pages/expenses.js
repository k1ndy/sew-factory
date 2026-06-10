// Расходы (admin): список, фильтры, добавление, общая сумма.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import {
  esc, money, fmtDate, emptyState, openSheet, closeSheet, buildForm,
  formValues, toast, toastError, withBusy,
} from '../ui.js';

const CATS = ['fabric', 'accessories', 'logistics', 'rent', 'utilities', 'salary', 'repair', 'other'];

export async function renderExpenses(c) {
  let catFilter = '';
  let batchFilter = '';
  const batches = await rpc('list_batches', { p_archived: false });

  async function load() {
    const list = await rpc('list_expenses', {
      p_category: catFilter || null, p_batch_id: batchFilter || null,
    });
    const total = list.reduce((s, x) => s + Number(x.amount), 0);
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_expenses'))}</h2>
          <button class="btn btn-primary btn-sm" id="add-exp">+ ${esc(t('exp_add'))}</button>
        </div>
        <div class="row gap wrap">
          <select class="select-filter" id="cat-filter">
            <option value="">${esc(t('all'))}</option>
            ${CATS.map((x) => `<option value="${x}" ${x === catFilter ? 'selected' : ''}>${esc(label.cat(x))}</option>`).join('')}
          </select>
          <select class="select-filter" id="batch-filter">
            <option value="">${esc(t('all'))}</option>
            ${batches.map((b) => `<option value="${b.id}" ${b.id === batchFilter ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
        </div>
        <div class="card total-bar"><span>${esc(t('exp_total'))}</span><b>${money(total)}</b></div>
        <div id="exp-list">
          ${list.length ? list.map(expCard).join('') : emptyState()}
        </div>
      </div>`;

    c.querySelector('#cat-filter').onchange = (e) => { catFilter = e.target.value; load(); };
    c.querySelector('#batch-filter').onchange = (e) => { batchFilter = e.target.value; load(); };
    c.querySelector('#add-exp').onclick = () => openExpForm(batches, load);
  }
  await load();
}

function expCard(x) {
  return `<div class="card">
    <div class="row between">
      <span class="badge badge-cat">${esc(label.cat(x.category))}</span>
      <b>${money(x.amount)}</b>
    </div>
    ${x.description ? `<div class="mt8">${esc(x.description)}</div>` : ''}
    <div class="muted small mt8">${fmtDate(x.date)}${x.batch_name ? ' · ' + esc(x.batch_name) : ' · ' + esc(t('exp_general'))}</div>
  </div>`;
}

function openExpForm(batches, onDone) {
  const catOpts = CATS.map((x) => ({ value: x, label: label.cat(x) }));
  const batchOpts = [{ value: '', label: t('exp_general') }, ...batches.map((b) => ({ value: b.id, label: b.name }))];
  const form = buildForm([
    { name: 'category', label: t('exp_category'), type: 'select', options: catOpts },
    { name: 'amount', label: t('exp_amount'), type: 'number', step: '0.01', min: '0.01', required: true },
    { name: 'description', label: t('exp_desc'), type: 'textarea' },
    { name: 'batch', label: t('exp_batch'), type: 'select', options: batchOpts },
    { name: 'date', label: t('exp_date'), type: 'date', value: new Date().toISOString().slice(0, 10) },
  ], { submitLabel: t('save') });

  openSheet({ title: t('exp_add'), content: form });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        await rpc('create_expense', {
          p_category: v.category, p_amount: Number(v.amount), p_description: v.description || null,
          p_batch_id: v.batch || null, p_date: v.date || null,
        });
        closeSheet(); toast(t('toast_saved')); onDone();
      } catch (err) { toastError(err); }
    });
  };
}
