// ---------------------------------------------------------------------
// UI-хелперы: тосты, модальные окна (bottom sheet на мобильных),
// подтверждения, форматирование, обработка ошибок.
// ---------------------------------------------------------------------
import { t } from './i18n.js';
import { ApiError, ERROR_KEYS } from './api.js';

// ---- экранирование HTML ----
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- форматирование денег / чисел / дат ----
export function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + t('som');
}
export function num(n) { return Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---- тосты ----
let toastTimer = null;
export function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type} show`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// ---- маппинг ошибок API -> текст ----
export function errorText(e) {
  if (e instanceof ApiError) {
    if (e.code === 'NETWORK') return t('err_network');
    if (e.code === 'LOCKED_UNTIL') return t('err_locked');
    const key = ERROR_KEYS[e.code];
    if (key) return t(key);
    return e.message || t('err_generic');
  }
  return (e && e.message) || t('err_generic');
}
export function toastError(e) { toast(errorText(e), 'error'); }

// ---- модальное окно / bottom sheet ----
// Возвращает Promise. content — DOM-узел или html-строка.
export function openSheet({ title, content, onClose }) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.id = 'sheet-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'sheet';

  const header = document.createElement('div');
  header.className = 'sheet-header';
  header.innerHTML = `<h3>${esc(title || '')}</h3><button class="sheet-close" aria-label="close">✕</button>`;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'sheet-body';
  if (typeof content === 'string') bodyEl.innerHTML = content;
  else if (content) bodyEl.appendChild(content);

  sheet.appendChild(header);
  sheet.appendChild(bodyEl);
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => { closeSheet(); if (onClose) onClose(); };
  header.querySelector('.sheet-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  return { overlay, body: bodyEl, close };
}

export function closeSheet() {
  const ex = document.getElementById('sheet-overlay');
  if (ex) ex.remove();
  document.body.classList.remove('no-scroll');
}

// ---- подтверждение ----
export function confirmAction(message, { danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <p class="confirm-msg">${esc(message)}</p>
      <div class="row gap">
        <button class="btn btn-ghost" data-act="no">${esc(t('cancel'))}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(t('confirm'))}</button>
      </div>`;
    const { close } = openSheet({ title: t('confirm'), content: wrap, onClose: () => resolve(false) });
    wrap.querySelector('[data-act="no"]').onclick = () => { close(); resolve(false); };
    wrap.querySelector('[data-act="yes"]').onclick = () => { closeSheet(); resolve(true); };
  });
}

// ---- построение формы ----
// fields: [{name,label,type,value,required,options,min,step,placeholder}]
// type: text|number|tel|date|select|textarea
export function buildForm(fields, { submitLabel } = {}) {
  const form = document.createElement('form');
  form.className = 'form';
  form.noValidate = true;
  for (const f of fields) {
    const group = document.createElement('label');
    group.className = 'field';
    const lbl = document.createElement('span');
    lbl.className = 'field-label';
    lbl.textContent = f.label + (f.required ? ' *' : '');
    group.appendChild(lbl);

    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const o of f.options) {
        const opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.label;
        if (String(o.value) === String(f.value)) opt.selected = true;
        input.appendChild(opt);
      }
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      if (f.value != null) input.value = f.value;
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.value != null) input.value = f.value;
      if (f.min != null) input.min = f.min;
      if (f.step != null) input.step = f.step;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.inputmode) input.inputMode = f.inputmode;
    }
    input.name = f.name;
    if (f.required) input.required = true;
    group.appendChild(input);
    form.appendChild(group);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = submitLabel || t('save');
  form.appendChild(submit);
  return form;
}

export function formValues(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    data[el.name] = el.value;
  }
  return data;
}

// блокировка кнопки на время async-операции (антидабл-клик)
export async function withBusy(btn, fn) {
  if (btn.disabled) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.classList.add('busy');
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = old; }
}

// статус-бейдж
export function badge(text, kind = '') {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}

export function emptyState(msg) {
  return `<div class="empty"><div class="empty-icon">📭</div><p>${esc(msg || t('empty'))}</p></div>`;
}
