import { isSharedHost, registrableDomain } from './sites.js';

const DAY = 86400000;

/** t***@example.com のような伏せ字メールが本文に現れるか */
export function matchesMaskedEmail(username, pageText) {
  const at = username.indexOf('@');
  if (at < 1) return false;
  const local = username.slice(0, at);
  const domain = username.slice(at + 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${local[0]}\\*+@${domain}`, 'i').test(pageText);
}

/**
 * 1 アカウントの推薦スコア。
 * - 明示的なサイト紐付けが最強
 * - そのサイトで使った実績 (learning) が次に強い
 * - ログイン中のユーザー名が一致すれば加点
 */
export function scoreAccount(account, ctx, state, now = Date.now()) {
  const hostname = String(ctx.hostname || '').toLowerCase();
  const host = hostname;
  const reg = registrableDomain(host);
  const sites = Array.isArray(account.sites) ? account.sites : [];
  let score = 0;
  let bound = false;

  if (sites.includes(host)) {
    score += 110;
    bound = true;
  } else if (sites.includes(reg) && !isSharedHost(host)) {
    score += 100;
    bound = true;
  }

  const learning = state.learning || {};
  const learned = (learning[host] && learning[host][account.id]) || null;
  if (learned) {
    score += Math.min(60, 30 + learned.uses * 5);
    if (now - learned.lastUsed < 30 * DAY) score += 15;
  }

  const attempted = String(ctx.username || '').toLowerCase();
  const registered = String(account.username || '').toLowerCase();
  if (attempted && registered) {
    if (registered === attempted) score += 50;
    else if (registered.startsWith(attempted) || attempted.startsWith(registered)) score += 20;
  }

  const pageText = String(ctx.pageText || '');
  if (pageText && account.username && account.username.length >= 3) {
    if (matchesMaskedEmail(account.username, pageText)) score += 45;
    else if (pageText.toLowerCase().includes(registered)) score += 15;
  }

  return { score, bound };
}

export function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

/**
 * 全アカウントをスコア順に返す。bound=false は「このサイトには未登録」。
 */
export function rankAccounts(state, ctx, now = Date.now()) {
  return sortAccounts(state.accounts)
    .map((account) => {
      const { score, bound } = scoreAccount(account, ctx, state, now);
      return {
        id: account.id,
        label: account.label,
        issuer: account.issuer,
        username: account.username,
        type: account.type,
        digits: account.digits,
        sites: account.sites,
        bound,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
