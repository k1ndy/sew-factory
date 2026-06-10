// Карточка партии: инфо, задачи по этапам, себестоимость, перевод этапа.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import {
  esc, money, num, fmtDateTime, emptyState, openSheet, closeSheet, buildForm,
  formValues, toast, toastError, confirmAction, withBusy,
} from '../ui.js';
import { navigate } from '../router.js';
import { store, isAdmin, isManager } from '../store.js';
import { openMarkSheet } from '../work.js';
import { openBatchForm } from './production.js';

const STAGES = ['cutting', 'sewing', 'ironing', 'packing'];

export async function renderBatch(c, { id }) {
  async function load() {
    const data = await rpc('get_batch', { p_id: id });
    draw(data);
  }

  function draw(data) {
    const b = data.batch;
    const mgr = data.is_manager;
    const cost = data.cost;
    // редактировать может admin, а также закройщик — свою созданную партию
    const canEdit = isAdmin() || (store.user.role === 'cutter' && b.created_by === store.user.id);
    const tasksByStage = {};
    for (const tk of data.tasks) (tasksByStage[tk.stage] ||= []).push(tk);

    c.innerHTML = `
      <div class="page">
        <button class="btn btn-ghost btn-sm" id="back">← ${esc(t('back'))}</button>
        <div class="row between mt8">
          <h2 class="page-title">${esc(b.name)}</h2>
          <span class="badge badge-${b.status}">${esc(label.bstatus(b.status))}</span>
        </div>

        ${stageBar(b.current_stage)}

        <div class="card">
          ${info(t('batch_client'), b.client_name)}
          ${info(t('batch_product'), b.product_type)}
          ${info(t('batch_fabric'), b.fabric_name)}
          ${b.fabric_quantity != null ? info(t('batch_fabric_qty'),
              num(b.fabric_quantity) + ' ' + (b.fabric_unit === 'kg' ? t('unit_kg_short') : t('unit_meter_short'))) : ''}
          ${info(t('batch_planned'), num(b.planned_quantity) + ' ' + t('pcs'))}
          ${b.actual_quantity != null ? info(t('batch_actual'), num(b.actual_quantity) + ' ' + t('pcs')) : ''}
          ${b.notes ? info(t('batch_notes'), b.notes) : ''}
        </div>

        ${cost ? costCard(b, cost) : ''}

        <div class="card">
          <div class="row between">
            <h3 class="card-title">${esc(t('batch_tasks'))}</h3>
            ${mgr && b.status === 'active' ? `<button class="btn btn-primary btn-sm" id="add-task">+ ${esc(t('batch_add_task'))}</button>` : ''}
          </div>
          <div id="tasks">
            ${renderTasks(tasksByStage, mgr)}
          </div>
        </div>

        ${mgr && ['active', 'paused'].includes(b.status) ? `
          <button class="btn btn-primary btn-block" id="next-stage">
            ${b.current_stage === 'packing' ? '🏁 ' + esc(t('stage_completed')) : '➡️ ' + esc(t('batch_next_stage'))}
          </button>` : ''}

        ${cost ? `
          <div class="card">
            <h3 class="card-title">${esc(t('batch_history'))}</h3>
            ${data.work_records.length ? data.work_records.map((w) => `
              <div class="list-row">
                <div><b>${esc(w.employee_name)}</b><div class="muted small">${esc(label.stage(w.stage))} · ${fmtDateTime(w.created_at)}</div></div>
                <div class="ta-right">${num(w.quantity)} ${esc(t('pcs'))}<div class="muted small">${money(w.total_amount)}</div></div>
              </div>`).join('') : emptyState()}
          </div>` : ''}

        ${isAdmin() && b.status === 'completed' ? `
          <button class="btn btn-ghost btn-block" id="reopen-batch">↩️ ${esc(t('batch_reopen'))}</button>` : ''}

        ${canEdit && !['archived', 'cancelled'].includes(b.status) ? `
          <div class="row gap mt8">
            <button class="btn btn-ghost btn-sm" id="edit-batch">✏️ ${esc(t('edit'))}</button>
            ${isAdmin() ? `
              <button class="btn btn-ghost btn-sm" id="archive-batch">📦 ${esc(t('batch_archive'))}</button>
              <button class="btn btn-danger btn-sm" id="cancel-batch">✕ ${esc(t('batch_cancel'))}</button>` : ''}
          </div>` : ''}
      </div>`;

    c.querySelector('#back').onclick = () => navigate('/production');

    // отметка выполнения
    c.querySelectorAll('[data-mark]').forEach((el) => {
      el.onclick = () => {
        const task = data.tasks.find((x) => x.id === el.dataset.mark);
        openMarkSheet(task, load);
      };
    });
    // отмена задачи (менеджер)
    c.querySelectorAll('[data-cancel-task]').forEach((el) => {
      el.onclick = async () => {
        if (await confirmAction(t('confirm_cancel_task'))) {
          try { await rpc('cancel_task', { p_id: el.dataset.cancelTask }); toast(t('toast_done')); load(); }
          catch (e) { toastError(e); }
        }
      };
    });

    const addTask = c.querySelector('#add-task');
    if (addTask) addTask.onclick = () => openTaskForm(b, load);

    const next = c.querySelector('#next-stage');
    if (next) next.onclick = () => doAdvance(b, load);

    const reopen = c.querySelector('#reopen-batch');
    if (reopen) reopen.onclick = async () => {
      if (await confirmAction(t('confirm_reopen'), { danger: true })) {
        try { await rpc('reopen_batch', { p_id: b.id, p_stage: 'packing' }); toast(t('toast_done')); load(); }
        catch (e) { toastError(e); }
      }
    };

    const edit = c.querySelector('#edit-batch');
    if (edit) edit.onclick = () => openBatchForm(load, b);

    const arch = c.querySelector('#archive-batch');
    if (arch) arch.onclick = async () => {
      if (await confirmAction(t('confirm_archive'))) {
        try { await rpc('archive_batch', { p_id: b.id }); toast(t('toast_done')); navigate('/production'); }
        catch (e) { toastError(e); }
      }
    };
    const canc = c.querySelector('#cancel-batch');
    if (canc) canc.onclick = async () => {
      if (await confirmAction(t('confirm_cancel_batch'), { danger: true })) {
        try { await rpc('cancel_batch', { p_id: b.id }); toast(t('toast_done')); navigate('/production'); }
        catch (e) { toastError(e); }
      }
    };
  }

  function renderTasks(byStage, mgr) {
    const order = [...STAGES, 'technologist'];
    let html = '';
    let any = false;
    for (const st of order) {
      const list = byStage[st];
      if (!list || !list.length) continue;
      any = true;
      html += `<div class="stage-group"><div class="stage-group-title">${esc(label.stage(st))}</div>`;
      html += list.map((tk) => taskRow(tk, mgr)).join('');
      html += `</div>`;
    }
    return any ? html : emptyState();
  }

  function taskRow(tk, mgr) {
    const remaining = tk.planned_quantity - tk.completed_quantity;
    const canMark = (tk.employee_id === store.user.id || mgr) && tk.status !== 'cancelled' && tk.status !== 'completed';
    const pct = tk.planned_quantity ? Math.round(tk.completed_quantity / tk.planned_quantity * 100) : 0;
    return `<div class="task-row">
      <div class="row between">
        <b>${esc(tk.employee_name || '')}</b>
        <span class="badge badge-t-${tk.status}">${esc(label.tstatus(tk.status))}</span>
      </div>
      <div class="muted small">${num(tk.completed_quantity)}/${num(tk.planned_quantity)} ${esc(t('pcs'))} · ${num(tk.rate_per_unit)} ${esc(t('som'))}${tk.size ? ' · ' + esc(tk.size) : ''}</div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="row gap mt8">
        ${canMark ? `<button class="btn btn-primary btn-sm" data-mark="${tk.id}">${esc(t('task_mark'))} (${num(remaining)})</button>` : ''}
        ${mgr && tk.status !== 'cancelled' && tk.status !== 'completed' ? `<button class="btn btn-ghost btn-sm" data-cancel-task="${tk.id}">${esc(t('cancel'))}</button>` : ''}
      </div>
    </div>`;
  }

  await load();
}

