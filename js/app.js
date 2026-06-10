// ---------------------------------------------------------------------
// Точка входа: bootstrap сессии, оболочка (шапка + навигация),
// маршрутизация, polling уведомлений.
// ---------------------------------------------------------------------
import { rpc, getToken, clearToken, ApiError } from './api.js';
import { SUPABASE_URL } from './config.js';
import { t, getLang, setLang } from './i18n.js';
import { store, isAdmin, isManager, isWorker } from './store.js';
import { route, setNotFound, startRouter, navigate, currentPath } from './router.js';
import { toast, openSheet, esc } from './ui.js';

import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderProduction } from './pages/production.js';
import { renderBatch } from './pages/batch.js';
import { renderTasks } from './pages/tasks.js';
import { renderEmployees } from './pages/employees.js';
import { renderSalaries, renderSalaryOne, renderMySalary } from './pages/salaries.js';
import { renderExpenses } from './pages/expenses.js';
import { renderAdvances } from './pages/advances.js';
import { renderNotifications } from './pages/notifications.js';
import { renderProfile } from './pages/profile.js';

const root = document.getElementById('app');

// --- описание разделов по ролям (порядок = порядок в нижней навигации) ---
function navItems() {
  const r = store.user?.role;
  if (r === 'admin') return [
    { path: '/dashboard', icon: '📊', key: 'nav_dashboard' },
    { path: '/production', icon: '🧵', key: 'nav_production' },
    { path: '/salaries', icon: '💰', key: 'nav_salaries' },
    { path: '/advances', icon: '📥', key: 'nav_advances' },
    { path: '/employees', icon: '👥', key: 'nav_employees' },
    { path: '/expenses', icon: '🧾', key: 'nav_expenses' },
    { path: '/notifications', icon: '🔔', key: 'nav_notifications' },
    { path: '/profile', icon: '👤', key: 'nav_profile' },
  ];
  if (r === 'technologist') return [
    { path: '/production', icon: '🧵', key: 'nav_production' },
    { path: '/tasks', icon: '✅', key: 'nav_tasks' },
    { path: '/salaries', icon: '💰', key: 'nav_salaries' },
    { path: '/advances', icon: '📥', key: 'nav_advances' },
    { path: '/notifications', icon: '🔔', key: 'nav_notifications' },
    { path: '/profile', icon: '👤', key: 'nav_profile' },
  ];
  if (r === 'cutter') return [
    { path: '/tasks', icon: '✅', key: 'nav_tasks' },
    { path: '/production', icon: '🧵', key: 'nav_production' },
    { path: '/my-salary', icon: '💰', key: 'nav_salaries' },
    { path: '/advances', icon: '📥', key: 'nav_advances' },
    { path: '/notifications', icon: '🔔', key: 'nav_notifications' },
    { path: '/profile', icon: '👤', key: 'nav_profile' },
  ];
  // остальные исполнители
  return [
    { path: '/tasks', icon: '✅', key: 'nav_tasks' },
    { path: '/my-salary', icon: '💰', key: 'nav_salaries' },
    { path: '/advances', icon: '📥', key: 'nav_advances' },
    { path: '/notifications', icon: '🔔', key: 'nav_notifications' },
    { path: '/profile', icon: '👤', key: 'nav_profile' },
  ];
}

function homePath() {
  const r = store.user?.role;
  if (r === 'admin') return '/dashboard';
  if (r === 'technologist') return '/production';
  return '/tasks';
}

