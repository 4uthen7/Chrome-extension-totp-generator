/**
 * eTLD+1 の近似実装。
 * Public Suffix List を丸ごと持つ代わりに、実用上必要な 2 階層 TLD と
 * 共有ホスティングドメインだけを列挙する。
 */

const TWO_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'gr.jp', 'ed.jp', 'lg.jp',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 'ac.kr',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'co.za', 'org.za', 'net.za', 'gov.za',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.tw', 'net.tw', 'org.tw', 'edu.tw',
  'com.hk', 'net.hk', 'org.hk', 'edu.hk',
  'com.sg', 'net.sg', 'org.sg', 'edu.sg',
  'com.mx', 'com.ar', 'com.tr', 'com.pl', 'com.ua', 'com.ru',
  'co.id', 'or.id', 'ac.id', 'web.id',
  'co.th', 'or.th', 'ac.th',
  'com.vn', 'co.il', 'org.il', 'com.my', 'com.ph', 'com.pk', 'com.eg',
  'co.ke', 'co.ug', 'co.tz', 'com.ng', 'com.sa', 'com.ae',
  'github.io', 'gitlab.io', 'pages.com',
]);

/** 複数テナントが同居するドメイン。ここでは eTLD+1 で束ねてはいけない。 */
const SHARED = new Set([
  'github.io', 'gitlab.io', 'githubusercontent.com',
  'herokuapp.com', 'vercel.app', 'netlify.app', 'netlify.com',
  'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
  'appspot.com', 'blogspot.com', 'blogspot.jp',
  'azurewebsites.net', 'cloudapp.azure.com', 'cloudfront.net',
  's3.amazonaws.com', 'onrender.com', 'render.com', 'fly.dev',
  'glitch.me', 'replit.dev', 'repl.co', 'ngrok.io', 'ngrok-free.app',
  'trycloudflare.com', 'surge.sh', 'neocities.org', 'wixsite.com',
  'myshopify.com', 'notion.site', 'webflow.io', 'framer.app',
  'sharepoint.com', 'svc.ms', 'zendesk.com', 'freshdesk.com',
  'readthedocs.io', 'surge.sh', 'github.dev',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIpAddress(hostname) {
  return IPV4.test(hostname) || hostname.includes(':') || hostname.startsWith('[');
}

export function registrableDomain(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || isIpAddress(host)) return host;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_LEVEL.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

export function isSharedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (SHARED.has(host)) return true;
  const reg = registrableDomain(host);
  if (SHARED.has(reg)) return true;
  // 2 階層 TLD + 共有ドメイン (例: foo.github.io は github.io が共有)
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (SHARED.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/**
 * アカウントに保存するサイトキー。
 * 共有ホストではホスト名そのもの、通常は eTLD+1。
 */
export function siteKeyFor(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || isIpAddress(host)) return host;
  if (isSharedHost(host)) return host;
  return registrableDomain(host);
}

export function hostMatchesSites(sites, hostname) {
  if (!Array.isArray(sites) || sites.length === 0) return false;
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  const reg = registrableDomain(host);
  const shared = isSharedHost(host);

  for (const raw of sites) {
    const site = String(raw || '').toLowerCase();
    if (!site) continue;
    if (site === host) return true;
    if (site === reg && !shared) return true;
  }
  return false;
}
