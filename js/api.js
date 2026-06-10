// ---------------------------------------------------------------------
// Тонкий клиент Supabase RPC. Все вызовы — POST /rest/v1/rpc/<fn>.
// Токен сессии добавляется автоматически как аргумент p_token.
// ---------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const TOKEN_KEY = 'cex_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// Понятные сообщения об ошибках бизнес-логики (ключи переводов).
export const ERROR_KEYS = {
  AUTH_INVALID: 'err_auth_invalid',
  AUTH_DISMISSED: 'err_dismissed',
  LOGIN_INVALID: 'err_login_invalid',
  FORBIDDEN: 'err_forbidden',
  QTY_INVALID: 'err_qty_invalid',
  QTY_OVER_PLAN: 'err_qty_over',
  TASK_CANCELLED: 'err_task_cancelled',
  AMOUNT_INVALID: 'err_amount_invalid',
  PHONE_TAKEN: 'err_phone_taken',
  PIN_TOO_SHORT: 'err_pin_short',
  PLAN_BELOW_DONE: 'err_plan_below_done',
  RATE_INVALID: 'err_rate_invalid',
  NOT_FOUND: 'err_not_found',
  CANNOT_DISMISS_SELF: 'err_dismiss_self',
  FORCE_REQUIRES_ADMIN: 'err_force_admin',
};

export class ApiError extends Error {
  constructor(code, message, raw) { super(message); this.code = code; this.raw = raw; }
}

// Вызов RPC-функции. opts.auth=false для login (без токена).
export async function rpc(fn, args = {}, opts = {}) {
  const useAuth = opts.auth !== false;
  const body = { ...args };
  if (useAuth) body.p_token = getToken();

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Нет сети / сервер недоступен
    throw new ApiError('NETWORK', 'network', e);
  }

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    // PostgREST возвращает { message, hint, ... }. Наши raise exception
    // попадают в message. Извлекаем код (часть до ':' или само сообщение).
    const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
    let code = msg;
    if (msg.startsWith('LOCKED_UNTIL:')) {
      throw new ApiError('LOCKED_UNTIL', msg.slice('LOCKED_UNTIL:'.length), data);
    }
    // обрезать возможный префикс PostgREST
    code = msg.split('\n')[0].trim();
    throw new ApiError(code, msg, data);
  }
  return data;
}
