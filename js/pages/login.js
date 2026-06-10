// Страница входа: телефон + PIN, переключатель языка, блокировка после 5 ошибок.
import { rpc, setToken } from '../api.js';
import { t, getLang, setLang, LANGS, LANG_NAMES } from '../i18n.js';
import { esc, toast, errorText, withBusy } from '../ui.js';

export function renderLogin(root, onSuccess) {
  const draw = () => {
    root.innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">🧵</div>
          <h1>${esc(t('app_name'))}</h1>
          <p class="login-sub">${esc(t('login_title'))}</p>

          <div class="lang-switch" id="lang-switch">
            ${LANGS.map((l) => `<button class="lang-btn ${l === getLang() ? 'active' : ''}" data-lang="${l}">${esc(LANG_NAMES[l])}</button>`).join('')}
          </div>

          <form id="login-form" class="form">
            <label class="field">
              <span class="field-label">${esc(t('login_phone'))}</span>
              <input name="phone" type="tel" inputmode="tel" placeholder="+996700000001" required autocomplete="username">
            </label>
            <label class="field">
              <span class="field-label">${esc(t('login_pin'))}</span>
              <input name="pin" type="password" inputmode="numeric" placeholder="••••" required autocomplete="current-password">
            </label>
            <div class="login-error" id="login-error" hidden></div>
            <button type="submit" class="btn btn-primary btn-block">${esc(t('login_btn'))}</button>
          </form>
        </div>
      </div>`;

    root.querySelectorAll('[data-lang]').forEach((b) => {
      b.onclick = () => { setLang(b.dataset.lang); draw(); };
    });

    const form = root.querySelector('#login-form');
    const errEl = root.querySelector('#login-error');
    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const phone = form.phone.value.trim();
      const pin = form.pin.value.trim();
      const btn = form.querySelector('button[type="submit"]');
      await withBusy(btn, async () => {
        try {
          const res = await rpc('login', { p_phone: phone, p_pin: pin }, { auth: false });
          setToken(res.token);
          onSuccess(res);
        } catch (err) {
          errEl.textContent = errorText(err);
          errEl.hidden = false;
        }
      });
    };
  };
  draw();
}
