export const OTP_TEXT =
  /(one[\s-]?time(?:\s*(?:code|password|passcode|pin|token))?|\botp\b|\btotp\b|\b2fa\b|\bmfa\b|authenticator|verification\s*code|security\s*code|login\s*code|access\s*code|verify\s*code|認証コード|確認コード|ワンタイム|認証番号)/i;

const SKIP_TYPES = new Set([
  'password', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'reset',
  'file', 'range', 'color', 'date', 'datetime-local', 'month', 'week', 'time',
  'search', 'url', 'image',
]);

const USERNAME_SELECTORS = [
  'input[autocomplete="username"]',
  'input[type="email"]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[name*="login" i]',
  'input[id*="login" i]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[name*="account" i]',
].join(',');

export function isVisible(el) {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return false;
  const style = getComputedStyle(el);
  return (
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0' &&
    style.pointerEvents !== 'none'
  );
}

function descriptor(el) {
  return [
    el.name,
    el.id,
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('data-testid'),
    el.getAttribute('data-test'),
    typeof el.className === 'string' ? el.className : '',
    el.labels && el.labels[0] ? el.labels[0].textContent : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function scoreInput(el) {
  if (!(el instanceof HTMLInputElement)) return -1;
  if (el.disabled || el.readOnly) return -1;
  if (SKIP_TYPES.has((el.type || 'text').toLowerCase())) return -1;
  if (!isVisible(el)) return -1;

  let score = 0;
  const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();

  if (autocomplete === 'one-time-code') score += 100;
  if (/one-time-code/.test(autocomplete)) score += 40;

  if (OTP_TEXT.test(descriptor(el))) score += 40;

  const maxLength = el.maxLength;
  if (maxLength >= 6 && maxLength <= 8) score += 20;

  const inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
  if (inputMode === 'numeric' || el.type === 'tel' || el.type === 'number') score += 15;

  const scope = el.closest('form') || el.parentElement;
  if (scope && OTP_TEXT.test((scope.textContent || '').slice(0, 600))) score += 20;

  if (autocomplete === 'email' || autocomplete === 'username') score -= 80;
  if (el.type === 'email') score -= 60;

  return score;
}

function splitGroups(root) {
  const groups = new Map();
  for (const el of root.querySelectorAll('input[maxlength="1"]')) {
    if (!isVisible(el)) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(el);
  }

  const result = [];
  for (const [parent, fields] of groups) {
    if (fields.length < 4) continue;
    const text = `${parent.textContent || ''} ${parent.getAttribute('aria-label') || ''}`;
    const nearby = OTP_TEXT.test(text.slice(0, 300));
    result.push({
      mode: 'split',
      fields,
      anchor: parent,
      score: nearby ? 90 : 70,
    });
  }
  return result;
}

/** @returns {Array<{mode:'single'|'split', fields:HTMLInputElement[], anchor:Element, score:number}>} */
export function findOtpTargets(root = document) {
  const singles = [];
  for (const el of root.querySelectorAll('input')) {
    const score = scoreInput(el);
    if (score >= 60) {
      singles.push({ mode: 'single', fields: [el], anchor: el, score });
    }
  }
  return [...singles, ...splitGroups(root)].sort((a, b) => b.score - a.score);
}

export function isOtpElement(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  return scoreInput(el) >= 60;
}

/**
 * 1 桁ずつの分割入力に属していれば、そのグループを返す。
 * 個々の input は maxlength=1 なので scoreInput では閾値に届かない。
 */
export function splitGroupFor(el) {
  if (!(el instanceof HTMLInputElement)) return null;
  if (el.maxLength !== 1) return null;
  const parent = el.parentElement;
  if (!parent) return null;

  const fields = [...parent.querySelectorAll('input[maxlength="1"]')].filter(isVisible);
  if (fields.length < 4 || !fields.includes(el)) return null;

  const text = `${parent.textContent || ''} ${parent.getAttribute('aria-label') || ''}`;
  return {
    mode: 'split',
    fields,
    anchor: parent,
    score: OTP_TEXT.test(text.slice(0, 300)) ? 90 : 70,
  };
}

/**
 * フォーカスされた入力欄から、入力対象を解決する。
 * @returns {{mode:'single'|'split', fields:HTMLInputElement[], anchor:Element, score:number} | null}
 */
export function resolveOtpTarget(el) {
  if (!(el instanceof HTMLInputElement)) return null;

  const split = splitGroupFor(el);
  if (split) return split;

  if (isOtpElement(el)) {
    return { mode: 'single', fields: [el], anchor: el, score: scoreInput(el) };
  }
  return null;
}

export function readLoginContext() {
  let username = '';
  try {
    for (const el of document.querySelectorAll(USERNAME_SELECTORS)) {
      const value = (el.value || '').trim();
      if (value) username = value;
    }
  } catch {
    /* 無視 */
  }

  let pageText = '';
  try {
    const body = document.body;
    pageText = `${document.title || ''}\n${body ? body.textContent || '' : ''}`.slice(0, 4000);
  } catch {
    /* 無視 */
  }

  return { username, pageText };
}

export function targetStillValid(target) {
  if (!target) return false;
  if (target.mode === 'single') return target.fields[0].isConnected;
  return target.fields.every((field) => field.isConnected);
}