// --- оболочка ---
function renderShell() {
  const items = navItems();
  const bottom = items.length > 5 ? items.slice(0, 4) : items;
  const hasMenu = items.length > 5;

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">🧵 ${esc(t('app_name'))}</div>
        <button class="icon-btn" id="bell">🔔<span class="bell-badge" id="bell-badge" hidden></span></button>
      </header>
      <aside class="sidebar" id="sidebar">
        ${items.map(navLink).join('')}
      </aside>
      <main class="content" id="app-content"></main>
      <nav class="bottomnav">
        ${bottom.map(navLink).join('')}
        ${hasMenu ? `<a class="navlink" data-menu="1" href="javascript:void(0)"><span class="nav-icon">☰</span><span class="nav-label">${esc(t('all'))}</span></a>` : ''}
      </nav>
    </div>`;

  root.querySelector('#bell').onclick = () => navigate('/notifications');
  if (hasMenu) root.querySelector('[data-menu]').onclick = openMenu;
  root.querySelectorAll('.navlink[data-path]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.path); };
  });
}

function navLink(it) {
  return `<a class="navlink" data-path="${it.path}" href="#${it.path}">
    <span class="nav-icon">${it.icon}</span><span class="nav-label">${esc(t(it.key))}</span></a>`;
}

function openMenu() {
  const items = navItems();
  const wrap = document.createElement('div');
  wrap.className = 'menu-grid';
  items.forEach((it) => {
    const a = document.createElement('a');
    a.className = 'menu-item';
    a.innerHTML = `<span class="nav-icon">${it.icon}</span><span>${esc(t(it.key))}</span>`;
    a.onclick = () => { document.getElementById('sheet-overlay')?.remove(); document.body.classList.remove('no-scroll'); navigate(it.path); };
    wrap.appendChild(a);
  });
  openSheet({ title: t('app_name'), content: wrap });
}

function highlightNav(path) {
  root.querySelectorAll('.navlink[data-path]').forEach((a) => {
    const base = '/' + (path.split('/')[1] || '');
    a.classList.toggle('active', a.dataset.path === base || a.dataset.path === path);
  });
}

export function content() { return document.getElementById('app-content'); }

// --- защита маршрутов ---
function guard(handler, { roles } = {}) {
  return async (params) => {
    if (!store.user) { navigate('/login'); return; }
    if (roles && !roles.includes(store.user.role)) { navigate(homePath()); return; }
    highlightNav(currentPath());
    const el = content();
    if (el) el.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
    try { await handler(content(), params); }
    catch (e) {
      if (e instanceof ApiError && (e.code === 'AUTH_INVALID' || e.code === 'AUTH_DISMISSED')) {
        await doLogout(); return;
      }
      content().innerHTML = `<div class="error-box">${esc(e.message || 'Error')}</div>`;
    }
  };
}

// --- маршруты ---
function registerRoutes() {
  route('/login', async () => { renderLoginScreen(); });
  route('/', guard(async (c) => navigate(homePath())));
  route('/dashboard', guard((c) => renderDashboard(c), { roles: ['admin'] }));
  route('/production', guard((c) => renderProduction(c), { roles: ['admin', 'technologist', 'cutter', 'seamstress', 'ironer', 'packer'] }));
  route('/batch/:id', guard((c, p) => renderBatch(c, p)));
  route('/tasks', guard((c) => renderTasks(c)));
  route('/employees', guard((c) => renderEmployees(c), { roles: ['admin'] }));
  route('/salaries', guard((c) => renderSalaries(c), { roles: ['admin', 'technologist'] }));
  route('/salary/:id', guard((c, p) => renderSalaryOne(c, p), { roles: ['admin', 'technologist'] }));
  route('/my-salary', guard((c) => renderMySalary(c)));
  route('/expenses', guard((c) => renderExpenses(c), { roles: ['admin'] }));
  route('/advances', guard((c) => renderAdvances(c)));
  route('/notifications', guard((c) => renderNotifications(c)));
  route('/profile', guard((c) => renderProfile(c)));
  setNotFound(() => navigate(store.user ? homePath() : '/login'));
}

// --- логин-экран (без оболочки) ---
function renderLoginScreen() {
  if (store.user) { navigate(homePath()); return; }
  root.innerHTML = '<div id="login-root"></div>';
  renderLogin(document.getElementById('login-root'), onLoginSuccess);
}

async function onLoginSuccess(payload) {
  store.user = payload.employee;
  if (payload.employee.lang) setLang(payload.employee.lang);
  renderShell();
  startNotifPoll();
  navigate(homePath());
}

export async function doLogout() {
  try { await rpc('logout', {}); } catch {}
  clearToken();
  store.user = null;
  stopNotifPoll();
  root.innerHTML = '';
  navigate('/login');
  renderLoginScreen();
}

// --- polling уведомлений (лёгкий, на паузе при скрытой вкладке) ---
let notifTimer = null;
async function pollNotif() {
  if (document.hidden || !store.user) return;
  try {
    const c = await rpc('unread_count', {});
    store.unread = c || 0;
    const badge = document.getElementById('bell-badge');
    if (badge) { badge.hidden = !store.unread; badge.textContent = store.unread > 99 ? '99+' : String(store.unread); }
  } catch {}
}
function startNotifPoll() {
  stopNotifPoll();
  pollNotif();
  notifTimer = setInterval(pollNotif, 30000);
}
function stopNotifPoll() { if (notifTimer) { clearInterval(notifTimer); notifTimer = null; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollNotif(); });

// --- bootstrap ---
async function boot() {
  registerRoutes();
  const token = getToken();
  if (token) {
    try {
      const me = await rpc('me', {});
      store.user = me;
      if (me.lang) setLang(me.lang);
      renderShell();
      startNotifPoll();
    } catch (e) {
      clearToken();
    }
  }
  if (!store.user) { renderLoginScreen(); }
  startRouter();
}

// preconnect к Supabase (ускоряет первый запрос)
if (SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT')) {
  const l = document.createElement('link');
  l.rel = 'preconnect'; l.href = SUPABASE_URL; l.crossOrigin = '';
  document.head.appendChild(l);
}

document.documentElement.lang = getLang();
boot();

// Регистрация service worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ----- Установка приложения на телефон (PWA install) -----
export const pwa = { deferredPrompt: null, installed: false };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();            // не показывать авто-баннер, покажем свою кнопку
  pwa.deferredPrompt = e;
});
window.addEventListener('appinstalled', () => { pwa.deferredPrompt = null; pwa.installed = true; });

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
export async function promptInstall() {
  if (!pwa.deferredPrompt) return false;
  pwa.deferredPrompt.prompt();
  const res = await pwa.deferredPrompt.userChoice;
  pwa.deferredPrompt = null;
  return res && res.outcome === 'accepted';
}
