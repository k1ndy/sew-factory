// Производство: список активных партий, архив, создание партии (admin).
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import { esc, money, num, emptyState, openSheet, closeSheet, buildForm, formValues, toast, toastError, withBusy } from '../ui.js';
import { navigate } from '../router.js';
import { isAdmin, isManager, canCreateBatch } from '../store.js';

export async function renderProduction(c) {
  let archived = false;

  async function load() {
    const batches = await rpc('list_batches', { p_archived: archived });
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_production'))}</h2>
          ${canCreateBatch() ? `<button class="btn btn-primary btn-sm" id="new-batch">+ ${esc(t('prod_new_batch'))}</button>` : ''}
        </div>
        <div class="tabs">
          <button class="tab ${!archived ? 'active' : ''}" data-tab="active">${esc(t('prod_active'))}</button>
          <button class="tab ${archived ? 'active' : ''}" data-tab="archive">${esc(t('prod_archive'))}</button>
        </div>
        <div id="batch-list">
          ${batches.length ? batches.map(batchCard).join('') : emptyState()}
        </div>
      </div>`;

    c.querySelector('[data-tab="active"]').onclick = () => { archived = false; load(); };
    c.querySelector('[data-tab="archive"]').onclick = () => { archived = true; load(); };
    const nb = c.querySelector('#new-batch');
    if (nb) nb.onclick = () => openBatchForm(load);
    c.querySelectorAll('[data-batch]').forEach((el) => {
      el.onclick = () => navigate('/batch/' + el.dataset.batch);
    });
  }
  await load();
}

// подпись количества: факт (после раскроя) → план → «не указано»
function qtyLabel(b) {
  if (b.actual_quantity != null) return `${esc(t('batch_actual'))}: ${num(b.actual_quantity)} ${esc(t('pcs'))}`;
  if (b.planned_quantity != null) return `${esc(t('batch_planned'))}: ${num(b.planned_quantity)} ${esc(t('pcs'))}`;
  return `<span class="muted">${esc(t('batch_no_qty'))}</span>`;
}

function batchCard(b) {
  return `<div class="card clickable batch-card" data-batch="${b.id}">
    <div class="row between">
      <b>${esc(b.name)}</b>
      <span class="badge badge-${b.status}">${esc(label.bstatus(b.status))}</span>
    </div>
    <div class="muted small">${esc(b.client_name || '')} ${b.product_type ? '· ' + esc(b.product_type) : ''}</div>
    <div class="row between mt8">
      <span class="badge badge-stage">${esc(label.stage(b.current_stage))}</span>
      <span class="muted small">${qtyLabel(b)}</span>
    </div>
  </div>`;
}

export function openBatchForm(onDone, existing) {
  const money = isAdmin();   // денежные поля только у владельца
  const unitOpts = [
    { value: 'meter', label: t('unit_meter') },
    { value: 'kg', label: t('unit_kg') },
  ];

  const fields = [
    { name: 'name', label: t('batch_name'), required: true, value: existing?.name },
    { name: 'client', label: t('batch_client'), value: existing?.client_name },
    { name: 'product', label: t('batch_product'), value: existing?.product_type },
    { name: 'fabric_name', label: t('batch_fabric'), value: existing?.fabric_name },
    { name: 'fabric_unit', label: t('batch_fabric_unit'), type: 'select', options: unitOpts, value: existing?.fabric_unit || 'meter' },
    { name: 'fabric_quantity', label: t('batch_fabric_qty'), type: 'number', step: '0.01', min: '0', value: existing?.fabric_quantity },
  ];
  if (money) {
    fields.push(
      { name: 'fabric_price_usd', label: t('batch_fabric_price_usd'), type: 'number', step: '0.01', min: '0', value: existing?.fabric_price_usd },
      { name: 'usd_rate', label: t('batch_usd_rate'), type: 'number', step: '0.0001', min: '0', value: existing?.usd_rate },
    );
  }
  // План необязателен; количество (факт) забивается после раскроя — только при редактировании
  if (existing) {
    fields.push({ name: 'planned', label: t('batch_planned'), type: 'number', min: '1', value: existing?.planned_quantity });
    fields.push({ name: 'actual', label: t('batch_actual') + ' (' + t('after_cutting') + ')', type: 'number', min: '0', value: existing?.actual_quantity });
  }
  if (money) fields.push({ name: 'sale_price', label: t('batch_sale_price'), type: 'number', step: '0.01', min: '0', value: existing?.sale_price_per_unit });
  fields.push({ name: 'notes', label: t('batch_notes'), type: 'textarea', value: existing?.notes });

  const form = buildForm(fields, { submitLabel: t('save') });
  openSheet({ title: existing ? t('edit') : t('prod_new_batch'), content: form });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        const common = {
          p_name: v.name, p_client: v.client, p_product: v.product, p_fabric_name: v.fabric_name,
          p_fabric_unit: v.fabric_unit, p_fabric_quantity: numOrNull(v.fabric_quantity),
          p_fabric_price_usd: money ? numOrNull(v.fabric_price_usd) : null,
          p_usd_rate: money ? numOrNull(v.usd_rate) : null,
          p_planned_quantity: v.planned ? parseInt(v.planned, 10) : null,
          p_sale_price: money ? numOrNull(v.sale_price) : null,
          p_notes: v.notes,
        };
        if (existing) {
          await rpc('update_batch', { p_id: existing.id, ...common, p_actual_quantity: numOrNull(v.actual) });
        } else {
          await rpc('create_batch', common);
        }
        closeSheet();
        toast(t('toast_saved'));
        onDone && onDone();
      } catch (err) { toastError(err); }
    });
  };
}

function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
