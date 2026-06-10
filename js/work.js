// Общий помощник: отметка выполнения работы (создаёт work_record).
// Используется в «Моих задачах» и в карточке партии.
import { rpc } from './api.js';
import { t } from './i18n.js';
import { esc, num, openSheet, closeSheet, toast, toastError, withBusy } from './ui.js';

// task: { id, planned_quantity, completed_quantity, rate_per_unit }
export function openMarkSheet(task, onDone) {
  const remaining = task.planned_quantity - task.completed_quantity;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="mark-info">
      <div><span class="muted">${esc(t('task_remaining'))}:</span> <b>${num(remaining)} ${esc(t('pcs'))}</b></div>
      <div><span class="muted">${esc(t('task_rate'))}:</span> <b>${num(task.rate_per_unit)} ${esc(t('som'))}</b></div>
    </div>
    <form class="form" id="mark-form">
      <label class="field">
        <span class="field-label">${esc(t('task_qty_prompt'))}</span>
        <input name="qty" type="number" inputmode="numeric" min="1" max="${remaining}" required autofocus>
      </label>
      <div class="mark-preview muted" id="mark-preview"></div>
      <button type="submit" class="btn btn-primary btn-block">${esc(t('task_mark'))}</button>
    </form>`;

  const { close } = openSheet({ title: t('task_mark'), content: wrap });
  const form = wrap.querySelector('#mark-form');
  const preview = wrap.querySelector('#mark-preview');
  form.qty.oninput = () => {
    const q = parseInt(form.qty.value, 10);
    preview.textContent = q > 0 ? `${t('task_earned')}: ${num(q * task.rate_per_unit)} ${t('som')}` : '';
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const qty = parseInt(form.qty.value, 10);
    const btn = form.querySelector('button[type="submit"]');
    // антидабл-клик: кнопка блокируется на время запроса
    await withBusy(btn, async () => {
      try {
        await rpc('submit_work', { p_task_id: task.id, p_quantity: qty });
        closeSheet();
        toast(t('toast_work_added'));
        onDone && onDone();
      } catch (err) { toastError(err); }
    });
  };
}
