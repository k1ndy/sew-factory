// Профиль: имя, телефон, роль, язык, выход, быстрый аванс и сводка ЗП.
import { rpc } from '../api.js';
import { t, label, getLang, setLang, LANGS, LANG_NAMES } from '../i18n.js';
import { esc, money } from '../ui.js';
import { navigate } from '../router.js';
import { store, isWorker, isManager } from '../store.js';
import { doLogout, pwa, isStandalone, isIOS, promptInstall } from '../app.js';
import { openRequestForm } from './advances.js';
import { toast } from '../ui.js';

export async function renderProfile(c) {
  const u = store.user;
  const worker = isWorker() || u.role === 'technologist';

  // краткая сводка ЗП для сотрудников
  let summaryHtml = '';
  if (worker) {
    try {
      const data = await rpc('get_salary', {});
      const s = data.summary;
      summaryHtml = `
        <div class="card clickable" id="my-salary">
          <h3 class="card-title">${esc(t('prof_my_salary'))}</h3>
          <div class="row between">
            <span class="muted">${esc(t('sal_balance'))}</span>
            <b class="${Number(s.balance) >= 0 ? '' : 'neg'}">${money(s.balance)}</b>
          </div>
        </div>`;
    } catch {}
  }

  c.innerHTML = `
    <div class="page">
      <h2 class="page-title">${esc(t('nav_profile'))}</h2>

      <div class="card">
        <div class="profile-avatar">${esc((u.full_name || '?').charAt(0))}</div>
        <div class="profile-name">${esc(u.full_name)}</div>
        <div class="muted">${esc(u.phone)}</div>
        <span class="badge badge-role mt8">${esc(label.role(u.role))}</span>
      </div>

      ${summaryHtml}

      ${worker ? `<button class="btn btn-primary btn-block" id="quick-adv">📥 ${esc(t('prof_quick_advance'))}</button>` : ''}

      <div class="card">
        <h3 class="card-title">${esc(t('prof_lang'))}</h3>
        <div class="lang-switch">
          ${LANGS.map((l) => `<button class="lang-btn ${l === getLang() ? 'active' : ''}" data-lang="${l}">${esc(LANG_NAMES[l])}</button>`).join('')}
        </div>
      </div>

      ${installSection()}

      <button class="btn btn-danger btn-block" id="logout">${esc(t('prof_logout'))}</button>
    </div>`;

  const ms = c.querySelector('#my-salary');
  if (ms) ms.onclick = () => navigate('/my-salary');

  const qa = c.querySelector('#quick-adv');
  if (qa) qa.onclick = () => openRequestForm();

  c.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = async () => {
      setLang(b.dataset.lang);
      try { await rpc('set_my_lang', { p_lang: b.dataset.lang }); } catch {}
      // перерисовать оболочку и страницу с новым языком
      location.reload();
    };
  });

  const installBtn = c.querySelector('#install-btn');
  if (installBtn) installBtn.onclick = async () => {
    const ok = await promptInstall();
    if (ok) toast(t('install_done'));
    renderProfile(c); // перерисовать (кнопка исчезнет после установки)
  };

  c.querySelector('#logout').onclick = async () => {
    const { confirmAction } = await import('../ui.js');
    if (await confirmAction(t('confirm_logout'))) doLogout();
  };
}

// Секция «Установить приложение» — зависит от платформы/состояния
function installSection() {
  if (isStandalone()) {
    return `<div class="card install-card"><div class="row gap"><span class="notif-icon">✅</span>
      <div>${esc(t('install_done'))}</div></div></div>`;
  }
  let inner;
  if (isIOS()) {
    inner = `<div class="muted small">${esc(t('install_ios'))}</div>`;
  } else if (pwa.deferredPrompt) {
    inner = `<button class="btn btn-primary btn-block" id="install-btn">⬇️ ${esc(t('install_btn'))}</button>`;
  } else {
    inner = `<div class="muted small">${esc(t('install_android'))}</div>`;
  }
  return `<div class="card install-card">
    <h3 class="card-title">📲 ${esc(t('install_title'))}</h3>
    <div class="muted small" style="margin-bottom:10px">${esc(t('install_hint'))}</div>
    ${inner}
  </div>`;
}
