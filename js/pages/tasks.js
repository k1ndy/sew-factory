// Мои задачи: активные и завершённые задачи пользователя, отметка выполнения.
import { rpc } from '../api.js';
import { t, label } from '../i18n.js';
import { esc, num, money, emptyState } from '../ui.js';
import { navigate } from '../router.js';
import { openMarkSheet } from '../work.js';

export async function renderTasks(c) {
  let tab = 'active';

  async function load() {
    const tasks = await rpc('list_my_tasks', {});
    const active = tasks.filter((x) => ['pending', 'in_progress'].includes(x.status));
    const finished = tasks.filter((x) => ['completed', 'cancelled'].includes(x.status));
    const list = tab === 'active' ? active : finished;

    c.innerHTML = `
      <div class="page">
        <h2 class="page-title">${esc(t('nav_tasks'))}</h2>
        <div class="tabs">
          <button class="tab ${tab === 'active' ? 'active' : ''}" data-tab="active">${esc(t('task_active'))} (${active.length})</button>
          <button class="tab ${tab === 'finished' ? 'active' : ''}" data-tab="finished">${esc(t('task_finished'))} (${finished.length})</button>
        </div>
        <div id="task-list">
          ${list.length ? list.map(taskCard).join('') : emptyState()}
        </div>
      </div>`;

    c.querySelector('[data-tab="active"]').onclick = () => { tab = 'active'; load(); };
    c.querySelector('[data-tab="finished"]').onclick = () => { tab = 'finished'; load(); };
    c.querySelectorAll('[data-mark]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const tk = tasks.find((x) => x.id === el.dataset.mark);
        openMarkSheet(tk, load);
      };
    });
    c.querySelectorAll('[data-open-batch]').forEach((el) => {
      el.onclick = () => navigate('/batch/' + el.dataset.openBatch);
    });
  }
  await load();
}

function taskCard(tk) {
  const remaining = tk.planned_quantity - tk.completed_quantity;
  const pct = tk.planned_quantity ? Math.round(tk.completed_quantity / tk.planned_quantity * 100) : 0;
  const canMark = ['pending', 'in_progress'].includes(tk.status);
  return `<div class="card task-card">
    <div class="row between clickable" data-open-batch="${tk.batch_id}">
      <b>${esc(tk.batch_name)}</b>
      <span class="badge badge-t-${tk.status}">${esc(label.tstatus(tk.status))}</span>
    </div>
    <div class="muted small">${esc(label.stage(tk.stage))}${tk.size ? ' · ' + esc(tk.size) : ''}</div>
    <div class="progress mt8"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="row between mt8 small">
      <span>${esc(t('task_done'))}: <b>${num(tk.completed_quantity)}</b>/${num(tk.planned_quantity)}</span>
      <span>${esc(t('task_rate'))}: <b>${num(tk.rate_per_unit)}</b></span>
      <span>${esc(t('task_earned'))}: <b>${money(tk.earned)}</b></span>
    </div>
    ${canMark ? `<button class="btn btn-primary btn-block mt8" data-mark="${tk.id}">${esc(t('task_mark'))} (${num(remaining)} ${esc(t('pcs'))})</button>` : ''}
  </div>`;
}