function stageBar(current) {
  const idx = STAGES.indexOf(current);
  const done = current === 'completed';
  return `<div class="stagebar">
    ${STAGES.map((s, i) => {
      const state = done || i < idx ? 'done' : i === idx ? 'current' : 'todo';
      return `<div class="stagebar-item ${state}"><span class="dot"></span><span class="lbl">${esc(label.stage(s))}</span></div>`;
    }).join('')}
  </div>`;
}

function info(k, v) {
  if (v === null || v === undefined || v === '') return '';
  return `<div class="info-row"><span class="muted">${esc(k)}</span><span>${esc(v)}</span></div>`;
}

function usd(n) { return '$' + num(n); }

function costCard(b, cost) {
  // ткань: USD × курс = сомы
  const fabricUsdStr = cost.fabric_cost_usd
    ? ` (${usd(cost.fabric_cost_usd)}${cost.usd_rate ? ' × ' + num(cost.usd_rate) : ''})`
    : '';
  let html = `<div class="card">
    <h3 class="card-title">${esc(t('cost_title'))}</h3>
    ${cost.fabric_quantity != null ? info(t('batch_fabric_qty'),
        num(cost.fabric_quantity) + ' ' + (cost.fabric_unit === 'kg' ? t('unit_kg_short') : t('unit_meter_short'))) : ''}
    ${info(t('cost_fabric'), money(cost.fabric_cost) + fabricUsdStr)}
    ${info(t('cost_expenses'), money(cost.expense_total))}
    ${info(t('cost_work'), money(cost.work_total))}
    <div class="info-row total"><span>${esc(t('cost_total'))}</span><span>${money(cost.total_cost)}</span></div>
    ${cost.unit_cost != null ? info(t('cost_unit'), money(cost.unit_cost)
        + (cost.unit_fabric_usd != null ? ` (${esc(t('cost_fabric'))}: ${usd(cost.unit_fabric_usd)})` : '')) : ''}`;
  if (cost.revenue != null) {
    html += info(t('cost_revenue'), money(cost.revenue));
    html += `<div class="info-row ${cost.profit >= 0 ? 'profit' : 'loss'}"><span>${esc(t('cost_profit'))}</span><span>${money(cost.profit)}</span></div>`;
    if (cost.margin != null) html += info(t('cost_margin'), num(cost.margin) + ' %');
  }
  html += `</div>`;
  return html;
}

