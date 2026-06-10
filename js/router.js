// ---------------------------------------------------------------------
// Простой hash-роутер. Маршруты вида #/production, #/batch/<id>.
// ---------------------------------------------------------------------
const routes = [];
let notFound = null;
let onNavigate = null;

export function route(pattern, handler) {
  // pattern: '/batch/:id' -> regexp
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ rx, keys, handler });
}
export function setNotFound(fn) { notFound = fn; }
export function setOnNavigate(fn) { onNavigate = fn; }

export function navigate(path) {
  if (location.hash !== '#' + path) location.hash = '#' + path;
  else handleRoute();
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

export async function handleRoute() {
  const path = currentPath();
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      if (onNavigate) onNavigate(path);
      await r.handler(params);
      return;
    }
  }
  if (notFound) notFound();
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
