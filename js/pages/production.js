// Производство: список активных партий, архив, создание партии (admin).
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import { esc, money, num, emptyState, openSheet, closeSheet, buildForm, formValues, toast, toastError, withBusy } from '../ui.js';
import { navigate } from '../router.js';
import { isAdmin, isManager } from '../store.js';

export async function renderProduction(c) {
  let archived = false;

  async function load() {
    const batches = await rpc('list_batches', { p_archived: archived });
    c.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h2 class="page-title">${esc(t('nav_production'))}</h2>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="new-batch">+ ${esc(t('prod_new_batch'))}</button>` : ''}
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

function batchCard(b) {
  const qty = b.actual_quantity || b.planned_quantity;
  return `<div class="card clickable batch-card" data-batch="${b.id}">
    <div class="row between">
      <b>${esc(b.name)}</b>
      <span class="badge badge-${b.status}">${esc(label.bstatus(b.status))}</span>
    </div>
    <div class="muted small">${esc(b.client_name || '')} ${b.product_type ? '· ' + esc(b.product_type) : ''}</div>
    <div class="row between mt8">
      <span class="badge badge-stage">${esc(label.stage(b.current_stage))}</span>
      <span class="muted small">${esc(t('batch_planned'))}: ${num(b.planned_quantity)} ${esc(t('pcs'))}</span>
    </div>
  </div>`;
}

export function openBatchForm(onDone, existing) {
  const form = buildForm([
    { name: 'name', label: t('batch_name'), required: true, value: existing?.name },
    { name: 'client', label: t('batch_client'), value: existing?.client_name },
    { name: 'product', label: t('batch_product'), value: existing?.product_type },
    { name: 'fabric_name', label: t('batch_fabric'), value: existing?.fabric_name },
    { name: 'fabric_meters', label: t('batch_fabric_meters'), type: 'number', step: '0.01', min: '0', value: existing?.fabric_meters },
    { name: 'fabric_cost', label: t('batch_fabric_cost'), type: 'number', step: '0.01', min: '0', value: existing?.fabric_cost ?? 0 },
    { name: 'planned', label: t('batch_planned'), type: 'number', min: '1', required: true, value: existing?.planned_quantity },
    ...(existing ? [{ name: 'actual', label: t('batch_actual'), type: 'number', min: '0', value: existing?.actual_quantity }] : []),
    { name: 'sale_price', label: t('batch_sale_price'), type: 'number', step: '0.01', min: '0', value: existing?.sale_price_per_unit },
    { name: 'notes', label: t('batch_notes'), type: 'textarea', value: existing?.notes },
  ], { submitLabel: t('save') });

  const { close } = openSheet({ title: existing ? t('edit') : t('prod_new_batch'), content: form });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        if (existing) {
          await rpc('update_batch', {
            p_id: existing.id, p_name: v.name, p_client: v.client, p_product: v.product,
            p_fabric_name: v.fabric_name, p_fabric_meters: numOrNull(v.fabric_meters),
            p_fabric_cost: numOrNull(v.fabric_cost) || 0, p_planned_quantity: parseInt(v.planned, 10),
            p_actual_quantity: numOrNull(v.actual), p_sale_price: numOrNull(v.sale_price), p_notes: v.notes,
          });
        } else {
          await rpc('create_batch', {
            p_name: v.name, p_client: v.client, p_product: v.product, p_fabric_name: v.fabric_name,
            p_fabric_meters: numOrNull(v.fabric_meters), p_fabric_cost: numOrNull(v.fabric_cost) || 0,
            p_planned_quantity: parseInt(v.planned, 10), p_sale_price: numOrNull(v.sale_price), p_notes: v.notes,
          });
        }
        closeSheet();
        toast(t('toast_saved'));
        onDone && onDone();
      } catch (err) { toastError(err); }
    });
  };
}

function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