// --- назначение задачи ---
async function openTaskForm(batch, onDone) {
  const assignees = await rpc('list_assignees', {});
  const stageOpts = [...STAGES, 'technologist'].map((s) => ({ value: s, label: label.stage(s) }));
  const empOpts = assignees.map((e) => ({ value: e.id, label: `${e.full_name} (${label.role(e.role)})` }));

  const form = buildForm([
    { name: 'employee', label: t('task_employee'), type: 'select', options: empOpts, required: true },
    { name: 'stage', label: t('task_stage'), type: 'select', options: stageOpts, value: batch.current_stage },
    { name: 'planned', label: t('task_planned'), type: 'number', min: '1', required: true, value: batch.planned_quantity },
    { name: 'rate', label: t('task_rate'), type: 'number', step: '0.01', min: '0', required: true },
    { name: 'size', label: t('task_size') },
    { name: 'notes', label: t('batch_notes'), type: 'textarea' },
  ], { submitLabel: t('batch_add_task') });

  openSheet({ title: t('batch_add_task'), content: form });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const btn = form.querySelector('button[type="submit"]');
    await withBusy(btn, async () => {
      try {
        await rpc('create_task', {
          p_batch_id: batch.id, p_employee_id: v.employee, p_stage: v.stage,
          p_planned_quantity: parseInt(v.planned, 10), p_rate: Number(v.rate),
          p_size: v.size || null, p_notes: v.notes || null,
        });
        closeSheet(); toast(t('toast_saved')); onDone();
      } catch (err) { toastError(err); }
    });
  };
}

// --- перевод этапа ---
async function doAdvance(batch, onDone) {
  if (!await confirmAction(t('confirm_next_stage'))) return;
  try {
    const res = await rpc('advance_stage', { p_id: batch.id, p_force: false });
    if (res.needs_force) {
      // не все задачи завершены
      if (!isAdmin()) { toast(t('confirm_force_stage'), 'error'); return; }
      if (await confirmAction(t('confirm_force_stage'), { danger: true })) {
        const r2 = await rpc('advance_stage', { p_id: batch.id, p_force: true });
        finishAdvance(r2, onDone);
      }
      return;
    }
    finishAdvance(res, onDone);
  } catch (e) { toastError(e); }
}

function finishAdvance(res, onDone) {
  if (res.batch && res.batch.status === 'completed') toast(t('toast_batch_completed'));
  else toast(t('toast_stage_advanced'));
  onDone();
}
